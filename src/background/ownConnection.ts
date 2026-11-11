/**
 * Reads a site's certificate over Cert Tool's own connection, for when another extension's frame keeps the debugger off the tab.
 * Chrome refuses the debugger for a whole tab while any frame in it belongs to another extension, but Cert Tool may always debug
 * its own popup. So the popup asks the site for its home page, and Chrome reports the certificate of that connection.
 * The user's tab is never attached to: only its address is read, for the site's origin.
 */
import { lastResponseUrl, NO_CERTIFICATE, originOf, readChain, readPausedRequest, readResponseSecurity } from '../site/cdp';
import { isHttpsOrigin, NOT_HTTPS, type SiteCertificates } from '../site/messages';
import { isFrom, send, SITE_CERTS_TIMEOUT_MS, withDebugger, type DebuggerApi, type EventListener, type Target } from './debuggerSession';

/** The extension page that asked for the read: its address, and its tab when it is open in one rather than as the popup. */
export interface OwnPage {
    readonly url: string;
    readonly tabId?: number;
}

/**
 * Runs in Cert Tool's own page. no-cors keeps Chrome from adding an Origin header, which would name the extension to the site;
 * the response is opaque to the page, but Chrome still reports its certificate to the debugger.
 * Failures are left for Network.getCertificate to report, which then has nothing.
 */
export const ownPageHead = (url: string): string =>
    `fetch(${JSON.stringify(url)}, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }).then(() => true, () => false)`;

type TargetInfo = chrome.debugger.TargetInfo;

/** Only web requests are held, so the popup's own files keep loading while Cert Tool reads. */
const HELD_REQUESTS = [{ urlPattern: 'http://*', requestStage: 'Request' }, { urlPattern: 'https://*', requestStage: 'Request' }];

/** The https:// origin of the page in the tab, from the address Chrome lists for it. */
function tabOrigin(targets: readonly TargetInfo[], tabId: number): string {
    const origins = new Set(targets.filter(t => t.type === 'page' && t.tabId === tabId).map(t => originOf(t.url)));
    if (origins.size !== 1) throw new Error("Cert Tool couldn't tell which page is in the tab.");
    const [origin] = origins;
    // e.g. another extension's own page, for which Chrome gives the same error as for its frames.
    if (!isHttpsOrigin(origin)) throw new Error(NOT_HTTPS);
    return origin;
}

const withoutFragment = (url: string): string => url.split('#')[0];

/** The page that asked: its tab, or else the popup, which Chrome lists as a target without a tab. */
function ownTarget(targets: readonly TargetInfo[], page: OwnPage): Target {
    if (page.tabId !== undefined) return { tabId: page.tabId };
    const popups = targets.filter(t => t.tabId === undefined && withoutFragment(t.url) === withoutFragment(page.url));
    if (popups.length !== 1) throw new Error("Cert Tool couldn't find its own popup to read the certificate from.");
    return { targetId: popups[0].id };
}

/**
 * Lets through only the page's requests to the site, so a redirect to another site is never followed.
 * The Fetch domain holds each web request until it is answered here, so every one gets an answer, even one Chrome describes oddly.
 */
function allowOnlySite(api: DebuggerApi, target: Target, origin: string) {
    const command = send(api, target);
    const listener: EventListener = (source, method, params) => {
        if (method !== 'Fetch.requestPaused' || !isFrom(source, target)) return;
        const request = readPausedRequest(params);
        if (!request) return;
        const answer = request.url !== undefined && originOf(request.url) === origin
            ? command('Fetch.continueRequest', { requestId: request.id })
            : command('Fetch.failRequest', { requestId: request.id, errorReason: 'BlockedByClient' });
        answer.catch((e: unknown) => console.warn('Cert Tool: could not answer a held request', e));
    };
    api.debugger.onEvent.addListener(listener);
    return { stop: () => api.debugger.onEvent.removeListener(listener) };
}

/** The URL as the URL parser writes it, with quotes, spaces and the like percent-encoded; the site chose it, so it is kept tame. */
function normalized(url: string | undefined): string | undefined {
    try {
        return url === undefined ? undefined : new URL(url).href;
    } catch {
        return undefined;
    }
}

async function readOverOwnConnection(api: DebuggerApi, target: Target, origin: string, responses: readonly unknown[]): Promise<SiteCertificates> {
    const command = send(api, target);
    const head = (url: string) => command('Runtime.evaluate', { expression: ownPageHead(url), awaitPromise: true, returnByValue: true });
    await command('Network.enable');
    await command('Fetch.enable', { patterns: HELD_REQUESTS });
    const root = `${origin}/`;
    await head(root);
    // Chrome keeps no certificate for a response reached through a redirect, so the page on the site the root redirects to is asked for directly.
    const landed = normalized(lastResponseUrl(responses));
    if (!readResponseSecurity(responses, origin) && landed !== undefined && landed !== root && originOf(landed) === origin) await head(landed);
    const chain = readChain(await command('Network.getCertificate', { origin }));
    const security = readResponseSecurity(responses, origin);
    if (!security) throw new Error(NO_CERTIFICATE);
    return { origin, chain, ...security, via: 'cert-tool' };
}

/** Reads the certificate of the tab's site over Cert Tool's own connection, from the page that asked. */
export async function fetchOverOwnConnection(api: DebuggerApi, tabId: number, page: OwnPage, timeoutMs = SITE_CERTS_TIMEOUT_MS): Promise<SiteCertificates> {
    const targets = await api.debugger.getTargets();
    const origin = tabOrigin(targets, tabId);
    const target = ownTarget(targets, page);
    const guard = allowOnlySite(api, target, origin);
    try {
        return await withDebugger(api, target, timeoutMs, responses => readOverOwnConnection(api, target, origin, responses));
    } finally {
        guard.stop();
    }
}
