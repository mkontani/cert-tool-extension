import { headRequestId, MAX_HEAD_REQUESTS, NO_CERTIFICATE, readChain, readContextId, readMainFrame, readResponseSecurity, responseRequestId } from '../site/cdp';
import { isFetchSiteCertsRequest, isHttpsOrigin, NOT_HTTPS, type SiteCertificates, type SiteCertsReply } from '../site/messages';

/** The DevTools protocol version chrome.debugger.attach asks for; every Chrome that runs this extension speaks it. */
export const DEBUGGER_PROTOCOL_VERSION = '1.3';
/** The whole read takes well under a second; this only matters when the site or Chrome never answers. */
export const SITE_CERTS_TIMEOUT_MS = 10_000;
const WORLD_NAME = 'Cert Tool';

/**
 * Run in the page's isolated world, so the page's own scripts cannot see or change it.
 * Network.getCertificate only knows responses that arrived after Network.enable, and the page itself loaded before that,
 * so the page asks its site for one more: a HEAD of the site root, without cookies.
 * Chrome keeps no certificate for a response reached through a redirect, so when the root redirects, the page it redirects to
 * is asked for directly. Same-origin mode refuses to follow a redirect to another site, and the path of the page the user is on
 * is never sent, since it may hold a one-time token.
 * Failures are left for Network.getCertificate to report, which then has nothing.
 */
export const HEAD_REQUEST = `(async () => {
    const options = { method: 'HEAD', mode: 'same-origin', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
    try {
        const root = await fetch(new URL('/', location.href), options);
        if (!root.redirected) return root.status;
        const target = await fetch(root.url, options);
        return target.redirected ? 0 : target.status;
    } catch {
        return 0; // A network error, or a redirect to another site.
    }
})()`;

export interface DebuggerApi {
    readonly debugger: Pick<typeof chrome.debugger, 'attach' | 'detach' | 'sendCommand' | 'onEvent'>;
}

type Target = chrome.debugger.Debuggee;
type EventListener = Parameters<typeof chrome.debugger.onEvent.addListener>[0];

/**
 * Collects the responses to HEAD requests in one tab, from which the connection details are read.
 * Matching by request id keeps the page's own traffic, which may be on another connection, out of the result.
 */
function watchHeadResponses(api: DebuggerApi, tabId: number) {
    const headIds = new Set<string>();
    const events: unknown[] = [];
    const listener: EventListener = (source, method, params) => {
        if (source.tabId !== tabId) return;
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

async function readSite(api: DebuggerApi, target: Target, responses: readonly unknown[]): Promise<SiteCertificates> {
    const send = (method: string, params?: Record<string, unknown>) => api.debugger.sendCommand(target, method, params);
    const frame = readMainFrame(await send('Page.getFrameTree'));
    if (!isHttpsOrigin(frame.origin)) throw new Error(NOT_HTTPS);
    await send('Network.enable');
    // A service worker could answer from its cache, and such responses carry no certificate.
    await send('Network.setBypassServiceWorker', { bypass: true });
    const contextId = readContextId(await send('Page.createIsolatedWorld', { frameId: frame.id, worldName: WORLD_NAME }));
    await send('Runtime.evaluate', { contextId, expression: HEAD_REQUEST, awaitPromise: true, returnByValue: true });
    const chain = readChain(await send('Network.getCertificate', { origin: frame.origin }));
    const security = readResponseSecurity(responses, frame.origin);
    if (!security) throw new Error(NO_CERTIFICATE);
    return { origin: frame.origin, chain, ...security };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Chrome took too long to answer.')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reads the certificate chain Chrome verified for the site of the page in a tab, with how its connection is secured.
 * The debugger is attached only for this one read and nothing on the page is read or changed;
 * the only effect is the one request described at HEAD_REQUEST.
 */
export async function fetchSiteCertificates(api: DebuggerApi, tabId: number, timeoutMs = SITE_CERTS_TIMEOUT_MS): Promise<SiteCertificates> {
    const target = { tabId };
    await api.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
    const responses = watchHeadResponses(api, tabId);
    try {
        return await withTimeout(readSite(api, target, responses.events), timeoutMs);
    } finally {
        responses.stop();
        // Detaching also hides Chrome's "started debugging this browser" bar.
        await api.debugger.detach(target).catch((e: unknown) => console.warn('Cert Tool: could not detach the debugger', e));
    }
}

/** chrome:// pages, the Chrome Web Store and other extensions' pages reject the debugger with these messages. */
const RESTRICTED_PAGE = /cannot access|cannot attach/i;
const ALREADY_ATTACHED = /already attached/i;
/** The user pressed Cancel on Chrome's debugging bar, or the tab closed, while the read was under way. */
const DETACHED = /not attached/i;
const OWN_MESSAGES: readonly string[] = [NOT_HTTPS, NO_CERTIFICATE];

/** A message for the user when the certificate cannot be read. */
export function describeSiteCertsError(e: unknown): string {
    const message = e instanceof Error ? e.message : String(e);
    if (RESTRICTED_PAGE.test(message)) {
        return "Cert Tool can't read the certificate of this page. Browser pages, the Chrome Web Store, and other extensions' pages are off-limits to extensions.";
    }
    if (ALREADY_ATTACHED.test(message)) return 'Cert Tool is already reading this tab. Try again in a moment.';
    if (DETACHED.test(message)) return 'Reading the certificate was canceled.';
    if (OWN_MESSAGES.includes(message)) return message;
    return `Couldn't read this site's certificate: ${message}`;
}

/**
 * Answers the popup's requests for a tab's certificate chain.
 * Only extension pages may ask: content scripts share the extension id but run inside web pages, which must never drive the debugger.
 */
export function createSiteCertsListener(api: DebuggerApi, extensionId: string) {
    const extensionOrigin = `chrome-extension://${extensionId}/`;
    return (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (reply: SiteCertsReply) => void): boolean => {
        const fromExtensionPage = sender.id === extensionId && sender.url?.startsWith(extensionOrigin) === true;
        if (!fromExtensionPage || !isFetchSiteCertsRequest(msg)) return false;
        fetchSiteCertificates(api, msg.tabId).then(
            site => sendResponse({ ok: true, site }),
            (e: unknown) => {
                console.warn('Cert Tool: could not read the site certificate', e);
                sendResponse({ ok: false, error: describeSiteCertsError(e) });
            },
        );
        return true; // Keeps the channel open for the asynchronous answer.
    };
}
