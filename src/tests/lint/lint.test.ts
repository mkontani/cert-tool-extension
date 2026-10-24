import { describe, it, expect } from 'vitest';
import { lintCertificate, summarize } from '../../lint/lint';
import { CertParseError } from '../../lint/parse';
import type { LintReport } from '../../lint/types';
import { CA_CERT, PUBLIC_RSA_LEAF, PRIVATE_EC_LEAF, SELF_SIGNED_DEFAULT, LEGACY_V1_SHA1 } from './fixtures';
import { GOOGLE_LEAF } from './realWorldFixtures';

const MAY_2026 = new Date('2026-05-01T00:00:00Z');

/** "id:severity" for every issue, sorted, so a whole report can be compared to a literal. */
const issuesOf = (report: LintReport) =>
    report.results
        .flatMap(r => (r.status === 'issue' ? [`${r.id}:${r.severity}`] : []))
        .sort();

describe('lintCertificate', () => {
    it('finds no issues in a BR-conformant leaf and selects the public profile', () => {
        const report = lintCertificate(PUBLIC_RSA_LEAF, { now: MAY_2026 });
        expect(report.profile).toBe('public');
        expect(report.detectedProfile).toBe('public');
        expect(report.isCaCertificate).toBe(false);
        expect(report.results).toHaveLength(29);
        expect(issuesOf(report)).toEqual([]);
    });

    it('finds no issues in the real www.google.com certificate', () => {
        const report = lintCertificate(GOOGLE_LEAF, { now: new Date('2026-10-24T00:00:00Z') });
        expect(report.profile).toBe('public');
        expect(issuesOf(report)).toEqual([]);
    });

    it('checks the hostname when one is given', () => {
        const now = new Date('2026-10-24T00:00:00Z');
        expect(issuesOf(lintCertificate(GOOGLE_LEAF, { now, hostname: 'www.google.com' }))).toEqual([]);
        expect(issuesOf(lintCertificate(GOOGLE_LEAF, { now, hostname: 'mail.google.com' }))).toEqual(['hostname_match:error']);
    });

    it('selects the private profile for a certificate without a CA/B policy OID', () => {
        const report = lintCertificate(PRIVATE_EC_LEAF, { now: MAY_2026 });
        expect(report.profile).toBe('private');
        expect(report.detectedProfile).toBe('private');
        expect(report.results).toHaveLength(15);
        expect(issuesOf(report)).toEqual([]);
    });

    it('applies the public rules when the profile is forced', () => {
        const report = lintCertificate(PRIVATE_EC_LEAF, { now: MAY_2026, profile: 'public' });
        expect(report.profile).toBe('public');
        expect(report.detectedProfile).toBe('private');
        expect(issuesOf(report)).toEqual([
            'br_max_validity:error',
            'br_policy_oid:error',
            'ca_issuers:warn',
            'client_auth_eku:warn',
            'revocation_info:error',
            'san_public_names:error',
            'sct_embedded:warn',
            'serial_number_entropy:warn',
        ]);
    });

    it('flags a bare `openssl req -x509` certificate', () => {
        expect(issuesOf(lintCertificate(SELF_SIGNED_DEFAULT, { now: MAY_2026 }))).toEqual([
            'eku_server_auth:error',
            'not_ca:error',
            'private_max_validity:error',
            'self_signed:info',
        ]);
    });

    it('flags a legacy v1 / RSA-1024 / SHA-1 certificate', () => {
        expect(issuesOf(lintCertificate(LEGACY_V1_SHA1, { now: new Date('2026-02-01T00:00:00Z') }))).toEqual([
            'eku_server_auth:error',
            'key_strength:error',
            'san_present:error',
            'weak_signature:error',
            'x509_v3:error',
        ]);
    });

    it('does not run checks on a CA certificate', () => {
        const report = lintCertificate(CA_CERT, { now: MAY_2026 });
        expect(report.isCaCertificate).toBe(true);
        expect(report.results).toEqual([]);
    });

    it('propagates parse errors', () => {
        expect(() => lintCertificate('not a certificate')).toThrow(CertParseError);
    });
});

describe('summarize', () => {
    it('counts results by outcome', () => {
        const report = lintCertificate(SELF_SIGNED_DEFAULT, { now: MAY_2026 });
        expect(summarize(report)).toEqual({ error: 3, warn: 0, info: 1, pass: 10, na: 1 });
    });
});
