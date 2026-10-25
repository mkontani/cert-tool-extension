import { ALL_CHECKS } from './checks';
import { RESERVED_POLICY_OIDS } from './checks/common';
import { parseCertificate } from './parse';
import type { CertContext, CheckResult, LintOptions, LintReport, Profile } from './types';

/** A CA/B Forum reserved policy OID marks a certificate issued under the Baseline Requirements. */
function detectProfile(cert: CertContext): Profile {
    const policies = cert.extensions.certificatePolicies ?? [];
    return policies.some(oid => RESERVED_POLICY_OIDS.has(oid)) ? 'public' : 'private';
}

function isCaCertificate(cert: CertContext): boolean {
    const { basicConstraints, keyUsage } = cert.extensions;
    return basicConstraints?.ca === true && (keyUsage?.flags.includes('keyCertSign') ?? false);
}

/**
 * Lints the first PEM certificate in `text`.
 * @throws CertParseError if the input is not a parseable certificate.
 */
export function lintCertificate(text: string, options: LintOptions = {}): LintReport {
    const cert = parseCertificate(text);
    const detectedProfile = detectProfile(cert);
    const profile = options.profile === 'public' || options.profile === 'private' ? options.profile : detectedProfile;

    if (isCaCertificate(cert)) {
        return { profile, detectedProfile, isCaCertificate: true, results: [] };
    }

    const env = { now: options.now ?? new Date(), hostname: options.hostname };
    const results: CheckResult[] = ALL_CHECKS.filter(check => check.profiles.includes(profile)).map(check => ({
        id: check.id,
        title: check.title,
        citation: check.citation,
        ...check.run(cert, env),
    }));
    return { profile, detectedProfile, isCaCertificate: false, results };
}

export interface LintSummary {
    readonly error: number;
    readonly warn: number;
    readonly info: number;
    readonly pass: number;
    readonly na: number;
}

export function summarize(report: LintReport): LintSummary {
    return report.results.reduce<LintSummary>(
        (acc, r) => {
            const key = r.status === 'issue' ? r.severity : r.status;
            return { ...acc, [key]: acc[key] + 1 };
        },
        { error: 0, warn: 0, info: 0, pass: 0, na: 0 },
    );
}
