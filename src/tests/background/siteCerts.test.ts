import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEBUGGER_PROTOCOL_VERSION, type DebuggerApi } from '../../background/debuggerSession';
import { ownPageHead } from '../../background/ownConnection';
import { createSiteCertsListener, describeSiteCertsError, fetchSiteCertificates, HEAD_REQUEST, readSiteCertificates } from '../../background/siteCerts';
import { NO_CERTIFICATE } from '../../site/cdp';
import { MSG_FETCH_SITE_CERTS, NOT_HTTPS } from '../../site/messages';
import { frameTree, requestWillBeSent, responseReceived, SITE_CHAIN, SITE_ORIGIN } from '../siteFixtures';

const EXTENSION_ID = 'abcdefghijklmnop';
const TAB = 7;
const POPUP_URL = `chrome-extension://${EXTENSION_ID}/index.html`;
const POPUP_TARGET = 'POPUP-TARGET';
/** What Chrome says when another extension's frame is in the tab. */
const OTHER_EXTENSION_FRAME = 'Cannot access a chrome-extension:// URL of different extension';

type Listener = (...args: any[]) => void;
type Source = chrome.debugger.Debuggee;
type Emit = (method: string, params: unknown, source?: Source | number) => void;

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
    /** What a request sent with Runtime.evaluate makes Chrome report; by default one TLS 1.3 response from the site. */
    readonly onRequest?: (emit: Emit, target: Source, params: { expression: string }) => void;
    readonly attach?: (target: Source) => Promise<void>;
    readonly detach?: () => Promise<void>;
    /** The targets chrome.debugger.getTargets lists; by default the tab and the popup. */
    readonly targets?: readonly Partial<chrome.debugger.TargetInfo>[];
}

type TargetInfo = chrome.debugger.TargetInfo;
const TAB_TARGET: TargetInfo = { id: 'TAB-TARGET', type: 'page', tabId: TAB, url: `${SITE_ORIGIN}/account?token=secret`, attached: false, title: '' };
const POPUP_INFO: TargetInfo = { id: POPUP_TARGET, type: 'page', url: POPUP_URL, attached: false, title: '' };

/** A HEAD request and Chrome's response to it, as the Network domain reports them, from the target that sent it. */
const sendHead = (response = responseReceived()) => (emit: Emit, target: Source = { tabId: TAB }) => {
    emit('Network.requestWillBeSent', requestWillBeSent('HEAD', response.requestId), target);
    emit('Network.responseReceived', response, target);
};

/** The tab cannot be read because another extension's frame is on it; Cert Tool's own page can be. */
const blockedTab = (target: Source) => (target.tabId === TAB ? Promise.reject(new Error(OTHER_EXTENSION_FRAME)) : Promise.resolve());

