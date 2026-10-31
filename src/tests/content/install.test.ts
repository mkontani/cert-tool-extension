import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installContentScript, type ContentRuntime } from '../../content/install';
import { MSG_SCAN_PAGE } from '../../page/messages';
import { OVERLAY_ATTRIBUTE } from '../../content/overlay';

function fakeRuntime() {
    const runtime = {
        id: 'ext-id' as string | undefined,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        sendMessage: vi.fn(() => Promise.resolve([])),
    };
    return { runtime, typed: runtime as unknown as ContentRuntime };
}

let scope: Record<symbol, unknown>;

beforeEach(() => {
    scope = {};
    document.body.innerHTML = '<p>No certificates</p>';
    document.querySelectorAll(`[${OVERLAY_ATTRIBUTE}]`).forEach(host => host.remove());
});

describe('installContentScript', () => {
    it('registers one message listener', () => {
        const { runtime, typed } = fakeRuntime();
        expect(installContentScript(scope, typed, document)).toBe(true);
        expect(runtime.onMessage.addListener).toHaveBeenCalledOnce();
    });

    it('does nothing when injected again into the same page', () => {
        const { runtime, typed } = fakeRuntime();
        installContentScript(scope, typed, document);
        expect(installContentScript(scope, typed, document)).toBe(false);
        expect(runtime.onMessage.addListener).toHaveBeenCalledOnce();
    });

    it('replaces a copy orphaned by an extension update, removing its overlay', async () => {
        const old = fakeRuntime();
        installContentScript(scope, old.typed, document);
        const [listener] = old.runtime.onMessage.addListener.mock.calls[0] as unknown as [(msg: unknown, sender: unknown, reply: () => void) => boolean];
        listener({ type: MSG_SCAN_PAGE }, { id: 'ext-id' }, () => { });
        await vi.waitFor(() => expect(document.querySelector(`[${OVERLAY_ATTRIBUTE}]`)).not.toBeNull());

        // After an update, the old copy's chrome.runtime loses its id.
        old.runtime.id = undefined;
        const fresh = fakeRuntime();
        expect(installContentScript(scope, fresh.typed, document)).toBe(true);
        expect(old.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
        expect(fresh.runtime.onMessage.addListener).toHaveBeenCalledOnce();
        expect(document.querySelector(`[${OVERLAY_ATTRIBUTE}]`)).toBeNull();
    });

    it('treats a runtime that throws on access as orphaned', () => {
        const old = fakeRuntime();
        installContentScript(scope, old.typed, document);
        Object.defineProperty(old.runtime, 'id', { get: () => { throw new Error('Extension context invalidated.'); } });
        old.runtime.onMessage.removeListener.mockImplementation(() => { throw new Error('Extension context invalidated.'); });
        const fresh = fakeRuntime();
        expect(installContentScript(scope, fresh.typed, document)).toBe(true);
        expect(fresh.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    });
});
