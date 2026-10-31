import { describe, it, expect, vi } from 'vitest';
import { MAX_CARD_ENTRIES, MAX_CARD_TEXT, renderCard } from '../../content/card';
import { certItem, csrItem, errorItem, scanOf } from './pageFixtures';

const textOf = (el: Element) => el.textContent ?? '';

describe('renderCard', () => {
    it('lists the fields of a certificate with its validity', () => {
        const card = renderCard(document, scanOf([certItem({ state: 'expired', days: 3 })]), { onClose: () => { } });
        expect(card.getAttribute('role')).toBe('dialog');
        expect(card.querySelector('.validity')?.textContent).toBe('Expired 3 days ago');
        expect(card.querySelector('.validity')?.classList.contains('tone-bad')).toBe(true);
        const rows = [...card.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling?.textContent]);
        expect(rows).toEqual([
            ['Subject', 'CN=example.com'],
            ['Issuer', 'CN=Example CA'],
            ['Serial', '01ab'],
            ['Not before', 'Mon, 01 Jun 2026 00:00:00 GMT'],
            ['Not after', 'Tue, 01 Jun 2027 00:00:00 GMT'],
            ['Public key', 'ECDSA P-256'],
            ['Signature', 'ecdsa-with-SHA256'],
        ]);
    });

    it('leaves out fields a CSR does not have', () => {
        const card = renderCard(document, scanOf([csrItem()]), { onClose: () => { } });
        expect([...card.querySelectorAll('dt')].map(textOf)).toEqual(['Subject', 'Public key', 'Signature']);
        expect(card.querySelector('.validity')).toBeNull();
        expect(textOf(card.querySelector('.kind')!)).toBe('Certificate Signing Request (CSR)');
    });

    it('shows extensions, marking critical ones and listing entries one per row', () => {
        const item = certItem({ state: 'valid', days: 90 }, {
            extensions: [
                { name: 'Basic Constraints', critical: true, value: 'CA: false' },
                { name: 'Subject Alternative Name', critical: false, value: 'DNS: a.example, IP: 192.0.2.1', entries: [{ type: 'DNS', value: 'a.example' }, { type: 'IP', value: '192.0.2.1' }] },
            ],
        });
        const card = renderCard(document, scanOf([item]), { onClose: () => { } });
        const exts = [...card.querySelectorAll('.ext')];
        expect(exts).toHaveLength(2);
        expect(textOf(exts[0].querySelector('.ext-name')!)).toBe('Basic Constraints critical');
        expect(textOf(exts[0].querySelector('.ext-value')!)).toBe('CA: false');
        expect([...exts[1].querySelectorAll('li')].map(textOf)).toEqual(['DNSa.example', 'IP192.0.2.1']);
    });

    it('shows every entry of a chain, numbered, with errors in place', () => {
        const card = renderCard(document, scanOf([certItem({ state: 'valid', days: 90 }), errorItem('Broken block')]), { onClose: () => { } });
        const sections = card.querySelectorAll('section');
        expect(sections).toHaveLength(2);
        expect(textOf(sections[0].querySelector('.index')!)).toBe('1 / 2');
        expect(textOf(sections[1].querySelector('.error')!)).toBe('Broken block');
    });

    it('says when only part of the text was read', () => {
        const card = renderCard(document, scanOf([csrItem()], true), { onClose: () => { } });
        expect(textOf(card.querySelector('.note')!)).toMatch(/Only the first \d+ blocks are listed/);
    });

    it('renders page-supplied names as text, never as markup', () => {
        const hostile = '<img src=x onerror="alert(1)">';
        const card = renderCard(document, scanOf([certItem({ state: 'valid', days: 90 }, { label: hostile, subject: hostile })]), { onClose: () => { } });
        expect(card.querySelector('img')).toBeNull();
        expect(textOf(card)).toContain(hostile);
    });

    it('says the contents are only what the certificate claims', () => {
        const card = renderCard(document, scanOf([certItem({ state: 'valid', days: 90 })]), { onClose: () => { } });
        expect(textOf(card.querySelector('.disclaimer')!)).toBe('Shown as written in the certificate. Signatures and trust are not checked.');
    });

    it(`lists at most ${MAX_CARD_ENTRIES} entries per extension`, () => {
        const entries = Array.from({ length: MAX_CARD_ENTRIES + 50 }, (_, i) => ({ type: 'DNS', value: `h${i}.example` }));
        const item = certItem({ state: 'valid', days: 90 }, { extensions: [{ name: 'Subject Alternative Name', critical: false, value: '', entries }] });
        const card = renderCard(document, scanOf([item]), { onClose: () => { } });
        const rows = card.querySelectorAll('li');
        expect(rows).toHaveLength(MAX_CARD_ENTRIES + 1);
        expect(textOf(rows[MAX_CARD_ENTRIES])).toBe('… and 50 more');
    });

    it(`shortens values longer than ${MAX_CARD_TEXT} characters`, () => {
        const long = 'A'.repeat(MAX_CARD_TEXT + 10);
        const item = certItem({ state: 'valid', days: 90 }, { subject: long, extensions: [{ name: 'Unknown', critical: false, value: long }] });
        const card = renderCard(document, scanOf([item]), { onClose: () => { } });
        const expected = `${'A'.repeat(MAX_CARD_TEXT)}…`;
        expect(textOf(card.querySelector('dd')!)).toBe(expected);
        expect(textOf(card.querySelector('.ext-value')!)).toBe(expected);
    });

    it('calls onClose from the close button', () => {
        const onClose = vi.fn();
        const card = renderCard(document, scanOf([csrItem()]), { onClose });
        (card.querySelector('button.close') as HTMLButtonElement).click();
        expect(onClose).toHaveBeenCalledOnce();
    });
});
