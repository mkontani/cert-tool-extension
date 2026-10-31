import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInspectListener, createMenus, MENU_INSPECT_SELECTION, onMenuClick, registerBackground, type BackgroundApi } from '../../background/handlers';
import { MAX_TEXT_LENGTH, MSG_INSPECT_SELECTION, MSG_INSPECT_TEXTS } from '../../page/messages';
import { CONTENT_SCRIPT_FILE } from '../../page/runInTab';
import { SAN_CSR } from '../inspectorFixtures';

const EXTENSION_ID = 'abcdefghijklmnop';
const NOW = Date.parse('2026-11-01T00:00:00Z');

const event = () => ({ addListener: vi.fn() });

function fakeApi(options: { failFrames?: readonly number[] } = {}) {
    const api = {
        runtime: { id: EXTENSION_ID, onInstalled: event(), onMessage: event() },
        contextMenus: { removeAll: vi.fn(() => Promise.resolve()), create: vi.fn(), onClicked: event() },
        scripting: {
            executeScript: vi.fn(({ target }: { target: { frameIds: number[] } }) =>
                options.failFrames?.includes(target.frameIds[0]) ? Promise.reject(new Error('Cannot access contents of the page')) : Promise.resolve([])),
        },
        tabs: { sendMessage: vi.fn(() => Promise.resolve({ found: 1 })) },
        action: {
            setBadgeText: vi.fn(() => Promise.resolve()),
            setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
            setTitle: vi.fn(() => Promise.resolve()),
        },
    };
    return { api, typed: api as unknown as BackgroundApi };
}

const info = (overrides: Partial<chrome.contextMenus.OnClickData> = {}) =>
    ({ menuItemId: MENU_INSPECT_SELECTION, editable: false, pageUrl: 'https://example.com/', frameId: 0, selectionText: 'sel', ...overrides }) as chrome.contextMenus.OnClickData;
const tab = { id: 5 } as chrome.tabs.Tab;

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterEach(() => { consoleError.mockRestore(); });

describe('registerBackground', () => {
    it('wires install, context menu and message listeners', () => {
        const { api, typed } = fakeApi();
        registerBackground(typed);
        expect(api.runtime.onInstalled.addListener).toHaveBeenCalledOnce();
        expect(api.contextMenus.onClicked.addListener).toHaveBeenCalledOnce();
        expect(api.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    });
});

describe('createMenus', () => {
    it('recreates the selection menu item, so updates do not hit a duplicate id', async () => {
        const { api, typed } = fakeApi();
        await createMenus(typed);
        expect(api.contextMenus.removeAll).toHaveBeenCalledOnce();
        expect(api.contextMenus.create).toHaveBeenCalledWith({ id: MENU_INSPECT_SELECTION, title: 'Inspect certificate with Cert Tool', contexts: ['selection'] });
        expect(api.contextMenus.removeAll.mock.invocationCallOrder[0]).toBeLessThan(api.contextMenus.create.mock.invocationCallOrder[0]);
    });
});

describe('onMenuClick', () => {
    it('runs the selection command in the frame that was clicked', async () => {
        const { api, typed } = fakeApi();
        await onMenuClick(typed, info({ frameId: 3, selectionText: 'abc' }), tab);
        expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 5, frameIds: [3] }, files: [CONTENT_SCRIPT_FILE] });
        expect(api.tabs.sendMessage).toHaveBeenCalledWith(5, { type: MSG_INSPECT_SELECTION, fallbackText: 'abc', preferFallback: false }, { frameId: 3 });
    });

    it('falls back to the top frame when the clicked frame cannot be reached', async () => {
        const { api, typed } = fakeApi({ failFrames: [3] });
        await onMenuClick(typed, info({ frameId: 3 }), tab);
        expect(api.tabs.sendMessage).toHaveBeenCalledTimes(1);
        // The top frame's own selection may be stale; the menu's copy is what the user picked.
        expect(api.tabs.sendMessage).toHaveBeenCalledWith(5, { type: MSG_INSPECT_SELECTION, fallbackText: 'sel', preferFallback: true }, { frameId: 0 });
    });

    it('flags the toolbar icon when the selection cannot be inspected', async () => {
        const { api, typed } = fakeApi({ failFrames: [0] });
        await onMenuClick(typed, info(), tab);
        expect(api.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: '!' });
        expect(api.action.setTitle).toHaveBeenCalledWith({ tabId: 5, title: expect.stringMatching(/^Cert Tool: Cert Tool can't read this page\./) });
    });

    it('clears the flag after a successful inspection', async () => {
        const { api, typed } = fakeApi();
        await onMenuClick(typed, info(), tab);
        expect(api.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: '' });
        expect(api.action.setTitle).toHaveBeenCalledWith({ tabId: 5, title: 'Cert Tool' });
    });

    it('logs when the page cannot be reached at all', async () => {
        const { api, typed } = fakeApi({ failFrames: [0] });
        await onMenuClick(typed, info(), tab);
        expect(api.tabs.sendMessage).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith('Cert Tool: could not inspect the selection', expect.any(Error));
    });

    it('caps the fallback text at the request size limit', async () => {
        const { api, typed } = fakeApi();
        await onMenuClick(typed, info({ selectionText: 'a'.repeat(MAX_TEXT_LENGTH + 10) }), tab);
        const [, command] = api.tabs.sendMessage.mock.calls[0] as unknown as [number, { fallbackText: string }];
        expect(command.fallbackText).toHaveLength(MAX_TEXT_LENGTH);
    });

    it('ignores other menu items and clicks without a tab', async () => {
        const { api, typed } = fakeApi();
        await onMenuClick(typed, info({ menuItemId: 'other' }), tab);
        await onMenuClick(typed, info(), undefined);
        expect(api.scripting.executeScript).not.toHaveBeenCalled();
    });
});

describe('createInspectListener', () => {
    const listener = createInspectListener(EXTENSION_ID, () => NOW);
    const contentScript = { id: EXTENSION_ID, tab: { id: 5 } } as chrome.runtime.MessageSender;

    it('parses the texts and answers synchronously', () => {
        const sendResponse = vi.fn();
        expect(listener({ type: MSG_INSPECT_TEXTS, texts: [SAN_CSR, 'nothing'] }, contentScript, sendResponse)).toBe(false);
        const [scans] = sendResponse.mock.calls[0];
        expect(scans).toHaveLength(2);
        expect(scans[0].items[0]).toEqual(expect.objectContaining({ status: 'ok', kind: 'csr' }));
        expect(scans[1].items).toEqual([]);
    });

    it.each([
        ['another extension', { type: MSG_INSPECT_TEXTS, texts: [] }, { id: 'someone-else' }],
        ['a malformed request', { type: MSG_INSPECT_TEXTS, texts: [42] }, contentScript],
        ['an unrelated message', { type: 'other' }, contentScript],
    ])('ignores %s', (_name, msg, sender) => {
        const sendResponse = vi.fn();
        expect(listener(msg, sender as chrome.runtime.MessageSender, sendResponse)).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });
});
