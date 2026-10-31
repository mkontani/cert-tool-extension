import { describe, it, expect } from 'vitest';
import { badgeSummary, toneOf } from '../../content/summary';
import { certItem, csrItem, errorItem, scanOf } from './pageFixtures';

describe('toneOf', () => {
    it.each([
        ['a valid certificate', certItem({ state: 'valid', days: 90 }), 'ok'],
        ['an expiring certificate', certItem({ state: 'expiring', days: 5 }), 'warn'],
        ['an expired certificate', certItem({ state: 'expired', days: 1 }), 'bad'],
        ['a certificate that is not valid yet', certItem({ state: 'not-yet-valid', days: 1 }), 'bad'],
        ['a certificate with unreadable dates', certItem(undefined), 'info'],
        ['a CSR', csrItem(), 'info'],
        ['an unreadable block', errorItem(), 'error'],
    ] as const)('%s → %s', (_name, item, tone) => {
        expect(toneOf(item)).toBe(tone);
    });
});

describe('badgeSummary', () => {
    it('shows the name and days left of a single certificate', () => {
        expect(badgeSummary(scanOf([certItem({ state: 'valid', days: 90 })]))).toEqual({
            tone: 'ok', label: 'example.com', detail: '90d left', more: 0,
            description: 'example.com, expires in 90 days',
        });
    });

    it('marks a CSR as such', () => {
        expect(badgeSummary(scanOf([csrItem()]))).toEqual({
            tone: 'info', label: 'csr.example', detail: 'CSR', more: 0, description: 'csr.example, certificate signing request',
        });
    });

    it('leaves out the detail when the dates are unreadable', () => {
        expect(badgeSummary(scanOf([certItem(undefined)]))).toEqual(expect.objectContaining({ label: 'example.com', detail: undefined }));
    });

    it('summarises a chain by its first readable entry and takes the worst tone', () => {
        const chain = scanOf([errorItem(), certItem({ state: 'valid', days: 90 }), certItem({ state: 'expired', days: 3 }, { label: 'Old CA' })]);
        expect(badgeSummary(chain)).toEqual({
            tone: 'bad', label: 'example.com', detail: '90d left', more: 2,
            description: 'example.com, expires in 90 days, and 2 more',
        });
    });

    it('prefers a warning over an unreadable block', () => {
        expect(badgeSummary(scanOf([certItem({ state: 'expiring', days: 3 }), errorItem()])).tone).toBe('warn');
    });

    it('names unreadable blocks when nothing could be read', () => {
        expect(badgeSummary(scanOf([errorItem()]))).toEqual({
            tone: 'error', label: 'Unreadable certificate', detail: undefined, more: 0, description: 'Unreadable certificate',
        });
        expect(badgeSummary(scanOf([errorItem(), errorItem()]))).toEqual(expect.objectContaining({ label: '2 unreadable blocks', more: 0 }));
    });
});
