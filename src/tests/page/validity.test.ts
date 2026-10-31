import { describe, it, expect } from 'vitest';
import { describeValidity, EXPIRING_SOON_DAYS, shortValidity, validityOf } from '../../page/validity';

const DAY = 86_400_000;
const NOT_BEFORE = 'Mon, 01 Jun 2026 00:00:00 GMT';
const NOT_AFTER = 'Tue, 01 Jun 2027 00:00:00 GMT';
const start = Date.parse(NOT_BEFORE);
const end = Date.parse(NOT_AFTER);

describe('validityOf', () => {
    it('reports whole days left for a certificate well inside its validity period', () => {
        expect(validityOf(NOT_BEFORE, NOT_AFTER, end - 100.5 * DAY)).toEqual({ state: 'valid', days: 100 });
    });

    it(`flags certificates with fewer than ${EXPIRING_SOON_DAYS} days left as expiring`, () => {
        expect(validityOf(NOT_BEFORE, NOT_AFTER, end - (EXPIRING_SOON_DAYS - 1) * DAY)).toEqual({ state: 'expiring', days: EXPIRING_SOON_DAYS - 1 });
        expect(validityOf(NOT_BEFORE, NOT_AFTER, end - EXPIRING_SOON_DAYS * DAY)).toEqual({ state: 'valid', days: EXPIRING_SOON_DAYS });
    });

    it('treats notAfter itself as still valid (RFC 5280 makes it inclusive)', () => {
        expect(validityOf(NOT_BEFORE, NOT_AFTER, end)).toEqual({ state: 'expiring', days: 0 });
    });

    it('reports whole days since expiry', () => {
        expect(validityOf(NOT_BEFORE, NOT_AFTER, end + 1)).toEqual({ state: 'expired', days: 0 });
        expect(validityOf(NOT_BEFORE, NOT_AFTER, end + 3.2 * DAY)).toEqual({ state: 'expired', days: 3 });
    });

    it('reports days until a future certificate becomes valid, rounded up', () => {
        expect(validityOf(NOT_BEFORE, NOT_AFTER, start - 1)).toEqual({ state: 'not-yet-valid', days: 1 });
        expect(validityOf(NOT_BEFORE, NOT_AFTER, start - 2.5 * DAY)).toEqual({ state: 'not-yet-valid', days: 3 });
    });

    it('returns undefined when either date is missing or unreadable', () => {
        expect(validityOf(undefined, NOT_AFTER, end)).toBeUndefined();
        expect(validityOf(NOT_BEFORE, 'Unknown', end)).toBeUndefined();
    });
});

describe('describeValidity', () => {
    it.each([
        [{ state: 'valid', days: 100 }, 'Expires in 100 days'],
        [{ state: 'expiring', days: 1 }, 'Expires in 1 day'],
        [{ state: 'expiring', days: 0 }, 'Expires in less than a day'],
        [{ state: 'expired', days: 3 }, 'Expired 3 days ago'],
        [{ state: 'expired', days: 0 }, 'Expired less than a day ago'],
        [{ state: 'not-yet-valid', days: 1 }, 'Becomes valid in 1 day'],
    ] as const)('%o → %s', (validity, text) => {
        expect(describeValidity(validity)).toBe(text);
    });
});

describe('shortValidity', () => {
    it.each([
        [{ state: 'valid', days: 100 }, '100d left'],
        [{ state: 'expiring', days: 0 }, '<1d left'],
        [{ state: 'expired', days: 3 }, 'expired'],
        [{ state: 'not-yet-valid', days: 2 }, 'not yet valid'],
    ] as const)('%o → %s', (validity, text) => {
        expect(shortValidity(validity)).toBe(text);
    });
});
