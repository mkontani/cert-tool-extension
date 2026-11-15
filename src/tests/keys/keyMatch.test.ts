import { describe, it, expect } from 'vitest';
import * as asn1js from 'asn1js';
import { describeMatch, describePem, matchKeys, type KeyHolder } from '../../keys/keyMatch';
import { CA_CERT, ED25519_LEAF } from '../lint/fixtures';
import { SAN_CSR } from '../inspectorFixtures';
import {
    EC_CERT,
    EC_CSR,
    EC_PKCS8,
    EC_PUBLIC,
    EC_PUBLIC_COMPRESSED,
    EC_SEC1,
    ED25519_PKCS8,
    ED25519_PUBLIC,
    ENCRYPTED_PKCS8,
    P384_PKCS8,
    P384_PUBLIC_COMPRESSED,
    RSA_CERT,
    RSA_PKCS1,
    RSA_PKCS8,
    RSA_PUBLIC,
    RSA_PUBLIC_PKCS1,
} from '../keyFixtures';

const NOT_FOUND = 'Paste a private key, certificate, CSR or public key in PEM, from its -----BEGIN line to its -----END line.';

const derOf = (pem: string) => new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'));
const pemOf = (label: string, bytes: Uint8Array) => `-----BEGIN ${label}-----\n${Buffer.from(bytes).toString('base64')}\n-----END ${label}-----`;

const OID_RSA = '1.2.840.113549.1.1.1';
const OID_EC = '1.2.840.10045.2.1';
const OID_SECP256K1 = '1.3.132.0.10';

/** The AlgorithmIdentifier values and the key bytes of a PUBLIC KEY block. */
function partsOf(pem: string): { algorithm: asn1js.AsnType[]; key: Uint8Array } {
    const [algorithm, key] = (asn1js.fromBER(derOf(pem)).result as asn1js.Sequence).valueBlock.value;
    return { algorithm: (algorithm as asn1js.Sequence).valueBlock.value, key: new Uint8Array((key as asn1js.BitString).valueBlock.valueHexView) };
}

/** A PUBLIC KEY block of the given AlgorithmIdentifier values and key bytes. */
const spkiPem = (algorithm: asn1js.AsnType[], key: Uint8Array) =>
    pemOf('PUBLIC KEY', new Uint8Array(new asn1js.Sequence({ value: [new asn1js.Sequence({ value: algorithm }), new asn1js.BitString({ valueHex: key })] }).toBER()));

/** RSA_PUBLIC's modulus and exponent, as their DER bytes. */
function rsaNumbers(): [Uint8Array, Uint8Array] {
    const [modulus, exponent] = (asn1js.fromBER(partsOf(RSA_PUBLIC).key).result as asn1js.Sequence).valueBlock.value as asn1js.Integer[];
    return [new Uint8Array(modulus.valueBlock.valueHexView), new Uint8Array(exponent.valueBlock.valueHexView)];
}

/** An RSA PUBLIC KEY block of the given integer bytes, under the given AlgorithmIdentifier. */
function rsaPem(modulus: Uint8Array, exponent: Uint8Array, algorithm: asn1js.AsnType[] = [new asn1js.ObjectIdentifier({ value: OID_RSA }), new asn1js.Null()]): string {
    const key = new asn1js.Sequence({ value: [new asn1js.Integer({ valueHex: modulus }), new asn1js.Integer({ valueHex: exponent })] });
    return spkiPem(algorithm, new Uint8Array(key.toBER()));
}

