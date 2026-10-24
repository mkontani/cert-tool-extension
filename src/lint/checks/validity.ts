import type { CheckDefinition } from '../types';
import { DAY_MS, NOT_APPLICABLE, PASS, formatDate, issue, validityDays } from './common';

const EXPIRY_WARNING_DAYS = 30;
const APPLE_MAX_DAYS = 825;
const APPLE_RULE_START = new Date('2019-07-01T00:00:00Z');

/**
 * BR §6.3.2 limits by issuance date (approximated by notBefore). The 825-day entry is the limit of
 * earlier BR versions (ballot 193), so older certificates are judged by the rules of their time.
 */
const BR_VALIDITY_LIMITS = [
    { from: new Date('2029-03-15T00:00:00Z'), max: 47, recommended: 46 },
    { from: new Date('2027-03-15T00:00:00Z'), max: 100, recommended: 99 },
    { from: new Date('2026-03-15T00:00:00Z'), max: 200, recommended: 199 },
    { from: new Date('2020-09-01T00:00:00Z'), max: 398, recommended: 397 },
    { from: new Date('2018-03-01T00:00:00Z'), max: 825, recommended: 825 },
] as const;

export const notExpired: CheckDefinition = {
    id: 'not_expired',
    title: 'Certificate has not expired',
    citation: 'RFC 5280 §4.1.2.5',
    profiles: ['public', 'private'],
    run: (cert, env) =>
        env.now > cert.notAfter ? issue('error', `Expired on ${formatDate(cert.notAfter)}.`) : PASS,
};

export const alreadyValid: CheckDefinition = {
    id: 'already_valid',
    title: 'Validity period has started',
    citation: 'RFC 5280 §4.1.2.5',
    profiles: ['public', 'private'],
    run: (cert, env) =>
        env.now < cert.notBefore ? issue('error', `Not valid until ${formatDate(cert.notBefore)}.`) : PASS,
};

export const notExpiringSoon: CheckDefinition = {
    id: 'not_expiring_soon',
    title: `Does not expire within ${EXPIRY_WARNING_DAYS} days`,
    citation: 'Operational best practice',
    profiles: ['public', 'private'],
    run: (cert, env) => {
        const remainingMs = cert.notAfter.getTime() - env.now.getTime();
        if (remainingMs < 0) return NOT_APPLICABLE;
        if (remainingMs > EXPIRY_WARNING_DAYS * DAY_MS) return PASS;
        const days = Math.floor(remainingMs / DAY_MS);
        return issue('warn', `Expires in ${days} day(s), on ${formatDate(cert.notAfter)}.`);
    },
};

export const privateMaxValidity: CheckDefinition = {
    id: 'private_max_validity',
    title: `Validity period is ${APPLE_MAX_DAYS} days or less`,
    citation: 'Apple: Requirements for trusted certificates in iOS 13 and macOS 10.15',
    profiles: ['private'],
    run: cert => {
        if (cert.notBefore < APPLE_RULE_START) return NOT_APPLICABLE;
        const days = validityDays(cert);
        return days > APPLE_MAX_DAYS
            ? issue('error', `Validity period is ${days} days; Apple platforms reject TLS certificates over ${APPLE_MAX_DAYS} days.`)
            : PASS;
    },
};

export const brMaxValidity: CheckDefinition = {
    id: 'br_max_validity',
    title: 'Validity period is within the BR maximum',
    citation: 'BR §6.3.2',
    profiles: ['public'],
    run: cert => {
        const limit = BR_VALIDITY_LIMITS.find(l => cert.notBefore >= l.from);
        if (!limit) return NOT_APPLICABLE;
        const days = validityDays(cert);
        const issued = formatDate(cert.notBefore);
        if (days > limit.max) {
            return issue('error', `Validity period is ${days} days; certificates issued on ${issued} MUST NOT exceed ${limit.max} days.`);
        }
        if (days > limit.recommended) {
            return issue('warn', `Validity period is ${days} days; it SHOULD NOT exceed ${limit.recommended} days.`);
        }
        return PASS;
    },
};
