import { describe, it, expect } from 'vitest';
import { parseCertificate, CertParseError } from '../../lint/parse';
import {
    CA_CERT,
    PUBLIC_RSA_LEAF,
    PRIVATE_EC_LEAF,
    SELF_SIGNED_DEFAULT,
    LEGACY_V1_SHA1,
    ED25519_LEAF,
} from './fixtures';

const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

describe('parseCertificate', () => {
    describe('BR-style RSA leaf', () => {
        const cert = parseCertificate(PUBLIC_RSA_LEAF);

        it('reads the basic TBS fields', () => {
            expect(cert.version).toBe(3);
            expect(toHex(cert.serialNumber)).toBe('5a1b2c3d4e5f60718293a4b5c6d7e8f9');
            expect(cert.notBefore.toISOString()).toBe('2026-04-01T00:00:00.000Z');
            expect(cert.notAfter.toISOString()).toBe('2026-06-29T23:59:59.000Z');
            expect(cert.subjectCommonNames).toEqual(['www.example.com']);
            expect(cert.subjectIsEmpty).toBe(false);
            expect(cert.isSelfIssued).toBe(false);
        });

        it('keeps the raw algorithm identifier encodings', () => {
            expect(cert.signatureAlgorithm).toEqual({
                oid: '1.2.840.113549.1.1.11',
                derHex: '300d06092a864886f70d01010b0500',
            });
            expect(cert.signatureAlgorithmsMatch).toBe(true);
            expect(cert.publicKey).toEqual({
                algorithm: { oid: '1.2.840.113549.1.1.1', derHex: '300d06092a864886f70d0101010500' },
                rsaModulusBits: 2048,
            });
        });

        it('decodes the extensions', () => {
            expect(cert.extensions).toEqual({
                all: [
                    { oid: '2.5.29.17', critical: false },
                    { oid: '2.5.29.37', critical: false },
                    { oid: '2.5.29.15', critical: true },
                    { oid: '2.5.29.19', critical: true },
                    { oid: '2.5.29.32', critical: false },
                    { oid: '1.3.6.1.5.5.7.1.1', critical: false },
                    { oid: '2.5.29.31', critical: false },
                    { oid: '2.5.29.35', critical: false },
                    { oid: '1.3.6.1.4.1.11129.2.4.2', critical: false },
                ],
                subjectAltName: {
                    critical: false,
                    dnsNames: ['www.example.com', 'example.com'],
                    ipAddresses: [],
                    otherNameTypes: [],
                },
                extKeyUsage: ['1.3.6.1.5.5.7.3.1'],
                basicConstraints: { ca: false },
                keyUsage: { critical: true, flags: ['digitalSignature', 'keyEncipherment'] },
                certificatePolicies: ['2.23.140.1.2.1'],
                authorityInfoAccess: {
                    ocsp: ['http://ocsp.example.test'],
                    caIssuers: ['http://ca.example.test/ca.der'],
                },
                hasAuthorityKeyIdentifier: true,
                hasCrlDistributionPoints: true,
                hasSctList: true,
            });
        });
    });

    it('decodes an ECDSA leaf with IP SANs and a high-bit serial', () => {
        const cert = parseCertificate(PRIVATE_EC_LEAF);
        expect(toHex(cert.serialNumber)).toBe('00c3a5f00d');
        expect(cert.publicKey).toEqual({
            algorithm: { oid: '1.2.840.10045.2.1', derHex: '301306072a8648ce3d020106082a8648ce3d030107' },
            ecCurveOid: '1.2.840.10045.3.1.7',
        });
        expect(cert.subjectCommonNames).toEqual(['app.corp']);
        expect(cert.extensions.subjectAltName).toEqual({
            critical: false,
            dnsNames: ['app.corp', '*.internal.example'],
            ipAddresses: ['10.0.0.5', '2001:db8::1'],
            otherNameTypes: [],
        });
        expect(cert.extensions.extKeyUsage).toEqual(['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2']);
        expect(cert.extensions.certificatePolicies).toBeNull();
        expect(cert.extensions.authorityInfoAccess).toBeNull();
        expect(cert.extensions.hasCrlDistributionPoints).toBe(false);
        expect(cert.extensions.hasSctList).toBe(false);
    });

    it('detects a self-signed certificate', () => {
        const cert = parseCertificate(SELF_SIGNED_DEFAULT);
        expect(cert.isSelfIssued).toBe(true);
        expect(cert.extensions.basicConstraints).toEqual({ ca: true });
        expect(cert.extensions.keyUsage).toBeNull();
        expect(cert.extensions.extKeyUsage).toBeNull();
    });

    it('reads a v1 SHA-1 certificate without extensions', () => {
        const cert = parseCertificate(LEGACY_V1_SHA1);
        expect(cert.version).toBe(1);
        expect(cert.signatureAlgorithm).toEqual({
            oid: '1.2.840.113549.1.1.5',
            derHex: '300d06092a864886f70d0101050500',
        });
        expect(cert.publicKey.rsaModulusBits).toBe(1024);
        expect(cert.extensions.subjectAltName).toBeNull();
        expect(cert.extensions.basicConstraints).toBeNull();
        expect(cert.extensions.hasAuthorityKeyIdentifier).toBe(false);
    });

    it('reads an Ed25519 public key', () => {
        const cert = parseCertificate(ED25519_LEAF);
        expect(cert.publicKey).toEqual({ algorithm: { oid: '1.3.101.112', derHex: '300506032b6570' } });
    });

    it('reads CA key usage bits', () => {
        const cert = parseCertificate(CA_CERT);
        expect(cert.extensions.keyUsage).toEqual({ critical: true, flags: ['keyCertSign', 'cRLSign'] });
    });

    it('uses the first certificate when a chain is pasted', () => {
        const cert = parseCertificate(`${PUBLIC_RSA_LEAF}\n${CA_CERT}`);
        expect(cert.subjectCommonNames).toEqual(['www.example.com']);
    });

    it('rejects input without a PEM certificate', () => {
        expect(() => parseCertificate('hello')).toThrow(CertParseError);
    });

    it('rejects a CSR', () => {
        const csr = PUBLIC_RSA_LEAF.replace(/CERTIFICATE/g, 'CERTIFICATE REQUEST');
        expect(() => parseCertificate(csr)).toThrow(CertParseError);
    });

    it('rejects a PEM block whose body is not a certificate', () => {
        const broken = '-----BEGIN CERTIFICATE-----\nMAA=\n-----END CERTIFICATE-----';
        expect(() => parseCertificate(broken)).toThrow(CertParseError);
    });
});

