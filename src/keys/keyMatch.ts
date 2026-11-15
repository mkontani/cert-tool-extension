import * as asn1js from 'asn1js';
import { describePublicKey } from '../inspector/algorithms';
import { toHex } from '../lint/bytes';
import { OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION } from '../lint/checks/common';
import { readPublicKey, type FoundPublicKey, type KeyHolder } from './publicKey';

export type { KeyHolder };

/** One of the two PEMs compared: what holds the key, and the key, e.g. "ECDSA (P-256)". */
export interface MatchedPem {
    readonly holder: KeyHolder;
    readonly key: string;
    /** How many other blocks in the PEM hold a key too, and were not compared. */
    readonly otherBlocks: number;
}

export interface KeyMatch {
    /** Whether both PEMs hold the same public key, and so belong to the same key pair. */
    readonly same: boolean;
    readonly first: MatchedPem;
    readonly second: MatchedPem;
}

const OID_RSASSA_PSS = '1.2.840.113549.1.1.10';

/**
 * The named curves over a prime field, where a compressed point names its Y by the Y's parity (SEC 1 §2.3.3).
 * Binary-field curves (sect*, c2*) compress another bit, so on them, and on any curve not listed, points are compared as encoded.
 */
const PRIME_CURVES: ReadonlySet<string> = new Set([
    // ANSI X9.62 prime192v1 (P-192) to prime256v1 (P-256).
    ...[1, 2, 3, 4, 5, 6, 7].map(n => `1.2.840.10045.3.1.${n}`),
    // SEC 2 secp112r1 to secp521r1, with P-224, P-384, P-521 and secp256k1.
    ...[6, 7, 8, 9, 10, 28, 29, 30, 31, 32, 33, 34, 35].map(n => `1.3.132.0.${n}`),
    // RFC 5639 brainpoolP160r1 to brainpoolP512t1.
    ...Array.from({ length: 14 }, (_, i) => `1.3.36.3.3.2.8.1.1.${i + 1}`),
    '1.2.156.10197.1.301', // SM2
]);

const bytesOf = (value: asn1js.BitString | asn1js.Integer): Uint8Array => new Uint8Array(value.valueBlock.valueHexView);
const oidOf = (value: asn1js.AsnType | undefined): string | undefined =>
    value instanceof asn1js.ObjectIdentifier ? value.valueBlock.toString() : undefined;

/** An integer's bytes without the leading zeros a DER encoding adds before a high bit, or a loose one adds anyway. */
function magnitude(bytes: Uint8Array): Uint8Array {
    const start = bytes.findIndex(byte => byte !== 0);
    return start === -1 ? new Uint8Array() : bytes.subarray(start);
}

/** RSAPublicKey (RFC 8017 §A.1.1): the modulus and the exponent are the key, whichever OID marks it. */
function rsaIdentity(key: Uint8Array): string | undefined {
    const parsed = asn1js.fromBER(key);
    const values = parsed.offset === key.byteLength && parsed.result instanceof asn1js.Sequence ? parsed.result.valueBlock.value : [];
    if (values.length !== 2) return undefined;
    const [modulus, exponent] = values;
    if (!(modulus instanceof asn1js.Integer) || !(exponent instanceof asn1js.Integer)) return undefined;
    return `RSA:${toHex(magnitude(bytesOf(modulus)))}:${toHex(magnitude(bytesOf(exponent)))}`;
}

/**
 * An EC point as X and the parity of Y, so that its compressed (02 or 03, then X), uncompressed (04, X, Y)
 * and X9.62 hybrid (06 or 07, X, Y) forms compare equal.
 */
function ecIdentity(curve: string, point: Uint8Array): string | undefined {
    const [form] = point;
    if ((form === 0x02 || form === 0x03) && point.length > 1) return `EC:${curve}:${toHex(point.subarray(1))}:${form & 1}`;
    if ((form === 0x04 || form === 0x06 || form === 0x07) && point.length > 1 && point.length % 2 === 1) {
        const size = (point.length - 1) / 2;
        return `EC:${curve}:${toHex(point.subarray(1, 1 + size))}:${point[point.length - 1] & 1}`;
    }
    return undefined;
}

/**
 * What makes two SubjectPublicKeyInfos the same key, however each one encodes it.
 * readPublicKey has checked the SPKI's shape, so the DER fallback is only a guard.
 */
function keyIdentity(spki: Uint8Array): string {
    const parsed = asn1js.fromBER(spki);
    const [algorithm, key] = parsed.result instanceof asn1js.Sequence ? parsed.result.valueBlock.value : [];
    const [algorithmOid, parameters] = algorithm instanceof asn1js.Sequence ? algorithm.valueBlock.value : [];
    const oid = oidOf(algorithmOid);
    if (oid === undefined || !(key instanceof asn1js.BitString)) return `DER:${toHex(spki)}`;
    const keyBytes = bytesOf(key);
    if (oid === OID_RSA_ENCRYPTION || oid === OID_RSASSA_PSS) {
        const identity = rsaIdentity(keyBytes);
        if (identity) return identity;
    }
    const curve = oidOf(parameters);
    if (oid === OID_EC_PUBLIC_KEY && curve !== undefined && PRIME_CURVES.has(curve)) {
        const identity = ecIdentity(curve, keyBytes);
        if (identity) return identity;
    }
    const parametersHex = parameters ? toHex(new Uint8Array(parameters.valueBeforeDecodeView)) : '';
    return `${oid}:${parametersHex}:${toHex(keyBytes)}`;
}

/** Reads one of the PEMs, naming it in the message of any error. */
async function readPem(name: string, text: string): Promise<FoundPublicKey> {
    try {
        return await readPublicKey(text);
    } catch (e: unknown) {
        throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
}

const matched = ({ holder, spki, otherBlocks }: FoundPublicKey): MatchedPem => ({ holder, key: describePublicKey(spki), otherBlocks });

/**
 * Checks whether two PEMs hold the same public key: a private key and the certificate or CSR made for it,
 * a CSR and the certificate issued from it, or two certificates that share a key.
 * Throws an Error whose message names the PEM at fault and can be shown as is.
 */
export async function matchKeys(first: string, second: string): Promise<KeyMatch> {
    const a = await readPem('First PEM', first);
    const b = await readPem('Second PEM', second);
    return { same: keyIdentity(a.spki) === keyIdentity(b.spki), first: matched(a), second: matched(b) };
}

const plural = (holder: KeyHolder): string => (holder === 'CSR' ? 'CSRs' : `${holder}s`);

/** The verdict in a sentence, e.g. "The private key and the certificate are for the same key pair." */
export function describeMatch({ same, first, second }: KeyMatch): string {
    const pairs = same ? 'the same key pair' : 'different key pairs';
    if (first.holder === second.holder) return `${same ? 'Both' : 'The two'} ${plural(first.holder)} are for ${pairs}.`;
    return `The ${first.holder} and the ${second.holder} are for ${pairs}.`;
}

/** What one PEM held, e.g. "certificate, RSA (2048 bits); 2 other blocks in it were not compared". */
export function describePem({ holder, key, otherBlocks }: MatchedPem): string {
    if (otherBlocks === 0) return `${holder}, ${key}`;
    return `${holder}, ${key}; ${otherBlocks} other block${otherBlocks === 1 ? ' in it was' : 's in it were'} not compared`;
}
