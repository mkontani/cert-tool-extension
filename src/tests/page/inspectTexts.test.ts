import { describe, it, expect } from 'vitest';
import { inspectText, inspectTexts } from '../../page/inspectTexts';
import { MAX_PEM_BLOCKS } from '../../inspector/pem';
import { MIXED_SAN_CERT, SAN_CSR } from '../inspectorFixtures';
import { CA_CERT } from '../lint/fixtures';

const NOW = Date.parse('2026-11-01T00:00:00Z');

describe('inspectText', () => {
    it('inspects a certificate and adds its validity', () => {
        const scan = inspectText(`Here is the leaf:\n${MIXED_SAN_CERT}\nThanks!`, NOW);
        expect(scan.truncated).toBe(false);
        expect(scan.items).toHaveLength(1);
        const [item] = scan.items;
        expect(item.status).toBe('ok');
        if (item.status !== 'ok') return;
        expect(item.kind).toBe('certificate');
        expect(item.result.label).toBe('mixed.example');
        expect(item.validity).toEqual(expect.objectContaining({ state: expect.any(String), days: expect.any(Number) }));
    });

    it('inspects a CSR without a validity', () => {
        const [item] = inspectText(SAN_CSR, NOW).items;
        expect(item).toEqual(expect.objectContaining({ status: 'ok', kind: 'csr' }));
        expect(item).not.toHaveProperty('validity');
    });

    it('keeps chain order and reads every block', () => {
        const { items } = inspectText(`${MIXED_SAN_CERT}\n${CA_CERT}\n${SAN_CSR}`, NOW);
        expect(items.map(i => i.kind)).toEqual(['certificate', 'certificate', 'csr']);
        expect(items.every(i => i.status === 'ok')).toBe(true);
    });

    it('reports unreadable blocks without hiding the readable ones', () => {
        const broken = '-----BEGIN CERTIFICATE-----\nMIIBAAAA\n-----END CERTIFICATE-----';
        const { items } = inspectText(`${broken}\n${MIXED_SAN_CERT}`, NOW);
        expect(items[0]).toEqual({ status: 'error', kind: 'certificate', error: expect.stringMatching(/^Failed to parse: /) });
        expect(items[1].status).toBe('ok');
    });

    it('passes on base64 errors from the PEM scanner', () => {
        const { items } = inspectText('-----BEGIN CERTIFICATE-----\n!!!\n-----END CERTIFICATE-----', NOW);
        expect(items).toEqual([{ status: 'error', kind: 'certificate', error: 'The CERTIFICATE block is not valid base64.' }]);
    });

    it('returns no items for text without certificates', () => {
        expect(inspectText('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----', NOW)).toEqual({ items: [], truncated: false });
    });

    it('flags input with more blocks than the scanner reads', () => {
        const scan = inspectText(Array(MAX_PEM_BLOCKS + 1).fill(MIXED_SAN_CERT).join('\n'), NOW);
        expect(scan.items).toHaveLength(MAX_PEM_BLOCKS);
        expect(scan.truncated).toBe(true);
    });

    it('produces plain data that survives JSON messaging unchanged', () => {
        const scan = inspectText(`${MIXED_SAN_CERT}\n${SAN_CSR}`, NOW);
        expect(JSON.parse(JSON.stringify(scan))).toEqual(scan);
    });
});

describe('inspectTexts', () => {
    it('returns one scan per text, in order', () => {
        const scans = inspectTexts([SAN_CSR, 'nothing here', MIXED_SAN_CERT], NOW);
        expect(scans.map(s => s.items.length)).toEqual([1, 0, 1]);
        expect(scans[0].items[0].kind).toBe('csr');
    });
});
