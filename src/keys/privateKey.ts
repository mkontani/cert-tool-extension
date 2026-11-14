import * as asn1js from 'asn1js';
import { curveName, keyAlgorithmName } from '../inspector/algorithms';
import { nameFor } from '../inspector/format';
import { OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION } from '../lint/checks/common';
import { decodeBase64, pemBlocks } from './pem';

const OID_ED25519 = '1.3.101.112';

export type EcCurve = 'P-256' | 'P-384' | 'P-521';

const CURVES: Readonly<Record<string, EcCurve>> = {
    '1.2.840.10045.3.1.7': 'P-256',
    '1.3.132.0.34': 'P-384',
    '1.3.132.0.35': 'P-521',
};

/** The key algorithms Cert Tool can sign with, which are the ones WebCrypto supports. */
export type KeyAlgorithm =
    | { readonly name: 'RSA' }
    | { readonly name: 'ECDSA'; readonly curve: EcCurve }
    | { readonly name: 'Ed25519' };

export interface PrivateKey {
    readonly algorithm: KeyAlgorithm;
    /** The key as PKCS#8 DER, whatever format it was pasted in. */
    readonly pkcs8: Uint8Array<ArrayBuffer>;
}

/** "RSA", "ECDSA P-256" or "Ed25519". */
export const describeKey = (algorithm: KeyAlgorithm): string =>
    algorithm.name === 'ECDSA' ? `ECDSA ${algorithm.curve}` : algorithm.name;

const UNREADABLE = 'The private key could not be read.';
const ENCRYPTED = 'This private key is encrypted. Remove its passphrase first, e.g. with: openssl pkey -in key.pem -out key-plain.pem';
const NOT_FOUND = 'No private key found. Paste a PEM block that starts with -----BEGIN PRIVATE KEY-----.';
const SUPPORTED_ALGORITHMS = 'Use an RSA, ECDSA (P-256, P-384, P-521) or Ed25519 key.';
const SUPPORTED_FORMATS = 'Use a PKCS#8 (BEGIN PRIVATE KEY), PKCS#1 (BEGIN RSA PRIVATE KEY) or SEC1 (BEGIN EC PRIVATE KEY) key.';
const EXPLICIT_CURVE = 'This EC key spells out its curve instead of naming it. Convert it with: openssl ec -in key.pem -param_enc named_curve -out key-named.pem';
const NO_CURVE = 'This EC key does not name its curve, so it cannot be used on its own.';

/** The one ASN.1 value the DER holds, or an error when there is anything else. */
function parseDer(der: Uint8Array<ArrayBuffer>): asn1js.AsnType {
    const parsed = asn1js.fromBER(der);
    if (parsed.offset !== der.byteLength) throw new Error(UNREADABLE);
    return parsed.result;
}

/** The values of a SEQUENCE, or an error when the value is not one. */
function sequenceValues(value: asn1js.AsnType | undefined): asn1js.AsnType[] {
    if (!(value instanceof asn1js.Sequence)) throw new Error(UNREADABLE);
    return value.valueBlock.value;
}

const oidOf = (value: asn1js.AsnType | undefined): string | undefined =>
    value instanceof asn1js.ObjectIdentifier ? value.valueBlock.toString() : undefined;

function algorithmFor(oid: string, parameters: asn1js.AsnType | undefined): KeyAlgorithm {
    if (oid === OID_RSA_ENCRYPTION) return { name: 'RSA' };
    if (oid === OID_ED25519) return { name: 'Ed25519' };
    if (oid === OID_EC_PUBLIC_KEY) {
        // RFC 5480: the curve is named by an OID; explicit parameters (a SEQUENCE) are not allowed in PKIX, and WebCrypto rejects them.
        if (parameters instanceof asn1js.Sequence) throw new Error(EXPLICIT_CURVE);
        const curveOid = oidOf(parameters);
        if (curveOid === undefined) throw new Error(NO_CURVE);
        const curve = nameFor(CURVES, curveOid);
        if (curve) return { name: 'ECDSA', curve };
        throw new Error(`The ${curveName(curveOid)} curve is not supported. ${SUPPORTED_ALGORITHMS}`);
    }
    const name = keyAlgorithmName(oid);
    throw new Error(`${name ? `${name} keys are` : `The key algorithm ${oid} is`} not supported. ${SUPPORTED_ALGORITHMS}`);
}

/** PrivateKeyInfo (RFC 5208): version, AlgorithmIdentifier, and the key in an OCTET STRING. */
function fromPkcs8(der: Uint8Array<ArrayBuffer>): PrivateKey {
    const [version, algorithmId, privateKey] = sequenceValues(parseDer(der));
    if (!(version instanceof asn1js.Integer) || !(privateKey instanceof asn1js.OctetString)) throw new Error(UNREADABLE);
    const [oid, parameters] = sequenceValues(algorithmId);
    const algorithmOid = oidOf(oid);
    if (algorithmOid === undefined) throw new Error(UNREADABLE);
    return { algorithm: algorithmFor(algorithmOid, parameters), pkcs8: der };
}

function wrapPkcs8(algorithmId: asn1js.AsnType[], privateKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const info = new asn1js.Sequence({
        value: [new asn1js.Integer({ value: 0 }), new asn1js.Sequence({ value: algorithmId }), new asn1js.OctetString({ valueHex: privateKey })],
    });
    return new Uint8Array(info.toBER());
}