describe('parseCertificate on malformed DER', () => {
    const toDer = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    const toPem = (der: Uint8Array) => `-----BEGIN CERTIFICATE-----\n${btoa(String.fromCharCode(...der))}\n-----END CERTIFICATE-----`;
    const mutate = (pem: string, pos: number, value: number) => {
        const der = toDer(pem);
        der[pos] = value;
        return toPem(der);
    };
    const thrownBy = (fn: () => unknown) => {
        try {
            fn();
            return null;
        } catch (e: unknown) {
            return e;
        }
    };

    // Byte positions found by a mutation sweep that previously escaped as TypeError / plain Error.
    it.each([
        { name: 'CA_CERT', pem: CA_CERT, pos: 213, value: 0x00 },
        { name: 'CA_CERT', pem: CA_CERT, pos: 213, value: 0x18 },
        { name: 'PUBLIC_RSA_LEAF', pem: PUBLIC_RSA_LEAF, pos: 193, value: 0x00 },
        { name: 'PUBLIC_RSA_LEAF', pem: PUBLIC_RSA_LEAF, pos: 193, value: 0x18 },
    ])('reports $name with byte $pos set to $value as CertParseError', ({ pem, pos, value }) => {
        expect(thrownBy(() => parseCertificate(mutate(pem, pos, value)))).toBeInstanceOf(CertParseError);
    });

    it('never throws anything but CertParseError for single-byte corruptions', () => {
        const der = toDer(PUBLIC_RSA_LEAF);
        const escaped: string[] = [];
        for (let pos = 0; pos < der.length; pos++) {
            for (const value of [0x00, 0x18]) {
                const error = thrownBy(() => parseCertificate(mutate(PUBLIC_RSA_LEAF, pos, value)));
                if (error !== null && !(error instanceof CertParseError)) escaped.push(`${pos}=${value}`);
            }
        }
        expect(escaped).toEqual([]);
    });

    it('rejects trailing data after the certificate', () => {
        const der = toDer(PUBLIC_RSA_LEAF);
        expect(() => parseCertificate(toPem(new Uint8Array([...der, 0x01, 0x02])))).toThrow(CertParseError);
    });

    it('extracts the named curve of an EC key', () => {
        expect(parseCertificate(PRIVATE_EC_LEAF).publicKey.ecCurveOid).toBe('1.2.840.10045.3.1.7');
    });

    it('lists every extension with its criticality, including duplicates', () => {
        expect(parseCertificate(PRIVATE_EC_LEAF).extensions.all).toEqual([
            { oid: '2.5.29.17', critical: false },
            { oid: '2.5.29.37', critical: false },
            { oid: '2.5.29.15', critical: true },
            { oid: '2.5.29.19', critical: true },
            { oid: '2.5.29.35', critical: false },
        ]);
    });
});
