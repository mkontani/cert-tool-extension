import { describe, it, expect } from 'vitest';
import * as asn1js from 'asn1js';
import { describeKey, publicKeyOf, readPrivateKey } from '../../keys/privateKey';
import { decodeBase64, pemBlocks, toPem } from '../../keys/pem';
import { CA_CERT } from '../lint/fixtures';
import {
    EC_PKCS8, EC_PUBLIC, EC_SEC1, EC_SEC1_EXPLICIT, EC_SEC1_NO_PUBLIC, ED25519_PKCS8, ENCRYPTED_PKCS8, P384_PKCS8, P521_PKCS8, RSA_PKCS1, RSA_PKCS8,
    RSA_PUBLIC, X25519_PKCS8,
} from '../keyFixtures';

/** EC_SEC1_NO_PUBLIC without its [0] curve either: just the version and the private key. */
function sec1WithoutCurve(): string {
    const block = pemBlocks(EC_SEC1_NO_PUBLIC).find(b => b.label === 'EC PRIVATE KEY');
    const [version, privateKey] = (asn1js.fromBER(decodeBase64(block!.content)!).result as asn1js.Sequence).valueBlock.value;
    return toPem('EC PRIVATE KEY', new Uint8Array(new asn1js.Sequence({ value: [version, privateKey] }).toBER()));
}

describe('readPrivateKey', () => {
    it.each([
        ['RSA', RSA_PKCS8],
        ['ECDSA P-256', EC_PKCS8],
        ['ECDSA P-384', P384_PKCS8],
        ['ECDSA P-521', P521_PKCS8],
        ['Ed25519', ED25519_PKCS8],
    ])('reads a PKCS#8 %s key', (name, pem) => {
        expect(describeKey(readPrivateKey(pem).algorithm)).toBe(name);
    });

    it('reads a PKCS#1 RSA key as the same key in PKCS#8', () => {
        const key = readPrivateKey(RSA_PKCS1);
        expect(describeKey(key.algorithm)).toBe('RSA');
        expect(key.pkcs8).toEqual(readPrivateKey(RSA_PKCS8).pkcs8);
    });

    it('reads a SEC1 EC key after the EC PARAMETERS block that openssl ecparam writes', () => {
        const key = readPrivateKey(EC_SEC1);
        expect(describeKey(key.algorithm)).toBe('ECDSA P-256');
        expect(key.pkcs8).toEqual(readPrivateKey(EC_PKCS8).pkcs8);
    });

    it('reads a SEC1 key without its public key', async () => {
        const key = readPrivateKey(EC_SEC1_NO_PUBLIC);
        expect(describeKey(key.algorithm)).toBe('ECDSA P-256');
        expect(toPem('PUBLIC KEY', await publicKeyOf(key))).toBe(`${EC_PUBLIC}\n`);
    });

    it('explains an EC key that spells out its curve, or does not name it at all', () => {
        expect(() => readPrivateKey(EC_SEC1_EXPLICIT)).toThrow(
            'This EC key spells out its curve instead of naming it. Convert it with: openssl ec -in key.pem -param_enc named_curve -out key-named.pem');
        expect(() => readPrivateKey(sec1WithoutCurve())).toThrow('This EC key does not name its curve, so it cannot be used on its own.');
    });

    it('finds the key among other blocks, such as a certificate pasted before it', () => {
        expect(describeKey(readPrivateKey(`${CA_CERT}\n${EC_PKCS8}\n`).algorithm)).toBe('ECDSA P-256');
    });

    it('explains how to remove the passphrase from an encrypted key', () => {
        expect(() => readPrivateKey(ENCRYPTED_PKCS8)).toThrow('This private key is encrypted. Remove its passphrase first, e.g. with: openssl pkey -in key.pem -out key-plain.pem');
        const legacy = RSA_PKCS1.replace('-----\n', '-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-256-CBC,00112233445566778899AABBCCDDEEFF\n\n');
        expect(() => readPrivateKey(legacy)).toThrow('This private key is encrypted.');
    });

    it('names a key algorithm it cannot use', () => {
        expect(() => readPrivateKey(X25519_PKCS8)).toThrow('X25519 keys are not supported. Use an RSA, ECDSA (P-256, P-384, P-521) or Ed25519 key.');
    });

    it('names a key format it cannot read', () => {
        const openssh = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----';
        expect(() => readPrivateKey(openssh)).toThrow('"OPENSSH PRIVATE KEY" keys are not supported. Use a PKCS#8 (BEGIN PRIVATE KEY), PKCS#1 (BEGIN RSA PRIVATE KEY) or SEC1 (BEGIN EC PRIVATE KEY) key.');
    });

    it('says when there is no private key', () => {
        expect(() => readPrivateKey(CA_CERT)).toThrow('No private key found. Paste a PEM block that starts with -----BEGIN PRIVATE KEY-----.');
        expect(() => readPrivateKey('')).toThrow('No private key found.');
    });

    it('says when the key is not valid DER', () => {
        expect(() => readPrivateKey('-----BEGIN PRIVATE KEY-----\nMAA=\n-----END PRIVATE KEY-----')).toThrow('The private key could not be read.');
        expect(() => readPrivateKey('-----BEGIN PRIVATE KEY-----\n!!!!\n-----END PRIVATE KEY-----')).toThrow('The private key could not be read.');
    });
});

describe('publicKeyOf', () => {
    it.each([
        ['PKCS#8 RSA', RSA_PKCS8, RSA_PUBLIC],
        ['PKCS#1 RSA', RSA_PKCS1, RSA_PUBLIC],
        ['PKCS#8 EC', EC_PKCS8, EC_PUBLIC],
        ['SEC1 EC', EC_SEC1, EC_PUBLIC],
    ])('gives the same public key as openssl for a %s key', async (_, pem, expected) => {
        expect(toPem('PUBLIC KEY', await publicKeyOf(readPrivateKey(pem)))).toBe(`${expected}\n`);
    });

    it('derives an Ed25519 public key', async () => {
        expect(await publicKeyOf(readPrivateKey(ED25519_PKCS8))).toHaveLength(44);
    });
});
