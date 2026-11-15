import * as asn1js from 'asn1js';
import { OID_RSA_ENCRYPTION } from '../lint/checks/common';
import { decodeBase64, pemBlocks, toPem } from './pem';
import { describeKey, publicKeyOf, readPrivateKey } from './privateKey';

/** What holds a public key in pasted PEM. */
export type KeyHolder = 'private key' | 'certificate' | 'CSR' | 'public key';

/** A public key found in pasted PEM. */
export interface FoundPublicKey {
    /** The SubjectPublicKeyInfo as DER. */
    readonly spki: Uint8Array;
    /** What it was taken from, e.g. "Certificate" or "Private Key (ECDSA P-256)". */
    readonly source: string;
    readonly holder: KeyHolder;
    /** The subject Name of the certificate or CSR, as DER; a key has none. */
    readonly subject?: Uint8Array;
    /** How many other blocks in the text hold a key too, such as the intermediates of a full chain; they are not read. */
    readonly otherBlocks: number;
}

/** A public key taken from pasted PEM. */
export interface DerivedPublicKey {
    /** The SubjectPublicKeyInfo as a PUBLIC KEY block, as `openssl pkey -pubout` writes it. */
    readonly pem: string;
    /** What it was taken from, e.g. "Certificate" or "Private Key (ECDSA P-256)". */
    readonly source: string;
}

const NOT_FOUND = 'Paste a private key, certificate, CSR or public key in PEM, from its -----BEGIN line to its -----END line.';

type Value = asn1js.AsnType | undefined;
type Der = Uint8Array<ArrayBuffer>;

/** The one ASN.1 value the DER holds; undefined when it holds anything else, or more. */
function parseDer(der: Der): Value {
    const parsed = asn1js.fromBER(der);
    return parsed.offset === der.byteLength ? parsed.result : undefined;
}

const valuesOf = (value: Value): asn1js.AsnType[] => (value instanceof asn1js.Sequence ? value.valueBlock.value : []);
const isSequence = (value: Value): boolean => value instanceof asn1js.Sequence;
const isContextTag = (value: Value, tagNumber: number): boolean => value?.idBlock.tagClass === 3 && value.idBlock.tagNumber === tagNumber;

/** SubjectPublicKeyInfo (RFC 5280 §4.1.2.7): an AlgorithmIdentifier that starts with an OID, then the key in a BIT STRING. */
function isSpki(value: Value): boolean {
    const [algorithm, key, ...rest] = valuesOf(value);
    const [oid] = valuesOf(algorithm);
    return isSequence(value) && rest.length === 0 && oid instanceof asn1js.ObjectIdentifier && key instanceof asn1js.BitString;
}

/** A decoded value's bytes exactly as they were encoded. */
const derOf = (value: Value): Uint8Array => new Uint8Array((value as asn1js.BaseBlock).valueBeforeDecodeView);

/** The SubjectPublicKeyInfo exactly as it is encoded where it was found, so it matches what openssl takes out. */
const spkiBytes = (value: Value): Uint8Array | undefined => (isSpki(value) ? derOf(value) : undefined);

/** What a block holds: its public key, and the subject of a certificate or CSR. */
interface Read {
    readonly spki: Uint8Array;
    readonly subject?: Uint8Array;
}

/** A certificate's or CSR's key with its subject, once the key has been found; the subject is a SEQUENCE by then. */
const withSubject = (spki: Uint8Array | undefined, subject: Value): Read | undefined => (spki ? { spki, subject: derOf(subject) } : undefined);

/** The TBS part of a signed object, which a Certificate and a CertificationRequest both wrap with a signature algorithm and signature. */
function signedPart(der: Der): asn1js.AsnType[] | undefined {
    const [signed, signatureAlgorithm, signature, ...rest] = valuesOf(parseDer(der));
    const isSigned = rest.length === 0 && isSequence(signatureAlgorithm) && signature instanceof asn1js.BitString;
    return isSigned ? valuesOf(signed) : undefined;
}

/** Certificate (RFC 5280 §4.1): the key follows the serial number, signature, issuer, validity and subject; v1 has no version before them. */
function fromCertificate(der: Der): Read | undefined {
    const fields = signedPart(der) ?? [];
    const [serial, signature, issuer, validity, subject, spki] = isContextTag(fields[0], 0) ? fields.slice(1) : fields;
    const isTbs = serial instanceof asn1js.Integer && [signature, issuer, validity, subject].every(isSequence);
    return withSubject(isTbs ? spkiBytes(spki) : undefined, subject);
}