/** RSAPrivateKey (RFC 8017), as `openssl rsa -traditional` writes it, wrapped the way `openssl pkcs8 -topk8` would. */
function fromPkcs1(der: Uint8Array<ArrayBuffer>): PrivateKey {
    const values = sequenceValues(parseDer(der));
    if (values.length < 9 || !values.every(value => value instanceof asn1js.Integer)) throw new Error(UNREADABLE);
    const algorithmId = [new asn1js.ObjectIdentifier({ value: OID_RSA_ENCRYPTION }), new asn1js.Null()];
    return { algorithm: { name: 'RSA' }, pkcs8: wrapPkcs8(algorithmId, der) };
}

/** The value inside an EXPLICIT [n] tag of a SEC1 key, if it has one. */
function explicitTag(values: asn1js.AsnType[], tagNumber: number): asn1js.AsnType | undefined {
    const tagged = values.find(value => value.idBlock.tagClass === 3 && value.idBlock.tagNumber === tagNumber);
    return tagged instanceof asn1js.Constructed ? tagged.valueBlock.value[0] : undefined;
}

/**
 * ECPrivateKey (RFC 5915), as `openssl ecparam -genkey` writes it, wrapped the way `openssl pkcs8 -topk8` would:
 * the curve moves to the AlgorithmIdentifier, and the key keeps its public key but drops its own copy of the curve.
 */
function fromSec1(der: Uint8Array<ArrayBuffer>): PrivateKey {
    const [version, privateKey, ...tagged] = sequenceValues(parseDer(der));
    if (!(version instanceof asn1js.Integer) || !(privateKey instanceof asn1js.OctetString)) throw new Error(UNREADABLE);
    const curve = explicitTag(tagged, 0);
    const algorithm = algorithmFor(OID_EC_PUBLIC_KEY, curve);
    // algorithmFor accepts only a named curve, so the curve is an OID from here on.
    const publicKey = tagged.filter(value => value.idBlock.tagClass === 3 && value.idBlock.tagNumber === 1);
    const ecPrivateKey = new Uint8Array(new asn1js.Sequence({ value: [version, privateKey, ...publicKey] }).toBER());
    const algorithmId = [new asn1js.ObjectIdentifier({ value: OID_EC_PUBLIC_KEY }), curve as asn1js.ObjectIdentifier];
    return { algorithm, pkcs8: wrapPkcs8(algorithmId, ecPrivateKey) };
}

/**
 * Finds the private key in pasted text, skipping other blocks such as certificates or openssl's EC PARAMETERS,
 * and reads it as PKCS#8. Throws an Error whose message can be shown as is.
 */
export function readPrivateKey(text: string): PrivateKey {
    const block = pemBlocks(text).find(candidate => candidate.label.endsWith('PRIVATE KEY'));
    if (!block) throw new Error(NOT_FOUND);
    if (block.label === 'ENCRYPTED PRIVATE KEY' || /^Proc-Type:\s*4,\s*ENCRYPTED/im.test(block.content)) throw new Error(ENCRYPTED);
    if (!['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY'].includes(block.label)) {
        throw new Error(`"${block.label}" keys are not supported. ${SUPPORTED_FORMATS}`);
    }
    const der = decodeBase64(block.content);
    if (!der) throw new Error(UNREADABLE);
    if (block.label === 'RSA PRIVATE KEY') return fromPkcs1(der);
    if (block.label === 'EC PRIVATE KEY') return fromSec1(der);
    return fromPkcs8(der);
}

/** WebCrypto parameters for importing the key to sign with it; RSA signs with SHA-256 (RSASSA-PKCS1-v1_5). */
export function importParams(algorithm: KeyAlgorithm): RsaHashedImportParams | EcKeyImportParams | Algorithm {
    switch (algorithm.name) {
        case 'RSA':
            return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
        case 'ECDSA':
            return { name: 'ECDSA', namedCurve: algorithm.curve };
        case 'Ed25519':
            return { name: 'Ed25519' };
    }
}

/** Imports the key into WebCrypto, turning its errors into messages that can be shown. */
export async function importPrivateKey(key: PrivateKey, extractable = false): Promise<CryptoKey> {
    try {
        return await crypto.subtle.importKey('pkcs8', key.pkcs8, importParams(key.algorithm), extractable, ['sign']);
    } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'NotSupportedError') {
            throw new Error(`This browser cannot use ${describeKey(key.algorithm)} keys. Update Chrome, or use another key.`);
        }
        throw new Error(UNREADABLE);
    }
}

/** The JWK members of a public key (RFC 7518 §6.2.1 and §6.3.1, RFC 8037 §2); anything else, including all private members, is dropped. */
const PUBLIC_JWK_MEMBERS: ReadonlySet<string> = new Set(['kty', 'crv', 'x', 'y', 'n', 'e']);

/** The key's SubjectPublicKeyInfo as DER. WebCrypto cannot export it from a private key directly, so it goes through JWK. */
export async function publicKeyOf(key: PrivateKey): Promise<Uint8Array<ArrayBuffer>> {
    const params = importParams(key.algorithm);
    const jwk = await crypto.subtle.exportKey('jwk', await importPrivateKey(key, true));
    const publicJwk: JsonWebKey = Object.fromEntries(
        Object.entries(jwk).filter(([member]) => PUBLIC_JWK_MEMBERS.has(member)),
    );
    const publicKey = await crypto.subtle.importKey('jwk', publicJwk, params, true, ['verify']);
    return new Uint8Array(await crypto.subtle.exportKey('spki', publicKey));
}
