import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createSiteCertsListener, DEBUGGER_PROTOCOL_VERSION, describeSiteCertsError, fetchSiteCertificates, HEAD_REQUEST, type DebuggerApi,
} from '../../background/siteCerts';
import { NO_CERTIFICATE } from '../../site/cdp';
import { MSG_FETCH_SITE_CERTS, NOT_HTTPS } from '../../site/messages';
import { frameTree, requestWillBeSent, responseReceived, SITE_CHAIN, SITE_ORIGIN } from '../siteFixtures';

const EXTENSION_ID = 'abcdefghijklmnop';
const TAB = 7;

type Listener = (...args: any[]) => void;
type Emit = (method: string, params: unknown, tabId?: number) => void;

function fakeEvent() {
    const listeners = new Set<Listener>();
    return {
        listeners,
        addListener: vi.fn((l: Listener) => { listeners.add(l); }),
        removeListener: vi.fn((l: Listener) => { listeners.delete(l); }),
        emit: (...args: unknown[]) => { for (const l of [...listeners]) l(...args); },
    };
}

interface FakeOptions {
    /** Replaces the result of a command, or makes it fail when it returns an Error. */
    readonly results?: Readonly<Record<string, unknown>>;
    /** What the page's request makes Chrome report; by default one TLS 1.3 response from the site. */
    readonly onRequest?: (emit: Emit) => void;
    readonly attach?: () => Promise<void>;
    readonly detach?: () => Promise<void>;
}

/** The page's HEAD request and Chrome's response to it, as the Network domain reports them. */
const sendHead = (response = responseReceived()) => (emit: Emit) => {
    emit('Network.requestWillBeSent', requestWillBeSent('HEAD', response.requestId));
    emit('Network.responseReceived', response);
};

function fakeApi(options: FakeOptions = {}) {
    const onEvent = fakeEvent();
    const emit: Emit = (method, params, tabId = TAB) => onEvent.emit({ tabId }, method, params);
    const defaults: Record<string, unknown> = {
        'Page.getFrameTree': frameTree(),
        'Page.createIsolatedWorld': { executionContextId: 31 },
        'Network.getCertificate': { tableNames: [...SITE_CHAIN] },
    };
    const api = {
        debugger: {
            attach: vi.fn(options.attach ?? (() => Promise.resolve())),
            detach: vi.fn(options.detach ?? (() => Promise.resolve())),
            sendCommand: vi.fn((_target: unknown, method: string, _params?: unknown) => {
                if (method === 'Runtime.evaluate') (options.onRequest ?? sendHead())(emit);
                const result = options.results && method in options.results ? options.results[method] : (defaults[method] ?? {});
                return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
            }),
            onEvent,
            onDetach: fakeEvent(),
        },
    };
    const methods = () => api.debugger.sendCommand.mock.calls.map(([, method]) => method);
    return { api, typed: api as unknown as DebuggerApi, methods };
}

let consoleWarn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { }); });
afterEach(() => { consoleWarn.mockRestore(); });

