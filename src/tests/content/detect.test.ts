import { describe, it, expect, beforeEach } from 'vitest';
import { findPemContainers, findPemRanges, hasPemPair, MAX_CONTAINERS, MAX_PAGE_TEXT } from '../../content/detect';
import { MAX_TEXT_LENGTH } from '../../page/messages';
import { MIXED_SAN_CERT, SAN_CSR } from '../inspectorFixtures';
import { CA_CERT } from '../lint/fixtures';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pre = (text: string, id = '') => `<pre${id ? ` id="${id}"` : ''}>${escapeHtml(text)}</pre>`;
const ids = (root: ParentNode = document.body) => findPemContainers(root).map(c => c.element.id);

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('hasPemPair', () => {
    it.each([
        ['a certificate', MIXED_SAN_CERT],
        ['a CSR', SAN_CSR],
        ['the legacy X509 CERTIFICATE label', '-----BEGIN X509 CERTIFICATE-----\nAAAA\n-----END X509 CERTIFICATE-----'],
        ['the legacy NEW CERTIFICATE REQUEST label', '-----BEGIN NEW CERTIFICATE REQUEST-----\nAAAA\n-----END NEW CERTIFICATE REQUEST-----'],
        ['markers without line breaks, as in copied context-menu text', '-----BEGIN CERTIFICATE----- AAAA -----END CERTIFICATE-----'],
        ['a certificate after a private key', `-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n${MIXED_SAN_CERT}`],
    ])('finds %s', (_name, text) => {
        expect(hasPemPair(text)).toBe(true);
    });

    it.each([
        ['plain text', 'nothing here'],
        ['a private key', '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'],
        ['a BEGIN line with no END', '-----BEGIN CERTIFICATE-----\nAAAA'],
        ['mismatched labels', '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE REQUEST-----'],
        ['an END line before the BEGIN line', '-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----'],
    ])('ignores %s', (_name, text) => {
        expect(hasPemPair(text)).toBe(false);
    });

    it('stays fast on many BEGIN lines without an END', () => {
        const hostile = '-----BEGIN CERTIFICATE-----'.repeat(20_000);
        const started = performance.now();
        expect(hasPemPair(hostile)).toBe(false);
        expect(performance.now() - started).toBeLessThan(500);
    });
});

describe('findPemRanges', () => {
    const slices = (text: string) => findPemRanges(text).map(r => text.slice(r.start, r.end));

    it('returns the exact span of each complete block', () => {
        expect(slices(`intro\n${SAN_CSR}\nmiddle\n${MIXED_SAN_CERT}\nend`)).toEqual([SAN_CSR, MIXED_SAN_CERT]);
    });

    it('drops a cut-off block that runs into the next one', () => {
        expect(slices(`-----BEGIN CERTIFICATE-----\nMIIB (cut off)\n${MIXED_SAN_CERT}`)).toEqual([MIXED_SAN_CERT]);
    });

    it('skips private keys between certificates', () => {
        const key = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----';
        expect(slices(`${SAN_CSR}\n${key}\n${MIXED_SAN_CERT}`)).toEqual([SAN_CSR, MIXED_SAN_CERT]);
    });

    it('stops at the given limit', () => {
        expect(findPemRanges(`${SAN_CSR}${SAN_CSR}${SAN_CSR}`, 2)).toHaveLength(2);
    });

    it('stays fast on many cut-off blocks before one END line', () => {
        const hostile = `${'-----BEGIN CERTIFICATE-----x'.repeat(20_000)}-----END CERTIFICATE-----`;
        const started = performance.now();
        expect(findPemRanges(hostile)).toHaveLength(1);
        expect(performance.now() - started).toBeLessThan(500);
    });
});

