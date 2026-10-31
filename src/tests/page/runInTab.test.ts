import { describe, it, expect, vi } from 'vitest';
import { CONTENT_SCRIPT_FILE, describeScanError, runInTab, type InjectApi } from '../../page/runInTab';
import { MSG_SCAN_PAGE } from '../../page/messages';

function fakeApi(reply: unknown, inject: () => Promise<unknown> = () => Promise.resolve([])) {
    const api = {
        scripting: { executeScript: vi.fn(inject) },
        tabs: { sendMessage: vi.fn(() => Promise.resolve(reply)) },
    };
    return { api, typed: api as unknown as InjectApi };
}

describe('runInTab', () => {
    it('injects the content script into the frame, then sends it the command', async () => {
        const { api, typed } = fakeApi({ found: 2 });
        await expect(runInTab(typed, 7, 3, { type: MSG_SCAN_PAGE })).resolves.toEqual({ found: 2 });
        expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [3] }, files: [CONTENT_SCRIPT_FILE] });
        expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, { type: MSG_SCAN_PAGE }, { frameId: 3 });
        expect(api.scripting.executeScript.mock.invocationCallOrder[0]).toBeLessThan(api.tabs.sendMessage.mock.invocationCallOrder[0]);
    });

    it('does not message the page when injection fails', async () => {
        const { api, typed } = fakeApi({ found: 0 }, () => Promise.reject(new Error('Cannot access a chrome:// URL')));
        await expect(runInTab(typed, 1, 0, { type: MSG_SCAN_PAGE })).rejects.toThrow('Cannot access a chrome:// URL');
        expect(api.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('turns an error reply into a rejection', async () => {
        const { typed } = fakeApi({ error: 'Parsing failed' });
        await expect(runInTab(typed, 1, 0, { type: MSG_SCAN_PAGE })).rejects.toThrow('Parsing failed');
    });

    it('rejects a reply it does not understand', async () => {
        const { typed } = fakeApi(undefined);
        await expect(runInTab(typed, 1, 0, { type: MSG_SCAN_PAGE })).rejects.toThrow('The page did not respond.');
    });
});

describe('describeScanError', () => {
    it.each([
        'Cannot access a chrome:// URL',
        'The extensions gallery cannot be scripted.',
        'Cannot access contents of url "file:///tmp/a.pem". Extension manifest must request permission to access this host.',
    ])('explains pages extensions may not read: %s', (message) => {
        expect(describeScanError(new Error(message))).toMatch(/^Cert Tool can't read this page\./);
    });

    it('passes other errors through', () => {
        expect(describeScanError(new Error('Receiving end does not exist.'))).toBe("Couldn't scan this page: Receiving end does not exist.");
        expect(describeScanError('weird')).toBe("Couldn't scan this page: weird");
    });

    it('names the action that failed', () => {
        expect(describeScanError(new Error('boom'), 'inspect the selection')).toBe("Couldn't inspect the selection: boom");
    });
});
