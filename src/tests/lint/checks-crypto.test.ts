import { describe, it, expect } from 'vitest';
import { keyStrength, weakSignature, brPublicKeyAlgorithm, brSignatureAlgorithm } from '../../lint/checks/crypto';
import { ALG, OID, makeCert, makeEnv } from './certFactory';
import type { AlgorithmInfo, CheckOutcome } from '../../lint/types';

const expectError = (outcome: CheckOutcome) => expect(outcome).toMatchObject({ status: 'issue', severity: 'error' });
const rsaKey = (bits: number, algorithm: AlgorithmInfo = ALG.rsaKey) => makeCert({ publicKey: { algorithm, rsaModulusBits: bits } });
const ecKey = (derHex: string) => makeCert({ publicKey: { algorithm: { oid: OID.ecPublicKey, derHex } } });
const signedWith = (oid: string, derHex: string, signatureAlgorithmsMatch = true) =>
    makeCert({ signatureAlgorithm: { oid, derHex }, signatureAlgorithmsMatch });

describe('keyStrength', () => {
    const ecCurve = (ecCurveOid?: string) => makeCert({ publicKey: { algorithm: ALG.p256Key, ecCurveOid } });
    const keyOf = (oid: string) => makeCert({ publicKey: { algorithm: { oid, derHex: '' } } });

    it.each([2048, 4096])('passes RSA %i bits', bits => {
        expect(keyStrength.run(rsaKey(bits), makeEnv()).status).toBe('pass');
    });

    it.each([1024, 2047])('is an error for RSA %i bits', bits => {
        expectError(keyStrength.run(rsaKey(bits), makeEnv()));
    });

    it.each([
        ['P-256', '1.2.840.10045.3.1.7'],
        ['P-384', '1.3.132.0.34'],
        ['P-521', '1.3.132.0.35'],
    ])('passes ECDSA %s', (_name, curve) => {
        expect(keyStrength.run(ecCurve(curve), makeEnv()).status).toBe('pass');
    });

    it.each([
        ['P-192', '1.2.840.10045.3.1.1'],
        ['secp256k1', '1.3.132.0.10'],
        ['brainpoolP256r1', '1.3.36.3.3.2.8.1.1.7'],
        ['an unnamed curve', undefined],
    ])('is an error for ECDSA %s', (_name, curve) => {
        expectError(keyStrength.run(ecCurve(curve), makeEnv()));
    });

    it('warns for Ed25519, which browsers do not accept', () => {
        expect(keyStrength.run(keyOf('1.3.101.112'), makeEnv())).toMatchObject({ status: 'issue', severity: 'warn' });
    });

    it('is an error for DSA', () => {
        expectError(keyStrength.run(keyOf('1.2.840.10040.4.1'), makeEnv()));
    });
});

describe('weakSignature', () => {
    it('passes sha256WithRSAEncryption', () => {
        expect(weakSignature.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it.each([
        ['sha1WithRSAEncryption', '1.2.840.113549.1.1.5'],
        ['md5WithRSAEncryption', '1.2.840.113549.1.1.4'],
        ['ecdsa-with-SHA1', '1.2.840.10045.4.1'],
    ])('is an error for %s', (_name, oid) => {
        expectError(weakSignature.run(signedWith(oid, ''), makeEnv()));
    });
});

describe('brPublicKeyAlgorithm', () => {
    it.each([2048, 3072, 4096])('passes RSA %i', bits => {
        expect(brPublicKeyAlgorithm.run(rsaKey(bits), makeEnv()).status).toBe('pass');
    });

    it.each([
        ['P-256', '301306072a8648ce3d020106082a8648ce3d030107'],
        ['P-384', '301006072a8648ce3d020106052b81040022'],
        ['P-521', '301006072a8648ce3d020106052b81040023'],
    ])('passes ECDSA %s', (_name, derHex) => {
        expect(brPublicKeyAlgorithm.run(ecKey(derHex), makeEnv()).status).toBe('pass');
    });

    it('is an error for an RSA modulus not divisible by 8', () => {
        expectError(brPublicKeyAlgorithm.run(rsaKey(3071), makeEnv()));
    });

    it('is an error for RSA parameters that are not an explicit NULL', () => {
        expectError(brPublicKeyAlgorithm.run(rsaKey(2048, { oid: OID.rsaEncryption, derHex: '300b06092a864886f70d010101' }), makeEnv()));
    });

    it('is an error for secp256k1', () => {
        expectError(brPublicKeyAlgorithm.run(ecKey('301006072a8648ce3d020106052b8104000a'), makeEnv()));
    });

    it('is an error for Ed25519', () => {
        const cert = makeCert({ publicKey: { algorithm: { oid: '1.3.101.112', derHex: '300506032b6570' } } });
        expectError(brPublicKeyAlgorithm.run(cert, makeEnv()));
    });
});

describe('brSignatureAlgorithm', () => {
    it.each([
        ['sha256WithRSAEncryption', OID.sha256WithRSA, '300d06092a864886f70d01010b0500'],
        ['ecdsa-with-SHA256', OID.ecdsaWithSHA256, '300a06082a8648ce3d040302'],
        [
            'RSASSA-PSS with SHA-256',
            '1.2.840.113549.1.1.10',
            '304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a203020120',
        ],
    ])('passes %s', (_name, oid, derHex) => {
        expect(brSignatureAlgorithm.run(signedWith(oid, derHex), makeEnv()).status).toBe('pass');
    });

    it('is an error for sha256WithRSAEncryption without NULL parameters', () => {
        expectError(brSignatureAlgorithm.run(signedWith(OID.sha256WithRSA, '300b06092a864886f70d01010b'), makeEnv()));
    });

    it('is an error for sha1WithRSAEncryption', () => {
        expectError(brSignatureAlgorithm.run(signedWith(OID.sha1WithRSA, '300d06092a864886f70d0101050500'), makeEnv()));
    });

    it('is an error when the inner and outer signature algorithms differ', () => {
        expectError(brSignatureAlgorithm.run(signedWith(OID.sha256WithRSA, '300d06092a864886f70d01010b0500', false), makeEnv()));
    });
});
