import { describe, it, expect } from 'vitest';
import { findPemBlocks, MAX_PEM_BLOCKS } from '../../inspector/pem';
import { CA_CERT, PRIVATE_EC_LEAF } from '../lint/fixtures';
import { SAN_CSR } from '../inspectorFixtures';

const derOf = (pem: string) => new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'));
const cert = (pem: string) => ({ kind: 'certificate', der: derOf(pem) });

describe('findPemBlocks', () => {
    it('returns the only certificate', () => {
        expect(findPemBlocks(PRIVATE_EC_LEAF)).toEqual({ blocks: [cert(PRIVATE_EC_LEAF)], truncated: false });
    });

    it('returns every certificate of a chain in order', () => {
        expect(findPemBlocks(`${PRIVATE_EC_LEAF}\n${CA_CERT}\n`).blocks).toEqual([cert(PRIVATE_EC_LEAF), cert(CA_CERT)]);
    });

    it('skips blocks that are neither certificates nor CSRs', () => {
        const key = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----';
        expect(findPemBlocks(`${key}\n${CA_CERT}`).blocks).toEqual([cert(CA_CERT)]);
    });

    it('returns certificates and CSRs in input order', () => {
        expect(findPemBlocks(`${CA_CERT}\n${SAN_CSR}`).blocks).toEqual([cert(CA_CERT), { kind: 'csr', der: derOf(SAN_CSR) }]);
    });

    it('recognises the legacy NEW CERTIFICATE REQUEST and X509 CERTIFICATE labels', () => {
        const csr = SAN_CSR.replace(/CERTIFICATE REQUEST/g, 'NEW CERTIFICATE REQUEST');
        const x509 = PRIVATE_EC_LEAF.replace(/CERTIFICATE/g, 'X509 CERTIFICATE');
        expect(findPemBlocks(`${csr}\n${x509}`).blocks).toEqual([{ kind: 'csr', der: derOf(SAN_CSR) }, cert(PRIVATE_EC_LEAF)]);
    });

    it('returns no blocks when there is no certificate or CSR', () => {
        expect(findPemBlocks('not a certificate')).toEqual({ blocks: [], truncated: false });
    });

    it('keeps the blocks before one without an END line', () => {
        expect(findPemBlocks(`${CA_CERT}\n-----BEGIN CERTIFICATE-----\nAAAA\n`).blocks).toEqual([
            cert(CA_CERT),
            { kind: 'certificate', error: 'The CERTIFICATE block #2 has no matching END line.' },
        ]);
    });

    it('reports a block that is not base64 and carries on', () => {
        const broken = '-----BEGIN CERTIFICATE-----\n#!\n-----END CERTIFICATE-----';
        expect(findPemBlocks(`${broken}\n${CA_CERT}`).blocks).toEqual([
            { kind: 'certificate', error: 'The CERTIFICATE block is not valid base64.' },
            cert(CA_CERT),
        ]);
    });

    it(`stops after ${MAX_PEM_BLOCKS} blocks`, () => {
        const scan = findPemBlocks(`${CA_CERT}\n`.repeat(MAX_PEM_BLOCKS + 1));
        expect(scan.blocks).toHaveLength(MAX_PEM_BLOCKS);
        expect(scan.truncated).toBe(true);
    });

    it.each([
        { name: 'unterminated certificate blocks', unit: '-----BEGIN CERTIFICATE-----\n' },
        { name: 'unterminated blocks of other kinds', unit: '-----BEGIN A-----\n' },
        { name: 'empty certificate blocks', unit: '-----BEGIN CERTIFICATE----------END CERTIFICATE-----\n' },
    ])('scans hostile input made of $name in linear time', ({ unit }) => {
        const text = unit.repeat(1_000_000 / unit.length);
        const started = performance.now();
        findPemBlocks(text);
        expect(performance.now() - started).toBeLessThan(500);
    });
});
