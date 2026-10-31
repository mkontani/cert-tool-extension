import { describe, it, expect, vi } from 'vitest';
import { createBackgroundParser } from '../../content/parse';
import { MSG_INSPECT_TEXTS } from '../../page/messages';

const SCAN = { items: [], truncated: false };
const runtimeWith = (sendMessage: (msg: unknown) => Promise<unknown>) => ({ sendMessage: vi.fn(sendMessage) });

describe('createBackgroundParser', () => {
    it('asks the background to parse the texts', async () => {
        const runtime = runtimeWith(() => Promise.resolve([SCAN, SCAN]));
        await expect(createBackgroundParser(runtime)(['a', 'b'])).resolves.toEqual([SCAN, SCAN]);
        expect(runtime.sendMessage).toHaveBeenCalledWith({ type: MSG_INSPECT_TEXTS, texts: ['a', 'b'] });
    });

    it('retries once while the service worker is starting', async () => {
        const runtime = runtimeWith(vi.fn()
            .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
            .mockResolvedValueOnce([SCAN]));
        await expect(createBackgroundParser(runtime)(['a'])).resolves.toEqual([SCAN]);
        expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('does not retry other failures', async () => {
        const runtime = runtimeWith(() => Promise.reject(new Error('Extension context invalidated.')));
        await expect(createBackgroundParser(runtime)(['a'])).rejects.toThrow('Extension context invalidated.');
        expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('rejects a reply that does not match the request', async () => {
        const runtime = runtimeWith(() => Promise.resolve([SCAN]));
        await expect(createBackgroundParser(runtime)(['a', 'b'])).rejects.toThrow('Cert Tool could not parse the certificates on this page.');
    });
});
