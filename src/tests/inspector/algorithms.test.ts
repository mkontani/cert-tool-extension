import { describe, it, expect } from 'vitest';
import { AsnConvert } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier, Certificate, SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
import { ObjectIdentifier } from 'asn1js';
import { describePublicKey, signatureAlgorithmName } from '../../inspector/algorithms';
import { ED25519_LEAF, LEGACY_V1_SHA1, PRIVATE_EC_LEAF, PUBLIC_RSA_LEAF } from '../lint/fixtures';
import { ED448_CERT, KITCHEN_SINK_CERT, RSA_PSS_CERT } from '../inspectorFixtures';

const certOf = (pem: string) => AsnConvert.parse(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'), Certificate);
const spkiOf = (pem: string) => new Uint8Array(AsnConvert.serialize(certOf(pem).tbsCertificate.subjectPublicKeyInfo));
const signatureOf = (pem: string) => signatureAlgorithmName(certOf(pem).signatureAlgorithm.algorithm);

const spkiWith = (algorithm: string, parameters?: ArrayBuffer) =>
    new Uint8Array(AsnConvert.serialize(new SubjectPublicKeyInfo({
        algorithm: new AlgorithmIdentifier({ algorithm, parameters }),
        subjectPublicKey: new ArrayBuffer(1),
    })));

describe('describePublicKey', () => {
    it.each([
        { name: 'RSA', pem: PUBLIC_RSA_LEAF, expected: 'RSA (2048 bits)' },
        { name: 'RSA 1024', pem: LEGACY_V1_SHA1, expected: 'RSA (1024 bits)' },
        { name: 'RSA-PSS', pem: RSA_PSS_CERT, expected: 'RSA-PSS (2048 bits)' },
        { name: 'P-256', pem: PRIVATE_EC_LEAF, expected: 'ECDSA (P-256)' },
        { name: 'secp256k1', pem: KITCHEN_SINK_CERT, expected: 'ECDSA (secp256k1)' },
        { name: 'Ed25519', pem: ED25519_LEAF, expected: 'Ed25519' },
        { name: 'Ed448', pem: ED448_CERT, expected: 'Ed448' },
    ])('names $name keys', ({ pem, expected }) => {
        expect(describePublicKey(spkiOf(pem))).toBe(expected);
    });

    it('shows the OID of an unknown curve', () => {
        const curve = new ObjectIdentifier({ value: '1.3.132.0.99' }).toBER();
        expect(describePublicKey(spkiWith('1.2.840.10045.2.1', curve))).toBe('ECDSA (1.3.132.0.99)');
    });

    it('shows the OID of an unknown algorithm', () => {
        expect(describePublicKey(spkiWith('1.2.3.4'))).toBe('Unknown (1.2.3.4)');
    });

    it('flags an RSA key that cannot be decoded', () => {
        expect(describePublicKey(spkiWith('1.2.840.113549.1.1.1'))).toBe('RSA (malformed key)');
    });
});

describe('signatureAlgorithmName', () => {
    it.each([
        { name: 'RSA', pem: PUBLIC_RSA_LEAF, expected: 'sha256WithRSAEncryption' },
        { name: 'SHA-1', pem: LEGACY_V1_SHA1, expected: 'sha1WithRSAEncryption' },
        { name: 'RSA-PSS', pem: RSA_PSS_CERT, expected: 'RSASSA-PSS' },
        { name: 'ECDSA', pem: KITCHEN_SINK_CERT, expected: 'ecdsa-with-sha256' },
        { name: 'Ed448', pem: ED448_CERT, expected: 'Ed448' },
    ])('names $name signatures', ({ pem, expected }) => {
        expect(signatureOf(pem)).toBe(expected);
    });

    it.each([
        { oid: '1.3.101.112', expected: 'Ed25519' },
        { oid: '1.3.14.3.2.29', expected: 'sha1WithRSASignature' },
        { oid: '2.16.840.1.101.3.4.3.14', expected: 'sha3-256WithRSAEncryption' },
        { oid: '2.16.840.1.101.3.4.3.10', expected: 'ecdsa-with-sha3-256' },
    ])('names $expected signatures', ({ oid, expected }) => {
        expect(signatureAlgorithmName(oid)).toBe(expected);
    });

    it('returns the OID of an unknown algorithm', () => {
        expect(signatureAlgorithmName('1.2.3.4')).toBe('1.2.3.4');
    });
});
