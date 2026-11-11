import { NO_CERTIFICATE, readChain, readContextId, readMainFrame, readResponseSecurity } from '../site/cdp';
import { isFetchSiteCertsRequest, isHttpsOrigin, NOT_HTTPS, type SiteCertificates, type SiteCertsReply } from '../site/messages';
import { send, SITE_CERTS_TIMEOUT_MS, withDebugger, type DebuggerApi, type Target } from './debuggerSession';
import { fetchOverOwnConnection, type OwnPage } from './ownConnection';

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

async function readSite(api: DebuggerApi, target: Target, responses: readonly unknown[]): Promise<SiteCertificates> {
    const command = send(api, target);
    const frame = readMainFrame(await command('Page.getFrameTree'));
    if (!isHttpsOrigin(frame.origin)) throw new Error(NOT_HTTPS);
    await command('Network.enable');
    // A service worker could answer from its cache, and such responses carry no certificate.
    await command('Network.setBypassServiceWorker', { bypass: true });
    const contextId = readContextId(await command('Page.createIsolatedWorld', { frameId: frame.id, worldName: WORLD_NAME }));
    await command('Runtime.evaluate', { contextId, expression: HEAD_REQUEST, awaitPromise: true, returnByValue: true });
    const chain = readChain(await command('Network.getCertificate', { origin: frame.origin }));
    const security = readResponseSecurity(responses, frame.origin);
    if (!security) throw new Error(NO_CERTIFICATE);
    return { origin: frame.origin, chain, ...security, via: 'tab' };
}

/**
 * Reads the certificate chain Chrome verified for the site of the page in a tab, with how its connection is secured.
 * The debugger is attached only for this one read and nothing on the page is read or changed;
 * the only effect is the one request described at HEAD_REQUEST.
 */
export async function fetchSiteCertificates(api: DebuggerApi, tabId: number, timeoutMs = SITE_CERTS_TIMEOUT_MS): Promise<SiteCertificates> {
    const target = { tabId };
    return withDebugger(api, target, timeoutMs, responses => readSite(api, target, responses));
}

/**
 * Chrome refuses the debugger for a whole tab while any frame in it belongs to another extension,
 * such as the bar Vimium adds the first time it opens on a page, which stays until the page reloads.
 * Checked before RESTRICTED_PAGE, which also matches it.
 */
const OTHER_EXTENSION_FRAME = /of different extension/i;
/** Pages Chrome keeps the debugger off, such as chrome:// pages and the Chrome Web Store, are rejected with these messages. */
const RESTRICTED_PAGE = /cannot access|cannot attach|cannot be scripted/i;
const ALREADY_ATTACHED = /already attached/i;
/** The user pressed Cancel on Chrome's debugging bar, or the tab closed, while the read was under way. */
const DETACHED = /not attached/i;
const OWN_MESSAGES: readonly string[] = [NOT_HTTPS, NO_CERTIFICATE];

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Reads the certificate of the tab's site from the tab itself, or, when another extension's frame keeps the debugger off the tab,
 * over Cert Tool's own connection from the page that asked. If that fails too, the tab's error stands, since it says what to do.
 */
export async function readSiteCertificates(api: DebuggerApi, tabId: number, page: OwnPage, timeoutMs = SITE_CERTS_TIMEOUT_MS): Promise<SiteCertificates> {
    try {
        return await fetchSiteCertificates(api, tabId, timeoutMs);
    } catch (e: unknown) {
        if (!OTHER_EXTENSION_FRAME.test(messageOf(e))) throw e;
        try {
            return await fetchOverOwnConnection(api, tabId, page, timeoutMs);
        } catch (ownError: unknown) {
            console.warn('Cert Tool: could not read the site certificate over its own connection either', ownError);
            // The tab is not a web page on HTTPS after all, e.g. another extension's own page.
            if (messageOf(ownError) === NOT_HTTPS) throw ownError;
            throw e;
        }
    }
}

/** A message for the user when the certificate cannot be read. */
export function describeSiteCertsError(e: unknown): string {
    const message = messageOf(e);
    if (OTHER_EXTENSION_FRAME.test(message)) {
        return "Another extension has added its own frame to this page, such as a bar or panel it shows over the page, so Chrome blocks Cert Tool from the tab, and Cert Tool couldn't read the site's certificate over its own connection either. Reload the page, then click this button again before using that extension, or turn that extension off for this site.";
    }
    if (RESTRICTED_PAGE.test(message)) {
        return "Cert Tool can't read the certificate of this page. Browser pages and the Chrome Web Store are off-limits to extensions.";
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
        const url = sender.url;
        const fromExtensionPage = sender.id === extensionId && url !== undefined && url.startsWith(extensionOrigin);
        if (!fromExtensionPage || !isFetchSiteCertsRequest(msg)) return false;
        const page: OwnPage = { url, tabId: sender.tab?.id };
        readSiteCertificates(api, msg.tabId, page).then(
            site => sendResponse({ ok: true, site }),
            (e: unknown) => {
                console.warn('Cert Tool: could not read the site certificate', e);
                sendResponse({ ok: false, error: describeSiteCertsError(e) });
            },
        );
        return true; // Keeps the channel open for the asynchronous answer.
    };
}
