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

    it('returns null when there is no certificate or CSR', () => {
        expect(findPemBlock('not a certificate')).toBeNull();
    });
});
