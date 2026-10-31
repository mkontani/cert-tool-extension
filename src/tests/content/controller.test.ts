import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createController, createMessageListener } from '../../content/controller';
import { createOverlay, type Overlay } from '../../content/overlay';
import { inspectTexts } from '../../page/inspectTexts';
import { MSG_INSPECT_SELECTION, MSG_SCAN_PAGE, type ContentCommand } from '../../page/messages';
import { MIXED_SAN_CERT, SAN_CSR } from '../inspectorFixtures';
import { CA_CERT } from '../lint/fixtures';

const NOW = Date.parse('2026-11-01T00:00:00Z');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

let overlay: Overlay | undefined;

function setup() {
    const parse = vi.fn(async (texts: readonly string[]) => inspectTexts(texts, NOW));
    const controller = createController({ doc: document, parse, makeOverlay: doc => (overlay = createOverlay(doc)) });
    return { controller, parse };
}

const badges = () => [...overlay!.root.querySelectorAll('button.badge')];
const toastText = () => overlay!.root.querySelector('[role="status"]')?.textContent;
const cardTitles = () => [...overlay!.root.querySelectorAll('[role="dialog"] .title')].map(t => t.textContent);

function select(node: Node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
}

beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
});

afterEach(() => {
    overlay?.destroy();
    overlay = undefined;
});

describe('scanPage', () => {
    it('badges each block of certificates and reports how many it found', async () => {
        document.body.innerHTML = `<pre>${escapeHtml(`${MIXED_SAN_CERT}\n${CA_CERT}`)}</pre><p>text</p><pre>${escapeHtml(SAN_CSR)}</pre>`;
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_SCAN_PAGE })).resolves.toEqual({ found: 3 });
        expect(parse).toHaveBeenCalledOnce();
        expect(parse.mock.calls[0][0]).toHaveLength(2);
        expect(badges()).toHaveLength(2);
        expect(toastText()).toBe('Found 3 certificates or CSRs on this page.');
    });

    it('uses the singular for one find', async () => {
        document.body.innerHTML = `<pre>${escapeHtml(SAN_CSR)}</pre>`;
        const { controller } = setup();
        await controller.handle({ type: MSG_SCAN_PAGE });
        expect(toastText()).toBe('Found 1 certificate or CSR on this page.');
    });

    it('says so when the page has none, without asking for parsing', async () => {
        document.body.innerHTML = '<p>No PEM here</p>';
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_SCAN_PAGE })).resolves.toEqual({ found: 0 });
        expect(parse).not.toHaveBeenCalled();
        expect(toastText()).toBe('No certificates or CSRs found on this page.');
    });

    it('replaces the badges of an earlier scan', async () => {
        document.body.innerHTML = `<pre>${escapeHtml(SAN_CSR)}</pre><pre id="second">${escapeHtml(MIXED_SAN_CERT)}</pre>`;
        const { controller } = setup();
        await controller.handle({ type: MSG_SCAN_PAGE });
        document.getElementById('second')!.remove();
        await controller.handle({ type: MSG_SCAN_PAGE });
        expect(badges()).toHaveLength(1);
    });

    it('skips blocks the page hides, so they cannot be dressed up with a badge', async () => {
        document.body.innerHTML = `<pre id="hidden">${escapeHtml(MIXED_SAN_CERT)}</pre><pre>${escapeHtml(SAN_CSR)}</pre>`;
        // jsdom has no layout; stand in for an element hidden with opacity: 0 or visibility: hidden.
        Object.assign(document.getElementById('hidden')!, { checkVisibility: () => false });
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_SCAN_PAGE })).resolves.toEqual({ found: 1 });
        expect(parse).toHaveBeenCalledWith([SAN_CSR]);
    });

    it('removes its overlay on dispose', async () => {
        document.body.innerHTML = `<pre>${escapeHtml(SAN_CSR)}</pre>`;
        const { controller } = setup();
        await controller.handle({ type: MSG_SCAN_PAGE });
        controller.dispose();
        expect(overlay!.host.isConnected).toBe(false);
    });

    it('reads code viewers that put each line in its own element', async () => {
        const lines = MIXED_SAN_CERT.split('\n').map(line => `<div><span>${line}</span></div>`).join('');
        document.body.innerHTML = `<div id="viewer">${lines}</div>`;
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_SCAN_PAGE })).resolves.toEqual({ found: 1 });
        const [scan] = await parse.mock.results[0].value;
        expect(scan.items[0]).toEqual(expect.objectContaining({ status: 'ok', kind: 'certificate' }));
    });

    it('lets the latest scan win when two overlap', async () => {
        document.body.innerHTML = `<pre id="one">${escapeHtml(SAN_CSR)}</pre>`;
        const pending: ((texts: readonly string[]) => void)[] = [];
        const parse = (texts: readonly string[]) => new Promise<ReturnType<typeof inspectTexts>>(resolve => pending.push(() => resolve(inspectTexts(texts, NOW))));
        const controller = createController({ doc: document, parse, makeOverlay: doc => (overlay = createOverlay(doc)) });
        const first = controller.handle({ type: MSG_SCAN_PAGE });
        document.body.insertAdjacentHTML('beforeend', `<pre>${escapeHtml(MIXED_SAN_CERT)}</pre>`);
        const second = controller.handle({ type: MSG_SCAN_PAGE });
        pending[1]([]);
        await expect(second).resolves.toEqual({ found: 2 });
        pending[0]([]);
        await first;
        expect(badges()).toHaveLength(2);
    });

    it('passes on parsing failures', async () => {
        document.body.innerHTML = `<pre>${escapeHtml(SAN_CSR)}</pre>`;
        const controller = createController({ doc: document, parse: () => Promise.reject(new Error('worker gone')), makeOverlay: doc => (overlay = createOverlay(doc)) });
        await expect(controller.handle({ type: MSG_SCAN_PAGE })).rejects.toThrow('worker gone');
    });
});

