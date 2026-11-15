import * as asn1js from 'asn1js';
import { describePublicKey } from '../inspector/algorithms';
import { spkiPinOf } from '../inspector/fingerprint';
import { commonNameOf, describeName } from '../inspector/format';
import { toHex } from '../lint/bytes';
import { OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION } from '../lint/checks/common';
import { readPublicKey, type FoundPublicKey, type KeyHolder } from './publicKey';

export type { KeyHolder };

/** One of the two PEMs compared: what holds the key, and the key, e.g. "ECDSA (P-256)". */
export interface MatchedPem {
    readonly holder: KeyHolder;
    /** The certificate's or CSR's subject: its common name, or the whole name when it has none. */
    readonly subject?: string;
    readonly key: string;
    /**
     * pin-sha256 (RFC 7469) of the public key as the PEM writes it, or for a private key as `openssl pkey -pubout` writes it:
     * the Public Key Pin the Inspector shows, and what `openssl dgst -sha256 -binary | base64` gives for the DER.
     */
    readonly pin: string;
    /** How many other blocks in the PEM hold a key too, and were not compared. */
    readonly otherBlocks: number;
}

/**
 * What the verdict rests on: the RSA modulus and exponent, the EC curve and point,
 * the key types alone when they differ, or else the two keys as they are encoded.
 */
export type MatchBasis = 'rsa' | 'ec' | 'type' | 'encoded';

export interface KeyMatch {
    /** Whether both PEMs hold the same public key, and so belong to the same key pair. */
    readonly same: boolean;
    readonly basis: MatchBasis;
    readonly first: MatchedPem;
    readonly second: MatchedPem;
}

/** What makes a public key the key it is, however it is encoded. */
interface Identity {
    /** The type of key, which two keys must share to be the same: RSA whichever OID marks it, EC, or else the algorithm OID. */
    readonly type: string;
    readonly basis: Exclude<MatchBasis, 'type'>;
    readonly value: string;
    /** The Y of an EC point written whole, which must agree with the other key's when that one is written whole too. */
    readonly y?: string;
}

/**
 * Whether two identities are the same key. A compressed EC point gives only Y's parity, which picks the one point on the curve
 * with that X; two points written whole must agree on all of Y, so that a point off the curve is not taken for another.
 */
const sameKey = (a: Identity, b: Identity): boolean => a.value === b.value && (a.y === undefined || b.y === undefined || a.y === b.y);

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
 * An EC point as X and the parity of Y, with Y itself when the point is written whole, so that its compressed (02 or 03, then X),
 * uncompressed (04, X, Y) and X9.62 hybrid (06 or 07, X, Y) forms compare equal. A hybrid point whose first byte gives the other
 * parity than its Y contradicts itself, and is compared as encoded.
 */
function ecIdentity(curve: string, point: Uint8Array): Pick<Identity, 'value' | 'y'> | undefined {
    const [form] = point;
    if ((form === 0x02 || form === 0x03) && point.length > 1) return { value: `EC:${curve}:${toHex(point.subarray(1))}:${form & 1}` };
    if ((form === 0x04 || form === 0x06 || form === 0x07) && point.length > 1 && point.length % 2 === 1) {
        const size = (point.length - 1) / 2;
        const parity = point[point.length - 1] & 1;
        if (form !== 0x04 && (form & 1) !== parity) return undefined;
        return { value: `EC:${curve}:${toHex(point.subarray(1, 1 + size))}:${parity}`, y: toHex(point.subarray(1 + size)) };
    }
    return undefined;
}

/**
 * What makes two SubjectPublicKeyInfos the same key, however each one encodes it.
 * readPublicKey has checked the SPKI's shape, so the DER fallback is only a guard.
 */
