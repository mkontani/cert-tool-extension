import type { CertContext, CheckOutcome, Severity } from '../types';

export const PASS: CheckOutcome = { status: 'pass' };
export const NOT_APPLICABLE: CheckOutcome = { status: 'na' };

export const issue = (severity: Severity, message: string): CheckOutcome => ({ status: 'issue', severity, message });

export const DAY_MS = 86_400_000;

/** BR §6.3.2 day count: the inclusive validity period, where any partial day counts as a whole day. */
export function validityDays(cert: CertContext): number {
    return Math.ceil((cert.notAfter.getTime() - cert.notBefore.getTime() + 1000) / DAY_MS);
}

export const formatDate = (date: Date) => date.toISOString().slice(0, 10);

/** Own-property lookup, so keys from certificate data can never reach Object.prototype. */
export const lookup = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
    Object.hasOwn(table, key) ? table[key] : undefined;

export const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
export const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';

/** BR §7.1.6.1 reserved certificate policy identifiers. */
export const RESERVED_POLICY_OIDS: ReadonlySet<string> = new Set([
    '2.23.140.1.2.1', // domain-validated
    '2.23.140.1.2.2', // organization-validated
    '2.23.140.1.2.3', // individual-validated
    '2.23.140.1.1', // extended-validation
]);