function fakeApi(options: FakeOptions = {}) {
    const onEvent = fakeEvent();
    const emit: Emit = (method, params, source = { tabId: TAB }) => onEvent.emit(typeof source === 'number' ? { tabId: source } : source, method, params);
    const defaults: Record<string, unknown> = {
        'Page.getFrameTree': frameTree(),
        'Page.createIsolatedWorld': { executionContextId: 31 },
        'Network.getCertificate': { tableNames: [...SITE_CHAIN] },
    };
    const api = {
        debugger: {
            attach: vi.fn(options.attach ?? (() => Promise.resolve())),
            detach: vi.fn(options.detach ?? (() => Promise.resolve())),
            sendCommand: vi.fn((target: Source, method: string, params?: unknown) => {
                if (method === 'Runtime.evaluate') (options.onRequest ?? sendHead())(emit, target, params as { expression: string });
                const result = options.results && method in options.results ? options.results[method] : (defaults[method] ?? {});
                return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
            }),
            getTargets: vi.fn(() => Promise.resolve(options.targets ?? [TAB_TARGET, POPUP_INFO])),
            onEvent,
            onDetach: fakeEvent(),
        },
    };
    const calls = () => api.debugger.sendCommand.mock.calls.map(([target, method, params]) => ({ target, method, params }));
    const methods = () => calls().map(c => c.method);
    return { api, typed: api as unknown as DebuggerApi, methods, calls, emit };
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
            via: 'tab',
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

describe('ownPageHead', () => {
    /** Runs the expression as Runtime.evaluate would in Cert Tool's popup, with a fake fetch. */
    async function run(url: string, outcome: Promise<unknown> = Promise.resolve({ type: 'opaque' })) {
        const calls: unknown[][] = [];
        const fetch = (...args: unknown[]) => { calls.push(args); return outcome; };
        const sent = await new Function('fetch', `return ${ownPageHead(url)};`)(fetch);
        return { sent, calls };
    }

    it('sends HEAD without cookies, a referrer, the cache or an Origin header', async () => {
        const { sent, calls } = await run('https://www.example.com/');
        expect(sent).toBe(true);
        // no-cors keeps Chrome from adding an Origin header, which would name the extension to the site.
        expect(calls).toEqual([['https://www.example.com/', { method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }]]);
    });

    it('settles quietly when the request fails, leaving Network.getCertificate to report it', async () => {
        expect((await run('https://www.example.com/', Promise.reject(new TypeError('Failed to fetch')))).sent).toBe(false);
    });

    it.each([
        ['https://www.example.com/"+alert(1)+"\\\n'],
        ['https://www.example.com/`${alert(1)}`\u2028\u2029</script>'],
    ])('passes the URL as data, never as code: %s', async (url) => {
        expect((await run(url)).calls[0][0]).toBe(url);
    });
});

describe('readSiteCertificates', () => {
    const popup = { url: POPUP_URL };
    const ownCalls = (calls: ReturnType<typeof fakeApi>['calls']) => calls().filter(c => c.target.targetId === POPUP_TARGET);
    const paused = (requestId: string, url: string) => ({ requestId, request: { url, method: 'HEAD' } });

    it('reads the tab when it can, and says so', async () => {
        const { api, typed } = fakeApi();
        expect((await readSiteCertificates(typed, TAB, popup)).via).toBe('tab');
        expect(api.debugger.getTargets).not.toHaveBeenCalled();
    });

    it('passes other failures on without trying anything else', async () => {
        const { api, typed } = fakeApi({ attach: () => Promise.reject(new Error('Cannot access a chrome:// URL')) });
        await expect(readSiteCertificates(typed, TAB, popup)).rejects.toThrow('Cannot access a chrome:// URL');
        expect(api.debugger.getTargets).not.toHaveBeenCalled();
        expect(api.debugger.attach).toHaveBeenCalledOnce();
    });

    describe("when another extension's frame keeps the debugger off the tab", () => {
        it("reads the site over Cert Tool's own connection, from its popup", async () => {
            const { api, typed } = fakeApi({ attach: blockedTab });
            expect(await readSiteCertificates(typed, TAB, popup)).toEqual({
                origin: SITE_ORIGIN,
                chain: [...SITE_CHAIN],
                connection: { protocol: 'TLS 1.3', keyExchange: '', keyExchangeGroup: 'X25519MLKEM768', cipher: 'AES_128_GCM' },
                trusted: true,
                via: 'cert-tool',
            });
            expect(api.debugger.getTargets).toHaveBeenCalledOnce();
            expect(api.debugger.attach).toHaveBeenLastCalledWith({ targetId: POPUP_TARGET }, DEBUGGER_PROTOCOL_VERSION);
            expect(api.debugger.detach).toHaveBeenCalledOnce();
            expect(api.debugger.detach).toHaveBeenCalledWith({ targetId: POPUP_TARGET });
        });

        it('holds every request first, then asks for the site root, then for the certificate', async () => {
            const { calls, typed } = fakeApi({ attach: blockedTab });
            await readSiteCertificates(typed, TAB, popup);
            const own = ownCalls(calls);
            expect(own.map(c => c.method)).toEqual(['Network.enable', 'Fetch.enable', 'Runtime.evaluate', 'Network.getCertificate']);
            // Only web requests are held; the popup's own files keep loading.
            expect(own[1].params).toEqual({ patterns: [{ urlPattern: 'http://*', requestStage: 'Request' }, { urlPattern: 'https://*', requestStage: 'Request' }] });
            expect(own[2].params).toEqual({ expression: ownPageHead(`${SITE_ORIGIN}/`), awaitPromise: true, returnByValue: true });
            expect(own[3].params).toEqual({ origin: SITE_ORIGIN });
        });

        it('never sends the path of the page the user is on', async () => {
            const { calls, typed } = fakeApi({ attach: blockedTab });
            await readSiteCertificates(typed, TAB, popup);
            expect(JSON.stringify(ownCalls(calls))).not.toMatch(/account|token/);
        });

        it('lets requests to the site through and fails every one that would leave it, e.g. by a redirect', async () => {
            const { calls, typed } = fakeApi({
                attach: blockedTab,
                onRequest: (emit, target) => {
                    emit('Fetch.requestPaused', paused('R1', `${SITE_ORIGIN}/`), target);
                    emit('Fetch.requestPaused', paused('R2', 'https://elsewhere.example/'), target);
                    emit('Fetch.requestPaused', paused('R3', 'http://www.example.com/'), target);
                    emit('Fetch.requestPaused', paused('R4', 'not a url'), target);
                    emit('Fetch.requestPaused', paused('R5', `${SITE_ORIGIN}/`), { tabId: 99 }); // Someone else's.
                    emit('Fetch.requestPaused', { requestId: 'R6' }, target); // Held, but Chrome did not say where to.
                    sendHead()(emit, target);
                },
            });
            await readSiteCertificates(typed, TAB, popup);
            expect(ownCalls(calls).filter(c => /^Fetch\.(continue|fail)Request$/.test(c.method)).map(c => [c.method, c.params])).toEqual([
                ['Fetch.continueRequest', { requestId: 'R1' }],
                ['Fetch.failRequest', { requestId: 'R2', errorReason: 'BlockedByClient' }],
                ['Fetch.failRequest', { requestId: 'R3', errorReason: 'BlockedByClient' }],
                ['Fetch.failRequest', { requestId: 'R4', errorReason: 'BlockedByClient' }],
                ['Fetch.failRequest', { requestId: 'R6', errorReason: 'BlockedByClient' }],
            ]);
        });

        it('asks again for the page the root redirects to on the same site, since Chrome keeps no certificate after a redirect', async () => {
            const { calls, typed } = fakeApi({
                attach: blockedTab,
                onRequest: (emit, target, { expression }) => {
                    if (expression === ownPageHead(`${SITE_ORIGIN}/`)) {
                        sendHead(responseReceived({ url: `${SITE_ORIGIN}/home`, securityDetails: undefined }))(emit, target);
                    } else {
                        sendHead({ ...responseReceived({ url: `${SITE_ORIGIN}/home` }), requestId: '1.2' })(emit, target);
                    }
                },
            });
            expect((await readSiteCertificates(typed, TAB, popup)).via).toBe('cert-tool');
            expect(ownCalls(calls).filter(c => c.method === 'Runtime.evaluate').map(c => (c.params as { expression: string }).expression))
                .toEqual([ownPageHead(`${SITE_ORIGIN}/`), ownPageHead(`${SITE_ORIGIN}/home`)]);
        });

        it("ignores the tab's frames and other tabs when finding its site", async () => {
            const targets = [
                { ...TAB_TARGET, id: 'F', type: 'other' as const, url: 'chrome-extension://vimium/hud.html' },
                { ...TAB_TARGET, id: 'T9', tabId: 9, url: 'https://other.example/' },
                TAB_TARGET,
                POPUP_INFO,
            ];
            const { typed } = fakeApi({ attach: blockedTab, targets });
            expect((await readSiteCertificates(typed, TAB, popup)).origin).toBe(SITE_ORIGIN);
        });

        it('asks for the landing page in the form the URL parser writes it', async () => {
            const { calls, typed } = fakeApi({
                attach: blockedTab,
                onRequest: (emit, target, { expression }) => {
                    const landing = `${SITE_ORIGIN}/a b"c`;
                    if (expression === ownPageHead(`${SITE_ORIGIN}/`)) sendHead(responseReceived({ url: landing, securityDetails: undefined }))(emit, target);
                    else sendHead({ ...responseReceived({ url: landing }), requestId: '1.2' })(emit, target);
                },
            });
            await readSiteCertificates(typed, TAB, popup);
            expect(ownCalls(calls).filter(c => c.method === 'Runtime.evaluate').at(-1)?.params)
                .toEqual({ expression: ownPageHead(`${SITE_ORIGIN}/a%20b%22c`), awaitPromise: true, returnByValue: true });
        });

        it('reads the page it was asked from when that is a tab', async () => {
            const { api, typed } = fakeApi({ attach: blockedTab });
            expect((await readSiteCertificates(typed, TAB, { url: POPUP_URL, tabId: 12 })).via).toBe('cert-tool');
            expect(api.debugger.attach).toHaveBeenLastCalledWith({ tabId: 12 }, DEBUGGER_PROTOCOL_VERSION);
        });

        it.each<[string, FakeOptions]>([
            ['the tab is not among the targets', { targets: [POPUP_INFO] }],
            ['the tab lists pages of two sites', { targets: [TAB_TARGET, { ...TAB_TARGET, id: 'T2', url: 'https://other.example/' }, POPUP_INFO] }],
            ['the popup is not among the targets', { targets: [TAB_TARGET] }],
            ['two pages could be the popup', { targets: [TAB_TARGET, { ...POPUP_INFO, id: 'A' }, { ...POPUP_INFO, id: 'B' }] }],
        ])('keeps the explanation for the tab when %s', async (_name, options) => {
            const { api, typed } = fakeApi({ attach: blockedTab, ...options });
            await expect(readSiteCertificates(typed, TAB, popup)).rejects.toThrow(OTHER_EXTENSION_FRAME);
            expect(api.debugger.attach).toHaveBeenCalledOnce();
        });

        it.each([
            ['http://www.example.com/'],
            // Chrome gives the same error when the tab itself is another extension's page.
            ['chrome-extension://someone-else/page.html'],
        ])('says there is no certificate when the tab turns out not to be on HTTPS: %s', async (url) => {
            const { api, typed } = fakeApi({ attach: blockedTab, targets: [{ ...TAB_TARGET, url }, POPUP_INFO] });
            await expect(readSiteCertificates(typed, TAB, popup)).rejects.toThrow(NOT_HTTPS);
            expect(api.debugger.attach).toHaveBeenCalledOnce();
        });

        it("finds its popup even when the popup's address has gained a fragment", async () => {
            const { api, typed } = fakeApi({ attach: blockedTab });
            expect((await readSiteCertificates(typed, TAB, { url: `${POPUP_URL}#inspector` })).via).toBe('cert-tool');
            expect(api.debugger.attach).toHaveBeenLastCalledWith({ targetId: POPUP_TARGET }, DEBUGGER_PROTOCOL_VERSION);
        });

        it('keeps the explanation for the tab when the site does not answer it either, and cleans up', async () => {
            const { api, typed } = fakeApi({ attach: blockedTab, onRequest: () => { }, results: { 'Network.getCertificate': { tableNames: [] } } });
            await expect(readSiteCertificates(typed, TAB, popup)).rejects.toThrow(OTHER_EXTENSION_FRAME);
            expect(api.debugger.detach).toHaveBeenCalledWith({ targetId: POPUP_TARGET });
            expect(api.debugger.onEvent.listeners.size).toBe(0);
            expect(consoleWarn).toHaveBeenCalledWith("Cert Tool: could not read the site certificate over its own connection either", expect.any(Error));
        });

        it('gives up when Chrome does not answer', async () => {
            const { api, typed } = fakeApi({ attach: blockedTab });
            api.debugger.sendCommand.mockImplementation(((_t: Source, method: string) =>
                (method === 'Runtime.evaluate' ? new Promise(() => { }) : Promise.resolve({}))) as never);
            await expect(readSiteCertificates(typed, TAB, popup, 10)).rejects.toThrow(OTHER_EXTENSION_FRAME);
            expect(api.debugger.detach).toHaveBeenCalledWith({ targetId: POPUP_TARGET });
        });

        it('removes its event listener after a successful read', async () => {
            const { api, typed } = fakeApi({ attach: blockedTab });
            await readSiteCertificates(typed, TAB, popup);
            expect(api.debugger.onEvent.listeners.size).toBe(0);
        });
    });
});

describe('describeSiteCertsError', () => {
    it.each([
        ['Cannot access a chrome:// URL'],
        ['Cannot attach to this target.'],
        // What Chrome says for the Chrome Web Store, which is served over HTTPS and so gets past the popup's own check.
        ['The extensions gallery cannot be scripted.'],
    ])('explains pages that extensions may not debug (%s)', (message) => {
        expect(describeSiteCertsError(new Error(message))).toMatch(/^Cert Tool can't read the certificate of this page\./);
    });

    // Chrome refuses the debugger for a whole tab while any frame in it belongs to another extension,
    // e.g. the bar Vimium adds on first use, which stays until the page is reloaded.
    it("explains another extension's frame on the page, and how to get past it", () => {
        const text = describeSiteCertsError(new Error('Cannot access a chrome-extension:// URL of different extension'));
        expect(text).toMatch(/^Another extension has added its own frame to this page/);
        expect(text).toMatch(/Reload the page/);
        expect(text).not.toMatch(/Browser pages/);
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
    const popup = { id: EXTENSION_ID, url: POPUP_URL } as chrome.runtime.MessageSender;
    const request = { type: MSG_FETCH_SITE_CERTS, tabId: TAB };

    it('answers the popup asynchronously with the chain', async () => {
        const { typed } = fakeApi();
        const sendResponse = vi.fn();
        expect(createSiteCertsListener(typed, EXTENSION_ID)(request, popup, sendResponse)).toBe(true);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
        expect(sendResponse.mock.calls[0][0]).toEqual({ ok: true, site: expect.objectContaining({ chain: [...SITE_CHAIN] }) });
    });

    it("reads through its own popup when another extension's frame blocks the tab", async () => {
        const { api, typed } = fakeApi({ attach: blockedTab });
        const sendResponse = vi.fn();
        createSiteCertsListener(typed, EXTENSION_ID)(request, popup, sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
        expect(sendResponse.mock.calls[0][0]).toEqual({ ok: true, site: expect.objectContaining({ via: 'cert-tool' }) });
        expect(api.debugger.attach).toHaveBeenLastCalledWith({ targetId: POPUP_TARGET }, DEBUGGER_PROTOCOL_VERSION);
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