/** CertificationRequest (RFC 2986 §4.1): the key follows the version and subject. */
function fromCsr(der: Der): Read | undefined {
    const [version, subject, spki] = signedPart(der) ?? [];
    return withSubject(version instanceof asn1js.Integer && isSequence(subject) ? spkiBytes(spki) : undefined, subject);
}

/** A PUBLIC KEY block holds a SubjectPublicKeyInfo as it is. */
function fromSpki(der: Der): Read | undefined {
    const spki = spkiBytes(parseDer(der));
    return spki ? { spki } : undefined;
}

/** RSAPublicKey (RFC 8017 §A.1.1), as `openssl rsa -RSAPublicKey_out` writes it, wrapped the way `openssl rsa -RSAPublicKey_in -pubout` would. */
function fromPkcs1(der: Der): Read | undefined {
    const values = valuesOf(parseDer(der));
    if (values.length !== 2 || !values.every(value => value instanceof asn1js.Integer)) return undefined;
    const algorithm = new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: OID_RSA_ENCRYPTION }), new asn1js.Null()] });
    return { spki: new Uint8Array(new asn1js.Sequence({ value: [algorithm, new asn1js.BitString({ valueHex: der })] }).toBER()) };
}

interface Reader {
    readonly source: string;
    readonly holder: KeyHolder;
    /** What the block should hold, for the message when it holds something else. */
    readonly holds: string;
    readonly read: (der: Der) => Read | undefined;
}

const CERTIFICATE: Reader = { source: 'Certificate', holder: 'certificate', holds: 'certificate', read: fromCertificate };
const CSR: Reader = { source: 'CSR', holder: 'CSR', holds: 'CSR', read: fromCsr };

/** The blocks a public key can be taken from, by their label; the legacy labels are the ones the Inspector reads too. */
const READERS: ReadonlyMap<string, Reader> = new Map([
    ['CERTIFICATE', CERTIFICATE],
    ['X509 CERTIFICATE', CERTIFICATE],
    ['CERTIFICATE REQUEST', CSR],
    ['NEW CERTIFICATE REQUEST', CSR],
    ['PUBLIC KEY', { source: 'Public Key', holder: 'public key', holds: 'public key', read: fromSpki }],
    ['RSA PUBLIC KEY', { source: 'RSA Public Key (PKCS#1)', holder: 'public key', holds: 'PKCS#1 public key', read: fromPkcs1 }],
]);

const isPrivateKey = (label: string): boolean => label.endsWith('PRIVATE KEY');

/**
 * Finds the public key in pasted PEM: in a private key wherever it is in the text,
 * or else in the first certificate, CSR or public key. A block that is there but broken is reported rather than skipped.
 * Throws an Error whose message can be shown as is.
 */
export async function readPublicKey(text: string): Promise<FoundPublicKey> {
    const blocks = pemBlocks(text);
    const otherBlocks = blocks.filter(block => isPrivateKey(block.label) || READERS.has(block.label)).length - 1;
    if (blocks.some(block => isPrivateKey(block.label))) {
        // PKCS#8, PKCS#1 or SEC1; the key block is found even when a certificate comes first.
        const key = readPrivateKey(text);
        return { spki: await publicKeyOf(key), source: `Private Key (${describeKey(key.algorithm)})`, holder: 'private key', otherBlocks };
    }
    for (const { label, content } of blocks) {
        const reader = READERS.get(label);
        if (!reader) continue;
        const der = decodeBase64(content);
        if (!der) throw new Error(`The ${label} block is not valid base64.`);
        const found = reader.read(der);
        if (!found) throw new Error(`The ${label} block is not a valid ${reader.holds}.`);
        return { ...found, source: reader.source, holder: reader.holder, otherBlocks };
    }
    throw new Error(NOT_FOUND);
}

/** The public key in pasted PEM as a PUBLIC KEY block; see readPublicKey for where it is taken from. */
export async function derivePublicKey(text: string): Promise<DerivedPublicKey> {
    const { spki, source } = await readPublicKey(text);
    return { pem: toPem('PUBLIC KEY', spki), source };
}