const [MODULUS, EXPONENT] = rsaNumbers();
/** RSA_PUBLIC with each integer written with more leading zeros than DER allows. */
const RSA_PUBLIC_LOOSE = rsaPem(new Uint8Array([0, 0, ...MODULUS]), new Uint8Array([0, ...EXPONENT]));
/** RSA_PUBLIC's modulus with another exponent: another key. */
const RSA_PUBLIC_OTHER_EXPONENT = rsaPem(MODULUS, new Uint8Array([0x03]));
/** RSA_PUBLIC under another AlgorithmIdentifier: the same modulus and exponent, marked differently. */
const RSA_PUBLIC_WITHOUT_NULL = rsaPem(MODULUS, EXPONENT, [new asn1js.ObjectIdentifier({ value: OID_RSA })]);
const RSA_PUBLIC_FOR_PSS = rsaPem(MODULUS, EXPONENT, [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.1.10' })]);

/** EC_PUBLIC_COMPRESSED with the other Y: the same X, so the other point on the curve there. */
function otherCompressedPoint(): string {
    const { algorithm, key } = partsOf(EC_PUBLIC_COMPRESSED);
    expect(key[0]).toBe(0x03);
    return spkiPem(algorithm, key.map((byte, i) => (i === 0 ? 0x02 : byte)));
}

/** EC_PUBLIC in the X9.62 hybrid form: 07 for its odd Y, then X and Y as before. */
function hybridPoint(): string {
    const { algorithm, key } = partsOf(EC_PUBLIC);
    expect([key[0], key[key.length - 1] & 1]).toEqual([0x04, 1]);
    return spkiPem(algorithm, key.map((byte, i) => (i === 0 ? 0x07 : byte)));
}

/** EC_PUBLIC's point bytes, as if on secp256k1: a field of the same size, but another curve. */
const EC_PUBLIC_ON_SECP256K1 = spkiPem(
    [new asn1js.ObjectIdentifier({ value: OID_EC }), new asn1js.ObjectIdentifier({ value: OID_SECP256K1 })],
    partsOf(EC_PUBLIC).key,
);

describe('matchKeys', () => {
    it.each([
        ['a private key and the certificate issued for it', EC_PKCS8, EC_CERT],
        ['a SEC1 private key and its certificate', EC_SEC1, EC_CERT],
        ['a PKCS#1 RSA private key and its certificate', RSA_PKCS1, RSA_CERT],
        ['a private key and the CSR made with it', EC_PKCS8, EC_CSR],
        ['a CSR and the certificate issued for it', EC_CSR, EC_CERT],
        ['a certificate and its public key', RSA_CERT, RSA_PUBLIC],
        ['a PKCS#1 public key and the same key as an SPKI', RSA_PUBLIC_PKCS1, RSA_PUBLIC],
        ['a full chain, by its leaf, and the private key', `${EC_CERT}\n${CA_CERT}`, EC_PKCS8],
        ['a compressed EC point and the uncompressed one', EC_PUBLIC_COMPRESSED, EC_CERT],
        ['a compressed P-384 point whose Y is even', P384_PUBLIC_COMPRESSED, P384_PKCS8],
        ['a hybrid EC point and the uncompressed one', hybridPoint(), EC_CERT],
        ['an RSA key whose algorithm has no NULL parameters', RSA_PUBLIC_WITHOUT_NULL, RSA_CERT],
        ['an RSA key marked for RSASSA-PSS', RSA_PUBLIC_FOR_PSS, RSA_PKCS8],
        ['an RSA key whose integers have extra leading zeros', RSA_PUBLIC_LOOSE, RSA_CERT],
        ['an Ed25519 private key and its public key', ED25519_PKCS8, ED25519_PUBLIC],
    ])('finds the same key in %s, whichever comes first', async (_, first, second) => {
        expect((await matchKeys(first, second)).same).toBe(true);
        expect((await matchKeys(second, first)).same).toBe(true);
    });

    it.each([
        ['a private key and a certificate for another key', RSA_PKCS8, CA_CERT],
        ['a CSR and a certificate for another key', SAN_CSR, EC_CERT],
        ['keys of different algorithms', EC_PKCS8, RSA_CERT],
        ['keys on different curves', P384_PKCS8, EC_CERT],
        ['two different Ed25519 keys', ED25519_PKCS8, ED25519_LEAF],
        ['EC points with the same X but the other Y', otherCompressedPoint(), EC_PUBLIC],
        ['the same point bytes on another curve of the same size', EC_PUBLIC_ON_SECP256K1, EC_PUBLIC],
        ['RSA keys with the same modulus but another exponent', RSA_PUBLIC_OTHER_EXPONENT, RSA_PUBLIC],
    ])('tells apart %s, whichever comes first', async (_, first, second) => {
        expect((await matchKeys(first, second)).same).toBe(false);
        expect((await matchKeys(second, first)).same).toBe(false);
    });

    it('says what each PEM is and which key it holds', async () => {
        expect(await matchKeys(EC_PKCS8, RSA_CERT)).toEqual({
            same: false,
            first: { holder: 'private key', key: 'ECDSA (P-256)', otherBlocks: 0 },
            second: { holder: 'certificate', key: 'RSA (2048 bits)', otherBlocks: 0 },
        });
        expect(await matchKeys(EC_CSR, RSA_PUBLIC_PKCS1)).toEqual({
            same: false,
            first: { holder: 'CSR', key: 'ECDSA (P-256)', otherBlocks: 0 },
            second: { holder: 'public key', key: 'RSA (2048 bits)', otherBlocks: 0 },
        });
    });

    it.each([
        ['a full chain, of which only the leaf is compared', `${EC_CERT}\n${CA_CERT}\n${RSA_CERT}`, 'certificate', 2],
        ['a private key with its certificate, of which only the key is compared', `${RSA_CERT}\n${EC_PKCS8}`, 'private key', 1],
        ['a SEC1 key with its EC PARAMETERS, which hold no key', EC_SEC1, 'private key', 0],
        ['a certificate with text and a block of another kind around it', `Leaf:\n${EC_CERT}\n-----BEGIN PKCS7-----\nMAA=\n-----END PKCS7-----`, 'certificate', 0],
    ])('counts the other blocks that hold a key in %s', async (_, text, holder, otherBlocks) => {
        const { first } = await matchKeys(text, EC_PUBLIC);
        expect(first).toMatchObject({ holder, otherBlocks });
    });

    it.each([
        ['the first PEM', 'hello', EC_CERT, `First PEM: ${NOT_FOUND}`],
        ['the second PEM, when it is empty', EC_CERT, '', `Second PEM: ${NOT_FOUND}`],
        ['a broken block', EC_CERT, '-----BEGIN CERTIFICATE-----\nMAA=\n-----END CERTIFICATE-----', 'Second PEM: The CERTIFICATE block is not a valid certificate.'],
        ['the first PEM when both are wrong', ENCRYPTED_PKCS8, 'hello', 'First PEM: This private key is encrypted.'],
    ])('says what is wrong with %s', async (_, first, second, message) => {
        await expect(matchKeys(first, second)).rejects.toThrow(message);
    });
});

describe('describePem', () => {
    it.each([
        [0, 'certificate, ECDSA (P-256)'],
        [1, 'certificate, ECDSA (P-256); 1 other block in it was not compared'],
        [2, 'certificate, ECDSA (P-256); 2 other blocks in it were not compared'],
    ])('says what a PEM with %i other blocks held', (otherBlocks, text) => {
        expect(describePem({ holder: 'certificate', key: 'ECDSA (P-256)', otherBlocks })).toBe(text);
    });
});

describe('describeMatch', () => {
    const side = (holder: KeyHolder) => ({ holder, key: 'ECDSA (P-256)', otherBlocks: 0 });

    it.each<[boolean, KeyHolder, KeyHolder, string]>([
        [true, 'private key', 'certificate', 'The private key and the certificate are for the same key pair.'],
        [false, 'private key', 'certificate', 'The private key and the certificate are for different key pairs.'],
        [true, 'certificate', 'CSR', 'The certificate and the CSR are for the same key pair.'],
        [true, 'certificate', 'certificate', 'Both certificates are for the same key pair.'],
        [false, 'CSR', 'CSR', 'The two CSRs are for different key pairs.'],
        [false, 'public key', 'public key', 'The two public keys are for different key pairs.'],
    ])('words a match of %s between a %s and a %s', (same, first, second, sentence) => {
        expect(describeMatch({ same, first: side(first), second: side(second) })).toBe(sentence);
    });
});
