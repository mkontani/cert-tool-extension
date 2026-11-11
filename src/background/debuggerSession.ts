/** What both ways of reading a site's certificate share: the debugger they drive, and how they listen to and time a read. */
import { headRequestId, MAX_HEAD_REQUESTS, responseRequestId } from '../site/cdp';

/** The DevTools protocol version chrome.debugger.attach asks for; every Chrome that runs this extension speaks it. */
export const DEBUGGER_PROTOCOL_VERSION = '1.3';
/** The whole read takes well under a second; this only matters when the site or Chrome never answers. */
export const SITE_CERTS_TIMEOUT_MS = 10_000;

export interface DebuggerApi {
    readonly debugger: Pick<typeof chrome.debugger, 'attach' | 'detach' | 'sendCommand' | 'onEvent' | 'getTargets'>;
}

export type Target = chrome.debugger.Debuggee;
export type EventListener = Parameters<typeof chrome.debugger.onEvent.addListener>[0];

/** Whether a debugger event came from the target Cert Tool attached to, as a tab or by target id. */
export const isFrom = (source: Target, target: Target): boolean =>
    (target.tabId !== undefined ? source.tabId === target.tabId : source.targetId !== undefined && source.targetId === target.targetId);

export const send = (api: DebuggerApi, target: Target) => (method: string, params?: Record<string, unknown>) =>
    api.debugger.sendCommand(target, method, params);

/**
 * Collects the responses to HEAD requests from one target, from which the connection details are read.
 * Matching by request id keeps the page's own traffic, which may be on another connection, out of the result.
 */
export function watchHeadResponses(api: DebuggerApi, target: Target) {
    const headIds = new Set<string>();
    const events: unknown[] = [];
    const listener: EventListener = (source, method, params) => {
        if (!isFrom(source, target)) return;
        if (method === 'Network.requestWillBeSent') {
            const id = headRequestId(params);
            if (id !== undefined && headIds.size < MAX_HEAD_REQUESTS) headIds.add(id);
        } else if (method === 'Network.responseReceived') {
            const id = responseRequestId(params);
            if (id !== undefined && headIds.has(id) && events.length < MAX_HEAD_REQUESTS) events.push(params);
        }
    };
    api.debugger.onEvent.addListener(listener);
    return { events, stop: () => api.debugger.onEvent.removeListener(listener) };
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Chrome took too long to answer.')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Attaches the debugger to a target for one read, and always detaches it again,
 * which also hides Chrome's "started debugging this browser" bar.
 */
export async function withDebugger<T>(api: DebuggerApi, target: Target, timeoutMs: number, read: (responses: readonly unknown[]) => Promise<T>): Promise<T> {
    await api.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
    const responses = watchHeadResponses(api, target);
    try {
        return await withTimeout(read(responses.events), timeoutMs);
    } finally {
        responses.stop();
        await api.debugger.detach(target).catch((e: unknown) => console.warn('Cert Tool: could not detach the debugger', e));
    }
}