describe('fetchSiteCertificates', () => {
    it("reads the chain and connection of the tab's site, then detaches", async () => {
        const { api, typed } = fakeApi();
        expect(await fetchSiteCertificates(typed, TAB)).toEqual({
            origin: SITE_ORIGIN,
            chain: [...SITE_CHAIN],
            connection: { protocol: 'TLS 1.3', keyExchange: '', keyExchangeGroup: 'X25519MLKEM768', cipher: 'AES_128_GCM' },
            trusted: true,
        });
        expect(api.debugger.attach).toHaveBeenCalledWith({ tabId: TAB }, DEBUGGER_PROTOCOL_VERSION);
        expect(api.debugger.detach).toHaveBeenCalledWith({ tabId: TAB });
    });

    it('records the network first, then has the page request its site once, then asks for the certificate', async () => {
        const { methods, typed } = fakeApi();
        await fetchSiteCertificates(typed, TAB);
        expect(methods()).toEqual([
            'Page.getFrameTree', 'Network.enable', 'Network.setBypassServiceWorker', 'Page.createIsolatedWorld', 'Runtime.evaluate', 'Network.getCertificate',
        ]);
    });

    it("sends the request from an isolated world, out of the page's reach", async () => {
        const { api, typed } = fakeApi();
        await fetchSiteCertificates(typed, TAB);
        const call = (method: string) => api.debugger.sendCommand.mock.calls.find(([, m]) => m === method)?.[2];
        expect(call('Page.createIsolatedWorld')).toEqual({ frameId: 'F1', worldName: 'Cert Tool' });
        expect(call('Runtime.evaluate')).toEqual({ contextId: 31, expression: HEAD_REQUEST, awaitPromise: true, returnByValue: true });
        expect(call('Network.getCertificate')).toEqual({ origin: SITE_ORIGIN });
        expect(call('Network.setBypassServiceWorker')).toEqual({ bypass: true });
    });

    describe('the request the page sends', () => {
        interface Call { readonly url: string; readonly init: RequestInit }
        type Outcome = { status: number; redirected: boolean; url: string } | Error;
        /** Runs HEAD_REQUEST against a fake page and fetch, as the isolated world would. */
        async function run(pageUrl: string, respond: (url: string) => Outcome) {
            const calls: Call[] = [];
            const fetch = (url: URL | string, init: RequestInit) => {
                calls.push({ url: String(url), init });
                const outcome = respond(String(url));
                return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
            };
            const status = await new Function('fetch', 'location', `return ${HEAD_REQUEST};`)(fetch, new URL(pageUrl));
            return { status, urls: calls.map(c => c.url), calls };
        }
        const direct = (status = 200) => (url: string): Outcome => ({ status, redirected: false, url });

        it('asks for the site root with HEAD, staying on the site, without cookies or a referrer', async () => {
            const { status, calls } = await run('https://www.example.com/account/settings?tab=keys#top', direct());
            expect(status).toBe(200);
            expect(calls).toEqual([{
                url: 'https://www.example.com/',
                init: { method: 'HEAD', mode: 'same-origin', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' },
            }]);
        });

        it('asks again for the page the root redirects to, since Chrome keeps no certificate after a redirect', async () => {
            const { status, urls } = await run('https://en.example.org/wiki/Example', url => (url === 'https://en.example.org/'
                ? { status: 200, redirected: true, url: 'https://en.example.org/wiki/Main_Page' }
                : { status: 204, redirected: false, url }));
            expect(status).toBe(204);
            expect(urls).toEqual(['https://en.example.org/', 'https://en.example.org/wiki/Main_Page']);
        });

        it('never sends the path of the page the user is on', async () => {
            const { urls } = await run('https://www.example.com/reset/one-time-token', () => new TypeError('Failed to fetch'));
            expect(urls).toEqual(['https://www.example.com/']);
        });

        it('gives up quietly when the root leaves the site or keeps redirecting', async () => {
            expect((await run('https://docs.example.com/guide', () => new TypeError('Failed to fetch'))).status).toBe(0);
            const looping = await run('https://www.example.com/', url => ({ status: 200, redirected: true, url: `${url}x` }));
            expect(looping.status).toBe(0);
            expect(looping.urls).toHaveLength(2);
        });
    });

    it("reads the connection from the HEAD request's own response, not the page's other traffic or other tabs", async () => {
        const { typed } = fakeApi({
            onRequest: (emit) => {
                emit('Network.requestWillBeSent', requestWillBeSent('GET', '9.1', `${SITE_ORIGIN}/app.js`));
                emit('Network.responseReceived', { ...responseReceived({}, { protocol: 'QUIC' }), requestId: '9.1' });
                emit('Network.requestWillBeSent', requestWillBeSent('HEAD', '1.1'), TAB + 1);
                emit('Network.responseReceived', responseReceived({}, { protocol: 'TLS 1.2' }), TAB + 1);
                sendHead()(emit);
            },
        });
        expect((await fetchSiteCertificates(typed, TAB)).connection.protocol).toBe('TLS 1.3');
    });

    it('fails when only the page\'s own requests answered', async () => {
        const { typed } = fakeApi({ onRequest: emit => emit('Network.responseReceived', { ...responseReceived(), requestId: '9.1' }) });
        await expect(fetchSiteCertificates(typed, TAB)).rejects.toThrow(NO_CERTIFICATE);
    });

    it('reports when Chrome did not accept the certificate', async () => {
        const { typed } = fakeApi({ onRequest: sendHead(responseReceived({ securityState: 'insecure' })) });
        expect((await fetchSiteCertificates(typed, TAB)).trusted).toBe(false);
    });

    it('stops at a page that is not on HTTPS, before touching the network', async () => {
        const { api, methods, typed } = fakeApi({ results: { 'Page.getFrameTree': frameTree({ securityOrigin: 'http://www.example.com' }) } });
        await expect(fetchSiteCertificates(typed, TAB)).rejects.toThrow(NOT_HTTPS);
        expect(methods()).toEqual(['Page.getFrameTree']);
        expect(api.debugger.detach).toHaveBeenCalledOnce();
    });

    it('fails when the site sent no response to read a certificate from', async () => {
        const { typed } = fakeApi({ onRequest: () => { }, results: { 'Network.getCertificate': { tableNames: [] } } });
        await expect(fetchSiteCertificates(typed, TAB)).rejects.toThrow(NO_CERTIFICATE);
    });

    it('fails when Chrome reported the certificate but not the connection', async () => {
        const { typed } = fakeApi({ onRequest: () => { } });
        await expect(fetchSiteCertificates(typed, TAB)).rejects.toThrow(NO_CERTIFICATE);
    });

    it('removes its event listener afterwards, also on failure', async () => {
        const ok = fakeApi();
        await fetchSiteCertificates(ok.typed, TAB);
        expect(ok.api.debugger.onEvent.listeners.size).toBe(0);
        const failing = fakeApi({ results: { 'Network.enable': new Error('boom') } });
        await expect(fetchSiteCertificates(failing.typed, TAB)).rejects.toThrow('boom');
        expect(failing.api.debugger.onEvent.listeners.size).toBe(0);
        expect(failing.api.debugger.detach).toHaveBeenCalledOnce();
    });

    it('gives up when Chrome does not answer', async () => {
        const { api, typed } = fakeApi();
        // The page's request never settles.
        api.debugger.sendCommand.mockImplementation((_t: unknown, method: string) =>
            method === 'Runtime.evaluate' ? new Promise(() => { }) : Promise.resolve(method === 'Page.getFrameTree' ? frameTree() : { executionContextId: 31 }));
        await expect(fetchSiteCertificates(typed, TAB, 10)).rejects.toThrow('Chrome took too long to answer.');
        expect(api.debugger.detach).toHaveBeenCalledOnce();
    });

    it('does not detach when it could not attach', async () => {
        const { api, typed } = fakeApi({ attach: () => Promise.reject(new Error('Cannot access a chrome:// URL')) });
        await expect(fetchSiteCertificates(typed, TAB)).rejects.toThrow('Cannot access a chrome:// URL');
        expect(api.debugger.detach).not.toHaveBeenCalled();
        expect(api.debugger.onEvent.listeners.size).toBe(0);
    });

    it('still answers when detaching fails, e.g. because the tab closed', async () => {
        const { typed } = fakeApi({ detach: () => Promise.reject(new Error('No tab with given id')) });
        expect((await fetchSiteCertificates(typed, TAB)).chain).toHaveLength(3);
        expect(consoleWarn).toHaveBeenCalledWith('Cert Tool: could not detach the debugger', expect.any(Error));
    });
});

describe('describeSiteCertsError', () => {
    it.each([
        ['Cannot access a chrome:// URL'],
        ['Cannot attach to this target.'],
    ])('explains pages that extensions may not debug (%s)', (message) => {
        expect(describeSiteCertsError(new Error(message))).toMatch(/^Cert Tool can't read the certificate of this page\./);
    });

    it('explains a tab that is already being read', () => {
        expect(describeSiteCertsError(new Error('Another debugger is already attached to the tab with id: 7.'))).toMatch(/already reading this tab/);
    });

    it('explains a canceled read, e.g. from the bar Chrome shows', () => {
        expect(describeSiteCertsError(new Error('Debugger is not attached to the tab with id: 7.'))).toBe('Reading the certificate was canceled.');
    });

    it.each([[NOT_HTTPS], [NO_CERTIFICATE]])('passes its own explanations through: %s', (message) => {
        expect(describeSiteCertsError(new Error(message))).toBe(message);
    });

    it('prefixes anything else', () => {
        expect(describeSiteCertsError('boom')).toBe("Couldn't read this site's certificate: boom");
    });
});

describe('createSiteCertsListener', () => {
    const popup = { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/index.html` } as chrome.runtime.MessageSender;
    const request = { type: MSG_FETCH_SITE_CERTS, tabId: TAB };

    it('answers the popup asynchronously with the chain', async () => {
        const { typed } = fakeApi();
        const sendResponse = vi.fn();
        expect(createSiteCertsListener(typed, EXTENSION_ID)(request, popup, sendResponse)).toBe(true);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
        expect(sendResponse.mock.calls[0][0]).toEqual({ ok: true, site: expect.objectContaining({ chain: [...SITE_CHAIN] }) });
    });

    it('answers with a readable error', async () => {
        const { typed } = fakeApi({ attach: () => Promise.reject(new Error('Cannot access a chrome:// URL')) });
        const sendResponse = vi.fn();
        createSiteCertsListener(typed, EXTENSION_ID)(request, popup, sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
        expect(sendResponse.mock.calls[0][0]).toEqual({ ok: false, error: expect.stringMatching(/^Cert Tool can't read the certificate/) });
    });

    it.each([
        // Content scripts share the extension id but run inside web pages, which must never drive the debugger.
        ['a content script', request, { id: EXTENSION_ID, url: 'https://evil.example/', tab: { id: 3 } }],
        ['another extension', request, { id: 'someone-else', url: 'chrome-extension://someone-else/index.html' }],
        ['a page of another extension claiming this id', request, { id: EXTENSION_ID, url: 'chrome-extension://someone-else/index.html' }],
        ['a malformed request', { type: MSG_FETCH_SITE_CERTS, tabId: 'x' }, popup],
        ['an unrelated message', { type: 'other' }, popup],
    ])('ignores %s', (_name, msg, sender) => {
        const { api, typed } = fakeApi();
        const sendResponse = vi.fn();
        expect(createSiteCertsListener(typed, EXTENSION_ID)(msg, sender as chrome.runtime.MessageSender, sendResponse)).toBe(false);
        expect(api.debugger.attach).not.toHaveBeenCalled();
        expect(sendResponse).not.toHaveBeenCalled();
    });
});