describe('inspectSelection', () => {
    it('shows a card for the certificates in the page selection', async () => {
        document.body.innerHTML = `<pre id="p">${escapeHtml(SAN_CSR)}</pre>`;
        select(document.getElementById('p')!);
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_INSPECT_SELECTION, fallbackText: '' })).resolves.toEqual({ found: 1 });
        expect(parse).toHaveBeenCalledWith([SAN_CSR]);
        expect(cardTitles()).toEqual(['csr.example']);
    });

    it('sends only the complete blocks in the selection', async () => {
        document.body.innerHTML = `<pre id="p">Cut: -----BEGIN CERTIFICATE-----\nMIIB\nFull:\n${escapeHtml(SAN_CSR)}\nThanks</pre>`;
        select(document.getElementById('p')!);
        const { controller, parse } = setup();
        await controller.handle({ type: MSG_INSPECT_SELECTION, fallbackText: '' });
        expect(parse).toHaveBeenCalledWith([SAN_CSR]);
    });

    it('reads a selection inside a textarea', async () => {
        document.body.innerHTML = '<textarea id="ta"></textarea>';
        const ta = document.getElementById('ta') as HTMLTextAreaElement;
        ta.value = `junk\n${SAN_CSR}\njunk`;
        ta.focus();
        ta.setSelectionRange(5, 5 + SAN_CSR.length);
        const { controller, parse } = setup();
        await controller.handle({ type: MSG_INSPECT_SELECTION, fallbackText: '' });
        expect(parse).toHaveBeenCalledWith([SAN_CSR]);
    });

    it("falls back to the context menu's copy of the selection", async () => {
        const flattened = SAN_CSR.replace(/\n/g, ' ');
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_INSPECT_SELECTION, fallbackText: flattened })).resolves.toEqual({ found: 1 });
        expect(parse).toHaveBeenCalledWith([flattened]);
        expect(cardTitles()).toEqual(['csr.example']);
    });

    it("prefers the menu's copy when told the click came from another frame", async () => {
        document.body.innerHTML = `<pre id="p">${escapeHtml(MIXED_SAN_CERT)}</pre>`;
        select(document.getElementById('p')!);
        const { controller, parse } = setup();
        await controller.handle({ type: MSG_INSPECT_SELECTION, fallbackText: SAN_CSR, preferFallback: true });
        expect(parse).toHaveBeenCalledWith([SAN_CSR]);
    });

    it('says so when the selection has no certificate', async () => {
        document.body.innerHTML = '<p id="p">just words</p>';
        select(document.getElementById('p')!);
        const { controller, parse } = setup();
        await expect(controller.handle({ type: MSG_INSPECT_SELECTION, fallbackText: 'just words' })).resolves.toEqual({ found: 0 });
        expect(parse).not.toHaveBeenCalled();
        expect(toastText()).toBe('No certificate or CSR found in the selection.');
    });
});

describe('createMessageListener', () => {
    const EXTENSION_ID = 'abcdefghijklmnop';
    const fromExtension = { id: EXTENSION_ID } as chrome.runtime.MessageSender;

    it('answers commands from its own extension asynchronously', async () => {
        const handle = vi.fn(async (_c: ContentCommand) => ({ found: 2 }));
        const sendResponse = vi.fn();
        const listener = createMessageListener(EXTENSION_ID, handle);
        expect(listener({ type: MSG_SCAN_PAGE }, fromExtension, sendResponse)).toBe(true);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ found: 2 }));
    });

    it('turns a failure into an error reply', async () => {
        const sendResponse = vi.fn();
        const listener = createMessageListener(EXTENSION_ID, () => Promise.reject(new Error('worker gone')));
        listener({ type: MSG_SCAN_PAGE }, fromExtension, sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ error: 'worker gone' }));
    });

    it.each([
        ['another extension', { type: MSG_SCAN_PAGE }, { id: 'someone-else' }],
        ['a content script in a tab', { type: MSG_SCAN_PAGE }, { id: EXTENSION_ID, tab: { id: 1 } }],
        ['an unknown message', { type: 'other' }, { id: EXTENSION_ID }],
    ])('ignores %s', (_name, msg, sender) => {
        const handle = vi.fn();
        const sendResponse = vi.fn();
        const listener = createMessageListener(EXTENSION_ID, handle);
        expect(listener(msg, sender as chrome.runtime.MessageSender, sendResponse)).toBe(false);
        expect(handle).not.toHaveBeenCalled();
        expect(sendResponse).not.toHaveBeenCalled();
    });
});
