import { describe, it, expect } from 'vitest';
import {
    notExpired,
    alreadyValid,
    notExpiringSoon,
    privateMaxValidity,
    brMaxValidity,
} from '../../lint/checks/validity';
import { makeCert, makeEnv, validityOfDays } from './certFactory';

const at = (iso: string) => makeEnv({ now: new Date(iso) });

describe('notExpired', () => {
    it('passes before notAfter', () => {
        expect(notExpired.run(makeCert(), at('2026-06-29T23:59:59Z')).status).toBe('pass');
    });

    it('is an error after notAfter', () => {
        expect(notExpired.run(makeCert(), at('2026-06-30T00:00:00Z'))).toMatchObject({ status: 'issue', severity: 'error' });
    });
});

describe('alreadyValid', () => {
    it('passes from notBefore on', () => {
        expect(alreadyValid.run(makeCert(), at('2026-04-01T00:00:00Z')).status).toBe('pass');
    });

    it('is an error before notBefore', () => {
        expect(alreadyValid.run(makeCert(), at('2026-03-31T23:59:59Z'))).toMatchObject({ status: 'issue', severity: 'error' });
    });
});

describe('notExpiringSoon', () => {
    it('passes with more than 30 days left', () => {
        expect(notExpiringSoon.run(makeCert(), at('2026-05-30T23:59:58Z')).status).toBe('pass');
    });

    it('warns with 30 days or fewer left', () => {
        expect(notExpiringSoon.run(makeCert(), at('2026-05-31T00:00:00Z'))).toMatchObject({ status: 'issue', severity: 'warn' });
    });

    it('is not applicable once expired (covered by notExpired)', () => {
        expect(notExpiringSoon.run(makeCert(), at('2026-07-01T00:00:00Z')).status).toBe('na');
    });
});

describe('privateMaxValidity (Apple 825 days)', () => {
    it('passes at exactly 825 days', () => {
        const cert = makeCert(validityOfDays('2026-01-01T00:00:00Z', 825));
        expect(privateMaxValidity.run(cert, makeEnv()).status).toBe('pass');
    });

    it('is an error one second over 825 days', () => {
        const cert = makeCert({ notBefore: new Date('2026-01-01T00:00:00Z'), notAfter: new Date('2028-04-05T00:00:00Z') });
        expect(privateMaxValidity.run(cert, makeEnv())).toMatchObject({ status: 'issue', severity: 'error' });
    });

    it('does not apply to certificates issued before 2019-07-01', () => {
        const cert = makeCert(validityOfDays('2019-06-30T23:59:59Z', 2000));
        expect(privateMaxValidity.run(cert, makeEnv()).status).toBe('na');
    });
});

describe('brMaxValidity', () => {
    it.each([
        ['2026-03-14T23:59:59Z', 397, 'pass'],
        ['2026-03-14T23:59:59Z', 398, 'warn'],
        ['2026-03-14T23:59:59Z', 399, 'error'],
        ['2026-03-15T00:00:00Z', 199, 'pass'],
        ['2026-03-15T00:00:00Z', 200, 'warn'],
        ['2026-03-15T00:00:00Z', 201, 'error'],
        ['2027-03-15T00:00:00Z', 99, 'pass'],
        ['2027-03-15T00:00:00Z', 100, 'warn'],
        ['2027-03-15T00:00:00Z', 101, 'error'],
        ['2029-03-15T00:00:00Z', 46, 'pass'],
        ['2029-03-15T00:00:00Z', 47, 'warn'],
        ['2029-03-15T00:00:00Z', 48, 'error'],
    ])('issued %s with %i days -> %s', (notBefore, days, expected) => {
        const outcome = brMaxValidity.run(makeCert(validityOfDays(notBefore, days)), makeEnv());
        if (expected === 'pass') expect(outcome.status).toBe('pass');
        else expect(outcome).toMatchObject({ status: 'issue', severity: expected });
    });

    it.each([
        ['2020-09-01T00:00:00Z', 399, 'error'],
        ['2020-08-31T23:59:59Z', 825, 'pass'],
        ['2020-08-31T23:59:59Z', 826, 'error'],
        ['2018-03-01T00:00:00Z', 825, 'pass'],
    ])('applies the historical limit: issued %s with %i days -> %s', (notBefore, days, expected) => {
        const outcome = brMaxValidity.run(makeCert(validityOfDays(notBefore, days)), makeEnv());
        if (expected === 'pass') expect(outcome.status).toBe('pass');
        else expect(outcome).toMatchObject({ status: 'issue', severity: expected });
    });

    it('does not evaluate certificates issued before 2018-03-01', () => {
        expect(brMaxValidity.run(makeCert(validityOfDays('2018-02-28T23:59:59Z', 1000)), makeEnv()).status).toBe('na');
    });

    it('counts a partial day as a whole day', () => {
        // 200 days + 1 second, issued after 2026-03-15
        const cert = makeCert({ notBefore: new Date('2026-04-01T00:00:00Z'), notAfter: new Date('2026-10-18T00:00:00Z') });
        expect(brMaxValidity.run(cert, makeEnv())).toMatchObject({ status: 'issue', severity: 'error' });
    });
});