describe('findPemContainers', () => {
    it('finds a certificate in a <pre> block and returns its text', () => {
        document.body.innerHTML = `<p>Our leaf certificate:</p>${pre(MIXED_SAN_CERT, 'leaf')}`;
        const [container] = findPemContainers(document.body);
        expect(container.element.id).toBe('leaf');
        expect(container.text).toBe(MIXED_SAN_CERT);
    });

    it('does not let a private key claim the certificates around it (regression)', () => {
        document.body.innerHTML = [
            pre(MIXED_SAN_CERT, 'first'),
            pre('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----', 'key'),
            pre(SAN_CSR, 'second'),
        ].join('');
        expect(ids()).toEqual(['first', 'second']);
    });

    it('does not let a cut-off block claim the next block on the page', () => {
        document.body.innerHTML = `${pre('-----BEGIN CERTIFICATE-----\nMIIB', 'cut')}<p>Full version:</p>${pre(MIXED_SAN_CERT, 'full')}`;
        expect(ids()).toEqual(['full']);
    });

    it('uses the common parent of the BEGIN and END lines when they sit in different elements', () => {
        const paragraphs = SAN_CSR.split('\n').map(line => `<p>${line}</p>`).join('');
        document.body.innerHTML = `<article id="post">${paragraphs}${pre(MIXED_SAN_CERT, 'own')}</article>`;
        const containers = findPemContainers(document.body);
        expect(containers.map(c => c.element.id)).toEqual(['post', 'own']);
        expect(containers[0].text).toBe(SAN_CSR.replace(/\n/g, ''));
        expect(containers[1].text).toBe(MIXED_SAN_CERT);
    });

    it('sends only the blocks, not the prose around them', () => {
        document.body.innerHTML = `<div id="d">Before ${escapeHtml(SAN_CSR)} between ${escapeHtml(MIXED_SAN_CERT)} after</div>`;
        const [container] = findPemContainers(document.body);
        expect(container.element.id).toBe('d');
        expect(container.text).toBe(`${SAN_CSR}\n${MIXED_SAN_CERT}`);
    });

    it('keeps page order across textareas and other elements', () => {
        document.body.innerHTML = `${pre(SAN_CSR, 'a')}<textarea id="ta"></textarea>${pre(MIXED_SAN_CERT, 'b')}`;
        (document.getElementById('ta') as HTMLTextAreaElement).value = SAN_CSR;
        expect(ids()).toEqual(['a', 'ta', 'b']);
    });

    it('finds the shared parent when each line is its own element, as in code viewers', () => {
        const lines = MIXED_SAN_CERT.split('\n').map(line => `<div class="line"><span>${line}</span></div>`).join('');
        document.body.innerHTML = `<div id="viewer">${lines}</div>`;
        expect(ids()).toEqual(['viewer']);
    });

    it('finds markers that syntax highlighting splits across elements', () => {
        const [first, ...rest] = MIXED_SAN_CERT.split('\n');
        const split = first.replace('BEGIN CERTIFICATE', 'BEGIN</span> <span>CERTIFICATE');
        document.body.innerHTML = `<code id="hl"><span>${split}</span>\n${rest.join('\n')}</code>`;
        expect(ids()).toEqual(['hl']);
    });

    it('returns one container per block of text, in page order', () => {
        document.body.innerHTML = `${pre(SAN_CSR, 'csr')}<p>and</p>${pre(MIXED_SAN_CERT, 'cert')}`;
        expect(ids()).toEqual(['csr', 'cert']);
    });

    it('keeps a pasted chain together as one container', () => {
        document.body.innerHTML = pre(`${MIXED_SAN_CERT}\n${CA_CERT}`, 'chain');
        expect(ids()).toEqual(['chain']);
    });

    it('reads the current value of a textarea, not its original text', () => {
        document.body.innerHTML = '<textarea id="ta">placeholder</textarea>';
        (document.getElementById('ta') as HTMLTextAreaElement).value = SAN_CSR;
        const [container] = findPemContainers(document.body);
        expect(container.element.id).toBe('ta');
        expect(container.text).toBe(SAN_CSR);
    });

    it('does not read a textarea whose original text was a certificate but has since been cleared', () => {
        document.body.innerHTML = `<textarea id="ta">${escapeHtml(SAN_CSR)}</textarea>`;
        (document.getElementById('ta') as HTMLTextAreaElement).value = '';
        expect(ids()).toEqual([]);
    });

    it('ignores private keys, half-pasted blocks and prose that merely mentions the markers', () => {
        document.body.innerHTML = [
            pre('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'),
            pre('-----BEGIN CERTIFICATE-----\nMIIB'),
            '<p>Paste everything from BEGIN CERTIFICATE onwards.</p>',
        ].join('');
        expect(ids()).toEqual([]);
    });

    it('ignores scripts, styles and templates', () => {
        document.body.innerHTML = [
            `<script type="text/plain">${MIXED_SAN_CERT}</script>`,
            `<style>/* ${MIXED_SAN_CERT} */</style>`,
            `<template>${pre(MIXED_SAN_CERT)}</template>`,
        ].join('');
        expect(ids()).toEqual([]);
    });

    it('skips the excluded element, e.g. its own overlay', () => {
        document.body.innerHTML = `<div id="overlay">${pre(MIXED_SAN_CERT)}</div>${pre(SAN_CSR, 'page')}`;
        const exclude = document.getElementById('overlay')!;
        expect(findPemContainers(document.body, exclude).map(c => c.element.id)).toEqual(['page']);
    });

    it('skips a block too long to send for parsing', () => {
        const huge = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(MAX_TEXT_LENGTH)}\n-----END CERTIFICATE-----`;
        document.body.innerHTML = `${pre(huge, 'huge')}${pre(SAN_CSR, 'small')}`;
        expect(ids()).toEqual(['small']);
    });

    it('stops reading page text after its limit', () => {
        document.body.innerHTML = `<p>${'x'.repeat(MAX_PAGE_TEXT)}</p>${pre(SAN_CSR)}`;
        expect(findPemContainers(document.body)).toEqual([]);
    });

    it('counts textarea values toward the page text limit', () => {
        document.body.innerHTML = `<textarea id="big"></textarea>${pre(SAN_CSR)}`;
        (document.getElementById('big') as HTMLTextAreaElement).value = 'x'.repeat(MAX_PAGE_TEXT);
        expect(findPemContainers(document.body)).toEqual([]);
    });

    it(`stops after ${MAX_CONTAINERS} containers`, () => {
        document.body.innerHTML = Array.from({ length: MAX_CONTAINERS + 5 }, () => pre(SAN_CSR)).join('');
        expect(findPemContainers(document.body)).toHaveLength(MAX_CONTAINERS);
    });
});
