import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import {
    AttributeTypeAndValue, AttributeValue, Extension, Extensions, GeneralName, id_ce_subjectAltName, Name, RelativeDistinguishedName,
    SubjectAlternativeName,
} from '@peculiar/asn1-x509';
import * as asn1js from 'asn1js';
import { formatIp } from '../lint/net';
import { toPem } from './pem';
import { publicKeyOf, readPrivateKey } from './privateKey';
import { isEmailAddress, parseSans, type SanEntry } from './san';
import { sign } from './signing';

/** The subject fields of the CSR form; empty ones are left out. */
export interface CsrSubject {
    readonly commonName: string;
    readonly organization: string;
    readonly organizationalUnit: string;
    readonly country: string;
    readonly state: string;
    readonly locality: string;
    readonly email: string;
}

export interface CsrRequest {
    readonly subject: CsrSubject;
    /** The SANs field as typed: names separated by commas, spaces or new lines. */
    readonly sans: string;
    /** The private key as pasted: PKCS#8, PKCS#1 or SEC1 PEM. */
    readonly privateKey: string;
}

type StringType = 'utf8String' | 'printableString' | 'ia5String';

interface SubjectAttribute {
    readonly field: keyof CsrSubject;
    /** The field's name on the form, for error messages. */
    readonly label: string;
    readonly oid: string;
    readonly type: StringType;
    /** The upper bound RFC 5280 (Appendix A.1) sets for the attribute, in characters. */
    readonly maxLength: number;
}

/** Subject attributes in the order the form lists them. RFC 5280 asks for UTF8String; countryName and emailAddress have fixed types. */
const SUBJECT_ATTRIBUTES: readonly SubjectAttribute[] = [
    { field: 'commonName', label: 'Common Name', oid: '2.5.4.3', type: 'utf8String', maxLength: 64 },
    { field: 'organization', label: 'Organization', oid: '2.5.4.10', type: 'utf8String', maxLength: 64 },
    { field: 'organizationalUnit', label: 'OU', oid: '2.5.4.11', type: 'utf8String', maxLength: 64 },
    { field: 'country', label: 'Country', oid: '2.5.4.6', type: 'printableString', maxLength: 2 },
    { field: 'state', label: 'State', oid: '2.5.4.8', type: 'utf8String', maxLength: 128 },
    { field: 'locality', label: 'Locality', oid: '2.5.4.7', type: 'utf8String', maxLength: 128 },
    { field: 'email', label: 'Email', oid: '1.2.840.113549.1.9.1', type: 'ia5String', maxLength: 255 },
];

/** A UTF-16 surrogate without its other half, which cannot be encoded as UTF-8. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const CONTROL_CHARACTER = /[\x00-\x1f\x7f-\x9f]/;

const OID_EXTENSION_REQUEST = '1.2.840.113549.1.9.14';

/** Why a trimmed subject value cannot be encoded or would be rejected by a CA, or null when it is fine. */
function subjectValueProblem({ field, label, maxLength }: SubjectAttribute, value: string): string | null {
    if (LONE_SURROGATE.test(value)) return `${label} contains a broken character.`;
    if (CONTROL_CHARACTER.test(value)) return `${label} must not contain control characters.`;
    if (field === 'country') return /^[A-Za-z]{2}$/.test(value) ? null : 'Country must be a two-letter code, such as US or JP.';
    if (field === 'email' && (/[^\x20-\x7e]/.test(value) || !isEmailAddress(value))) return 'Email must be a valid email address.';
    // Counted in characters, not UTF-16 code units, so an emoji counts once.
    return [...value].length > maxLength ? `${label} must be at most ${maxLength} characters.` : null;
}

