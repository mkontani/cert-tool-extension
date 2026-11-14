import * as asn1js from 'asn1js';
import { OID_RSA_ENCRYPTION } from '../lint/checks/common';
import { decodeBase64, pemBlocks, toPem } from './pem';
import { describeKey, publicKeyOf, readPrivateKey } from './privateKey';

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

/** The SubjectPublicKeyInfo exactly as it is encoded where it was found, so it matches what openssl takes out. */
const spkiBytes = (value: Value): Uint8Array | undefined =>
    isSpki(value) ? new Uint8Array((value as asn1js.BaseBlock).valueBeforeDecodeView) : undefined;

/** The TBS part of a signed object, which a Certificate and a CertificationRequest both wrap with a signature algorithm and signature. */
function signedPart(der: Der): asn1js.AsnType[] | undefined {
    const [signed, signatureAlgorithm, signature, ...rest] = valuesOf(parseDer(der));
    const isSigned = rest.length === 0 && isSequence(signatureAlgorithm) && signature instanceof asn1js.BitString;
    return isSigned ? valuesOf(signed) : undefined;
}

/** Certificate (RFC 5280 §4.1): the key follows the serial number, signature, issuer, validity and subject; v1 has no version before them. */
function fromCertificate(der: Der): Uint8Array | undefined {
    const fields = signedPart(der) ?? [];
    const [serial, signature, issuer, validity, subject, spki] = isContextTag(fields[0], 0) ? fields.slice(1) : fields;
    const isTbs = serial instanceof asn1js.Integer && [signature, issuer, validity, subject].every(isSequence);
    return isTbs ? spkiBytes(spki) : undefined;
}

/** CertificationRequest (RFC 2986 §4.1): the key follows the version and subject. */
function fromCsr(der: Der): Uint8Array | undefined {
    const [version, subject, spki] = signedPart(der) ?? [];
    return version instanceof asn1js.Integer && isSequence(subject) ? spkiBytes(spki) : undefined;
}

/** A PUBLIC KEY block holds a SubjectPublicKeyInfo as it is. */
const fromSpki = (der: Der): Uint8Array | undefined => spkiBytes(parseDer(der));

/** RSAPublicKey (RFC 8017 §A.1.1), as `openssl rsa -RSAPublicKey_out` writes it, wrapped the way `openssl rsa -RSAPublicKey_in -pubout` would. */
function fromPkcs1(der: Der): Uint8Array | undefined {
    const values = valuesOf(parseDer(der));
    if (values.length !== 2 || !values.every(value => value instanceof asn1js.Integer)) return undefined;
    const algorithm = new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: OID_RSA_ENCRYPTION }), new asn1js.Null()] });
    return new Uint8Array(new asn1js.Sequence({ value: [algorithm, new asn1js.BitString({ valueHex: der })] }).toBER());
}

interface Reader {
    readonly source: string;
    /** What the block should hold, for the message when it holds something else. */
    readonly holds: string;
    readonly read: (der: Der) => Uint8Array | undefined;
}

const CERTIFICATE: Reader = { source: 'Certificate', holds: 'certificate', read: fromCertificate };
const CSR: Reader = { source: 'CSR', holds: 'CSR', read: fromCsr };

/** The blocks a public key can be taken from, by their label; the legacy labels are the ones the Inspector reads too. */
const READERS: ReadonlyMap<string, Reader> = new Map([
    ['CERTIFICATE', CERTIFICATE],
    ['X509 CERTIFICATE', CERTIFICATE],
    ['CERTIFICATE REQUEST', CSR],
    ['NEW CERTIFICATE REQUEST', CSR],
    ['PUBLIC KEY', { source: 'Public Key', holds: 'public key', read: fromSpki }],
    ['RSA PUBLIC KEY', { source: 'RSA Public Key (PKCS#1)', holds: 'PKCS#1 public key', read: fromPkcs1 }],
]);

/**
 * Takes the public key from pasted PEM: from a private key wherever it is in the text,
 * or else from the first certificate, CSR or public key. A block that is there but broken is reported rather than skipped.
 * Throws an Error whose message can be shown as is.
 */
export async function derivePublicKey(text: string): Promise<DerivedPublicKey> {
    const blocks = pemBlocks(text);
    if (blocks.some(block => block.label.endsWith('PRIVATE KEY'))) {
        // PKCS#8, PKCS#1 or SEC1; the key block is found even when a certificate comes first.
        const key = readPrivateKey(text);
        return { pem: toPem('PUBLIC KEY', await publicKeyOf(key)), source: `Private Key (${describeKey(key.algorithm)})` };
    }
    for (const { label, content } of blocks) {
        const reader = READERS.get(label);
        if (!reader) continue;
        const der = decodeBase64(content);
        if (!der) throw new Error(`The ${label} block is not valid base64.`);
        const spki = reader.read(der);
        if (!spki) throw new Error(`The ${label} block is not a valid ${reader.holds}.`);
        return { pem: toPem('PUBLIC KEY', spki), source: reader.source };
    }
    throw new Error(NOT_FOUND);
}
