import { describe, it, expect } from 'vitest';
import { findPemBlock } from '../../inspector/pem';
import { CA_CERT, PRIVATE_EC_LEAF } from '../lint/fixtures';
import { SAN_CSR } from '../inspectorFixtures';

const derOf = (pem: string) => new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'));

describe('findPemBlock', () => {
    it('returns the only certificate', () => {
        expect(findPemBlock(PRIVATE_EC_LEAF)).toEqual({ kind: 'certificate', der: derOf(PRIVATE_EC_LEAF), count: 1 });
    });

    it('returns the first certificate of a chain and how many there are', () => {
        expect(findPemBlock(`${PRIVATE_EC_LEAF}\n${CA_CERT}\n`)).toEqual({ kind: 'certificate', der: derOf(PRIVATE_EC_LEAF), count: 2 });
    });

    it('skips blocks that are neither certificates nor CSRs', () => {
        const key = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----';
        expect(findPemBlock(`${key}\n${CA_CERT}`)).toMatchObject({ kind: 'certificate', der: derOf(CA_CERT), count: 1 });
    });

    it('recognises CSRs, including the legacy NEW CERTIFICATE REQUEST label', () => {
        expect(findPemBlock(SAN_CSR)).toMatchObject({ kind: 'csr', count: 1 });
        const legacy = SAN_CSR.replace(/CERTIFICATE REQUEST/g, 'NEW CERTIFICATE REQUEST');
        expect(findPemBlock(legacy)).toMatchObject({ kind: 'csr', der: derOf(SAN_CSR), count: 1 });
    });

    it('accepts the legacy X509 CERTIFICATE label', () => {
        const legacy = PRIVATE_EC_LEAF.replace(/CERTIFICATE/g, 'X509 CERTIFICATE');
        expect(findPemBlock(legacy)).toEqual({ kind: 'certificate', der: derOf(PRIVATE_EC_LEAF), count: 1 });
    });

    it('returns null when there is no certificate or CSR', () => {
        expect(findPemBlock('not a certificate')).toBeNull();
    });

    it('explains a certificate block without an END line', () => {
        expect(() => findPemBlock('-----BEGIN CERTIFICATE-----\nAAAA\n')).toThrow('The CERTIFICATE block has no matching END line.');
    });

    it('explains a certificate block that is not base64', () => {
        expect(() => findPemBlock('-----BEGIN CERTIFICATE-----\n#!\n-----END CERTIFICATE-----'))
            .toThrow('The CERTIFICATE block is not valid base64.');
    });

    it.each([
        { name: 'unterminated certificate blocks', unit: '-----BEGIN CERTIFICATE-----\n' },
        { name: 'unterminated blocks of other kinds', unit: '-----BEGIN A-----\n' },
    ])('scans hostile input made of $name in linear time', ({ unit }) => {
        const text = unit.repeat(40_000); // about 1 MB
        const started = performance.now();
        try {
            findPemBlock(text);
        } catch {
            // only the running time matters here
        }
        expect(performance.now() - started).toBeLessThan(500);
    });
});