function keyIdentity(spki: Uint8Array): Identity {
    const parsed = asn1js.fromBER(spki);
    const [algorithm, key] = parsed.result instanceof asn1js.Sequence ? parsed.result.valueBlock.value : [];
    const [algorithmOid, parameters] = algorithm instanceof asn1js.Sequence ? algorithm.valueBlock.value : [];
    const oid = oidOf(algorithmOid);
    if (oid === undefined || !(key instanceof asn1js.BitString)) return { type: 'DER', basis: 'encoded', value: `DER:${toHex(spki)}` };
    const keyBytes = bytesOf(key);
    const parametersHex = parameters ? toHex(new Uint8Array(parameters.valueBeforeDecodeView)) : '';
    const asEncoded = (type: string): Identity => ({ type, basis: 'encoded', value: `${oid}:${parametersHex}:${toHex(keyBytes)}` });
    if (oid === OID_RSA_ENCRYPTION || oid === OID_RSASSA_PSS) {
        const value = rsaIdentity(keyBytes);
        return value ? { type: 'RSA', basis: 'rsa', value } : asEncoded('RSA');
    }
    if (oid === OID_EC_PUBLIC_KEY) {
        const curve = oidOf(parameters);
        const point = curve !== undefined && PRIME_CURVES.has(curve) ? ecIdentity(curve, keyBytes) : undefined;
        return point ? { type: 'EC', basis: 'ec', ...point } : asEncoded('EC');
    }
    return asEncoded(oid);
}

/** Keys of different types are told apart by that alone; keys of one type, by what both identities rest on. */
function basisOf(first: Identity, second: Identity): MatchBasis {
    if (first.type !== second.type) return 'type';
    return first.basis === second.basis ? first.basis : 'encoded';
}

/** Reads one of the PEMs, naming it in the message of any error. */
async function readPem(name: string, text: string): Promise<FoundPublicKey> {
    try {
        return await readPublicKey(text);
    } catch (e: unknown) {
        throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
}

/** A subject by its common name, as the Inspector labels a certificate, or else by the whole name; an empty one names nothing. */
const subjectName = (subject: Uint8Array): string => commonNameOf(subject) || describeName(subject);

function matched({ holder, spki, subject, otherBlocks }: FoundPublicKey): MatchedPem {
    const name = subject ? subjectName(subject) : '';
    return { holder, ...(name ? { subject: name } : {}), key: describePublicKey(spki), pin: spkiPinOf(spki), otherBlocks };
}

/**
 * Checks whether two PEMs hold the same public key: a private key and the certificate or CSR made for it,
 * a CSR and the certificate issued from it, or two certificates that share a key.
 * Throws an Error whose message names the PEM at fault and can be shown as is.
 */
export async function matchKeys(first: string, second: string): Promise<KeyMatch> {
    const a = await readPem('First PEM', first);
    const b = await readPem('Second PEM', second);
    const [x, y] = [keyIdentity(a.spki), keyIdentity(b.spki)];
    return { same: sameKey(x, y), basis: basisOf(x, y), first: matched(a), second: matched(b) };
}

const plural = (holder: KeyHolder): string => (holder === 'CSR' ? 'CSRs' : `${holder}s`);

/** The verdict in a sentence, e.g. "The private key and the certificate are for the same key pair." */
export function describeMatch({ same, first, second }: KeyMatch): string {
    const pairs = same ? 'the same key pair' : 'different key pairs';
    if (first.holder === second.holder) return `${same ? 'Both' : 'The two'} ${plural(first.holder)} are for ${pairs}.`;
    return `The ${first.holder} and the ${second.holder} are for ${pairs}.`;
}

const BASES: Readonly<Record<MatchBasis, string>> = {
    rsa: 'Compared the RSA modulus and public exponent of each key.',
    ec: 'Compared the curve and the point of each key.',
    type: 'The keys are of different types.',
    encoded: 'Compared the two public keys byte for byte.',
};

/**
 * What the verdict rests on, in a sentence or two. The same key can be written two ways, e.g. with its EC point compressed or
 * marked for RSASSA-PSS, and then the pins shown beside it differ, so that is explained rather than left to look like a contradiction.
 */
export function describeBasis({ same, basis, first, second }: KeyMatch): string {
    const encodedApart = same && first.pin !== second.pin;
    return encodedApart ? `${BASES[basis]} The pins differ only because the two PEMs write the same key differently.` : BASES[basis];
}

/** What one PEM held, e.g. "certificate for www.example.com, RSA (2048 bits); 2 other blocks in it were not compared". */
export function describePem({ holder, subject, key, otherBlocks }: MatchedPem): string {
    const held = `${holder}${subject ? ` for ${subject}` : ''}, ${key}`;
    if (otherBlocks === 0) return held;
    return `${held}; ${otherBlocks} other block${otherBlocks === 1 ? ' in it was' : 's in it were'} not compared`;
}
