import { describe, it, expect } from 'vitest';
import {
    selfSigned,
    x509V3,
    serialNumberRange,
    serialNumberEntropy,
    brPolicyOid,
    authorityKeyId,
    revocationInfo,
    caIssuers,
    sctEmbedded,
    extensionsUnique,
} from '../../lint/checks/structure';
import { BASE_CERT, OID, makeCert, makeEnv, validityOfDays } from './certFactory';
import type { CheckOutcome } from '../../lint/types';

const expectIssue = (outcome: CheckOutcome, severity: 'error' | 'warn' | 'info') =>
    expect(outcome).toMatchObject({ status: 'issue', severity });
const bytes = (...values: number[]) => Uint8Array.from(values);
const repeat = (value: number, count: number) => new Array<number>(count).fill(value);

describe('selfSigned', () => {
    it('passes for a CA-issued certificate', () => {
        expect(selfSigned.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it('reports a self-signed certificate as info', () => {
        expectIssue(selfSigned.run(makeCert({ isSelfIssued: true }), makeEnv()), 'info');
    });
});

describe('x509V3', () => {
    it('passes v3', () => {
        expect(x509V3.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it('is an error for v1', () => {
        expectIssue(x509V3.run(makeCert({ version: 1 }), makeEnv()), 'error');
    });
});

describe('serialNumberRange', () => {
    const run = (serialNumber: Uint8Array) => serialNumberRange.run(makeCert({ serialNumber }), makeEnv());

    it.each([
        ['a 16-byte serial', bytes(0x5a, ...repeat(0x11, 15))],
        ['a padded high-bit serial', bytes(0x00, 0xc3, 0xa5, 0xf0, 0x0d)],
        ['a 20-byte serial', bytes(0x7f, ...repeat(0xff, 19))],
    ])('passes %s', (_label, serial) => {
        expect(run(serial).status).toBe('pass');
    });

    it.each([
        ['zero', bytes(0x00)],
        ['empty', bytes()],
        ['negative', bytes(0x80, 0x01)],
        ['21 octets', bytes(0x01, ...repeat(0xff, 20))],
    ])('is an error for a %s serial', (_label, serial) => {
        expectIssue(run(serial), 'error');
    });
});

describe('serialNumberEntropy', () => {
    const run = (serialNumber: Uint8Array) => serialNumberEntropy.run(makeCert({ serialNumber }), makeEnv());

    it.each([
        ['8 significant bytes', bytes(0x7f, 1, 2, 3, 4, 5, 6, 7)],
        ['a padded 8-byte serial', bytes(0x00, 0x80, 1, 2, 3, 4, 5, 6, 7)],
    ])('passes %s', (_label, serial) => {
        expect(run(serial).status).toBe('pass');
    });

    it.each([
        ['7 bytes', bytes(0x7f, 1, 2, 3, 4, 5, 6)],
        ['a padded 4-byte serial', bytes(0x00, 0xc3, 0xa5, 0xf0, 0x0d)],
    ])('warns for %s', (_label, serial) => {
        expectIssue(run(serial), 'warn');
    });
});

describe('brPolicyOid', () => {
    const run = (certificatePolicies: string[] | null) =>
        brPolicyOid.run(makeCert({ extensions: { certificatePolicies } }), makeEnv());

    it.each([[[OID.dvPolicy]], [['1.2.3.4', OID.ovPolicy]]])('passes %j', policies => {
        expect(run(policies).status).toBe('pass');
    });

    it.each([
        ['no extension', null],
        ['no policies', []],
        ['no reserved policy', ['1.2.3.4']],
        ['two reserved policies', [OID.dvPolicy, OID.ovPolicy]],
        ['anyPolicy', [OID.anyPolicy, OID.dvPolicy]],
    ])('is an error for %s', (_label, policies) => {
        expectIssue(run(policies), 'error');
    });
});

describe('authorityKeyId', () => {
    it('passes when present', () => {
        expect(authorityKeyId.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it('is an error when missing', () => {
        expectIssue(authorityKeyId.run(makeCert({ extensions: { hasAuthorityKeyIdentifier: false } }), makeEnv()), 'error');
    });
});

describe('revocationInfo', () => {
    const noRevocation = { authorityInfoAccess: null, hasCrlDistributionPoints: false };
    const run = (overrides: Parameters<typeof makeCert>[0]) => revocationInfo.run(makeCert(overrides), makeEnv());

    it.each([
        ['OCSP and CRL', {}],
        ['OCSP only', { extensions: { hasCrlDistributionPoints: false } }],
        ['CRL only', { extensions: { authorityInfoAccess: null } }],
        ['neither, 7-day cert issued 2026-04-01', { ...validityOfDays('2026-04-01T00:00:00Z', 7), extensions: noRevocation }],
        ['neither, 10-day cert issued 2025-01-01', { ...validityOfDays('2025-01-01T00:00:00Z', 10), extensions: noRevocation }],
    ])('passes with %s', (_label, overrides) => {
        expect(run(overrides).status).toBe('pass');
    });

    it.each([
        ['a 90-day cert', { extensions: noRevocation }],
        ['an 8-day cert issued 2026-04-01', { ...validityOfDays('2026-04-01T00:00:00Z', 8), extensions: noRevocation }],
        ['an 11-day cert issued 2025-01-01', { ...validityOfDays('2025-01-01T00:00:00Z', 11), extensions: noRevocation }],
        ['a 5-day cert issued 2024-03-14', { ...validityOfDays('2024-03-14T00:00:00Z', 5), extensions: noRevocation }],
    ])('is an error without OCSP or CRL for %s', (_label, overrides) => {
        expectIssue(run(overrides), 'error');
    });
});

describe('caIssuers', () => {
    it('passes when present', () => {
        expect(caIssuers.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it.each([
        ['no AIA', null],
        ['AIA without caIssuers', { ocsp: ['http://ocsp.example.test'], caIssuers: [] }],
    ])('warns with %s', (_label, aia) => {
        expectIssue(caIssuers.run(makeCert({ extensions: { authorityInfoAccess: aia } }), makeEnv()), 'warn');
    });
});

describe('sctEmbedded', () => {
    it('passes when an SCT list is embedded', () => {
        expect(sctEmbedded.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it('warns when no SCT list is embedded', () => {
        expectIssue(sctEmbedded.run(makeCert({ extensions: { hasSctList: false } }), makeEnv()), 'warn');
    });
});

describe('extensionsUnique', () => {
    const withExtra = (oid: string, critical: boolean) =>
        extensionsUnique.run(makeCert({ extensions: { all: [...BASE_CERT.extensions.all, { oid, critical }] } }), makeEnv());

    it('passes when every extension appears once', () => {
        expect(extensionsUnique.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it('is an error for a repeated extension', () => {
        expectIssue(withExtra('2.5.29.17', false), 'error');
    });

    it('warns for a critical extension that clients may not understand', () => {
        expectIssue(withExtra('1.2.3.4', true), 'warn');
    });

    it('ignores unknown non-critical extensions', () => {
        expect(withExtra('1.2.3.4', false).status).toBe('pass');
    });
});