/** The trimmed subject fields, checked where encoding would fail or a CA would reject them. */
function validSubject(subject: CsrSubject): CsrSubject {
    const trimmed = Object.fromEntries(Object.entries(subject).map(([field, value]) => [field, value.trim()])) as unknown as CsrSubject;
    for (const attribute of SUBJECT_ATTRIBUTES) {
        const value = trimmed[attribute.field];
        const problem = value === '' ? null : subjectValueProblem(attribute, value);
        if (problem) throw new Error(problem);
    }
    return { ...trimmed, country: trimmed.country.toUpperCase() };
}

function subjectName(subject: CsrSubject): Name {
    const rdns = SUBJECT_ATTRIBUTES.filter(({ field }) => subject[field] !== '').map(({ field, oid, type }) =>
        new RelativeDistinguishedName([new AttributeTypeAndValue({ type: oid, value: new AttributeValue({ [type]: subject[field] }) })]));
    return new Name(rdns);
}

function generalName(san: SanEntry): GeneralName {
    switch (san.kind) {
        case 'dns':
            return new GeneralName({ dNSName: san.value });
        case 'email':
            return new GeneralName({ rfc822Name: san.value });
        case 'uri':
            return new GeneralName({ uniformResourceIdentifier: san.value });
        case 'ip':
            return new GeneralName({ iPAddress: formatIp(san.bytes) });
    }
}

/** The extensionRequest attribute (PKCS #9) asking for the SANs, or none when there are no SANs. */
function attributes(sans: readonly SanEntry[]): asn1js.AsnType[] {
    if (sans.length === 0) return [];
    const san = new SubjectAlternativeName(sans.map(generalName));
    const extensions = new Extensions([new Extension({ extnID: id_ce_subjectAltName, extnValue: new OctetString(AsnConvert.serialize(san)) })]);
    return [new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: OID_EXTENSION_REQUEST }), new asn1js.Set({ value: [fromDer(AsnConvert.serialize(extensions))] })],
    })];
}

const fromDer = (der: ArrayBuffer | Uint8Array<ArrayBuffer>): asn1js.AsnType => asn1js.fromBER(der).result;

/** DER length octets (X.690 §8.1.3): the short form below 128, else the long form. */
function derLength(length: number): number[] {
    if (length < 0x80) return [length];
    const bytes = [];
    for (let rest = length; rest > 0; rest = Math.floor(rest / 0x100)) bytes.unshift(rest % 0x100);
    return [0x80 | bytes.length, ...bytes];
}

/** A SEQUENCE of already encoded values, kept byte for byte, so the signed CertificationRequestInfo is not re-encoded. */
function derSequence(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const header = [0x30, ...derLength(length)];
    const out = new Uint8Array(header.length + length);
    out.set(header);
    let offset = header.length;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/** CertificationRequestInfo (RFC 2986): version 0, subject, the public key, and [0] attributes. */
function certificationRequestInfo(subject: Name, spki: Uint8Array<ArrayBuffer>, sans: readonly SanEntry[]): Uint8Array<ArrayBuffer> {
    const info = new asn1js.Sequence({
        value: [
            new asn1js.Integer({ value: 0 }),
            fromDer(AsnConvert.serialize(subject)),
            fromDer(spki),
            new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: attributes(sans) }),
        ],
    });
    return new Uint8Array(info.toBER());
}

/**
 * Builds a CSR for the subject and SANs and signs it with the key, all with WebCrypto in the popup.
 * Checks the form before it touches the key, and throws Errors whose messages can be shown as is.
 */
export async function createCsr({ subject, sans, privateKey }: CsrRequest): Promise<string> {
    const names = parseSans(sans);
    const name = subjectName(validSubject(subject));
    const key = readPrivateKey(privateKey);
    const info = certificationRequestInfo(name, await publicKeyOf(key), names);
    const signature = await sign(key, info);
    const algorithm = new Uint8Array(signature.algorithm.toBER());
    const value = new Uint8Array(new asn1js.BitString({ valueHex: signature.value }).toBER());
    return toPem('CERTIFICATE REQUEST', derSequence([info, algorithm, value]));
}
