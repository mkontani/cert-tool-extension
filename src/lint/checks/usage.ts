import type { CertContext, CheckDefinition, KeyUsageFlag } from '../types';
import { NOT_APPLICABLE, OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION, PASS, issue, lookup } from './common';

const OID_SERVER_AUTH = '1.3.6.1.5.5.7.3.1';
const OID_CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const CLIENT_AUTH_BAN_START = new Date('2027-03-15T00:00:00Z');

/** BR §7.1.2.7.10: purposes that MUST NOT appear in a subscriber certificate. */
const FORBIDDEN_EKUS: Readonly<Record<string, string>> = {
    '1.3.6.1.5.5.7.3.3': 'codeSigning',
    '1.3.6.1.5.5.7.3.4': 'emailProtection',
    '1.3.6.1.5.5.7.3.8': 'timeStamping',
    '1.3.6.1.5.5.7.3.9': 'OCSPSigning',
    '2.5.29.37.0': 'anyExtendedKeyUsage',
    '1.3.6.1.4.1.11129.2.4.4': 'Precertificate Signing',
};

interface KeyUsageRule {
    readonly permitted: readonly KeyUsageFlag[];
    readonly required?: KeyUsageFlag;
    readonly recommended?: KeyUsageFlag;
    readonly notRecommended: readonly KeyUsageFlag[];
}

/** BR §7.1.2.7.11 */
const KEY_USAGE_RULES: Readonly<Record<string, KeyUsageRule>> = {
    [OID_RSA_ENCRYPTION]: {
        permitted: ['digitalSignature', 'keyEncipherment', 'dataEncipherment'],
        recommended: 'digitalSignature',
        notRecommended: ['dataEncipherment'],
    },
    [OID_EC_PUBLIC_KEY]: {
        permitted: ['digitalSignature', 'keyAgreement'],
        required: 'digitalSignature',
        notRecommended: ['keyAgreement'],
    },
};

export const ekuServerAuth: CheckDefinition = {
    id: 'eku_server_auth',
    title: 'extKeyUsage includes serverAuth',
    citation: 'BR §7.1.2.7.10; Apple',
    profiles: ['public', 'private'],
    run: cert => {
        const eku = cert.extensions.extKeyUsage;
        if (!eku) return issue('error', 'No extKeyUsage extension. Apple platforms require serverAuth for TLS server certificates.');
        return eku.includes(OID_SERVER_AUTH) ? PASS : issue('error', 'extKeyUsage does not include serverAuth.');
    },
};

export const notCa: CheckDefinition = {
    id: 'not_ca',
    title: 'Not marked as a CA certificate',
    citation: 'BR §7.1.2.7.8',
    profiles: ['public', 'private'],
    run: cert => {
        const bc = cert.extensions.basicConstraints;
        if (bc?.ca) {
            return issue('error', 'basicConstraints has CA:TRUE. Firefox and others reject CA certificates used as server certificates.');
        }
        if (bc?.pathLenConstraint !== undefined) {
            return issue('error', 'pathLenConstraint MUST NOT be present unless CA:TRUE (RFC 5280 §4.2.1.9).');
        }
        return PASS;
    },
};

function keyUsageProblems(flags: readonly KeyUsageFlag[], rule: KeyUsageRule): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const forbidden = flags.filter(flag => !rule.permitted.includes(flag));
    if (flags.length === 0) errors.push('no key usage bits are set');
    if (forbidden.length > 0) errors.push(`${forbidden.join(', ')} not permitted for this key type`);
    if (rule.required && !flags.includes(rule.required)) errors.push(`${rule.required} MUST be set`);
    if (rule.recommended && flags.length > 0 && !flags.includes(rule.recommended)) {
        warnings.push(`${rule.recommended} SHOULD be set`);
    }
    const discouraged = flags.filter(flag => rule.notRecommended.includes(flag));
    if (discouraged.length > 0) warnings.push(`${discouraged.join(', ')} is NOT RECOMMENDED`);
    return { errors, warnings };
}

export const brKeyUsage: CheckDefinition = {
    id: 'br_key_usage',
    title: 'keyUsage matches the key type',
    citation: 'BR §7.1.2.7.11',
    profiles: ['public'],
    run: (cert: CertContext) => {
        const rule = lookup(KEY_USAGE_RULES, cert.publicKey.algorithm.oid);
        if (!rule) return NOT_APPLICABLE;
        const ku = cert.extensions.keyUsage;
        if (!ku) return issue('warn', 'keyUsage SHOULD be present.');
        const { errors, warnings } = keyUsageProblems(ku.flags, rule);
        if (!ku.critical) warnings.push('keyUsage SHOULD be critical');
        if (errors.length > 0) return issue('error', `keyUsage: ${[...errors, ...warnings].join('; ')}.`);
        if (warnings.length > 0) return issue('warn', `keyUsage: ${warnings.join('; ')}.`);
        return PASS;
    },
};

export const brEkuForbidden: CheckDefinition = {
    id: 'br_eku_forbidden',
    title: 'extKeyUsage has no forbidden purposes',
    citation: 'BR §7.1.2.7.10',
    profiles: ['public'],
    run: cert => {
        const eku = cert.extensions.extKeyUsage;
        if (!eku) return NOT_APPLICABLE;
        const forbidden = eku.flatMap(oid => lookup(FORBIDDEN_EKUS, oid) ?? []);
        if (forbidden.length > 0) return issue('error', `extKeyUsage MUST NOT include: ${forbidden.join(', ')}.`);
        const unlisted = eku.filter(oid => oid !== OID_SERVER_AUTH && oid !== OID_CLIENT_AUTH);
        return unlisted.length > 0 ? issue('warn', `Additional purposes are NOT RECOMMENDED: ${unlisted.join(', ')}.`) : PASS;
    },
};

export const clientAuthEku: CheckDefinition = {
    id: 'client_auth_eku',
    title: 'extKeyUsage is serverAuth only (no clientAuth)',
    citation: 'Chrome Root Program Policy v1.8 §1.3.2',
    profiles: ['public'],
    run: cert => {
        const eku = cert.extensions.extKeyUsage;
        if (!eku) return NOT_APPLICABLE;
        if (!eku.includes(OID_CLIENT_AUTH)) return PASS;
        return cert.notBefore >= CLIENT_AUTH_BAN_START
            ? issue('error', 'Chrome requires serverAuth-only certificates issued on or after 2027-03-15.')
            : issue('warn', 'Includes clientAuth. Certificates issued on or after 2027-03-15 must be serverAuth only for Chrome.');
    },
};
