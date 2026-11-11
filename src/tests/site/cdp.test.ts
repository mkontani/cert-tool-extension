import { describe, it, expect } from 'vitest';
import { headRequestId, lastResponseUrl, originOf, readChain, readPausedRequest, readContextId, readMainFrame, readResponseSecurity, responseRequestId, NO_CERTIFICATE, UNEXPECTED } from '../../site/cdp';
import { MAX_CERT_BASE64_LENGTH, MAX_CHAIN_LENGTH } from '../../site/messages';
import { frameTree, requestWillBeSent, responseReceived, SITE_CHAIN, SITE_ORIGIN } from '../siteFixtures';

describe('readMainFrame', () => {
    it("reads the top frame's id and origin", () => {
        expect(readMainFrame(frameTree())).toEqual({ id: 'F1', origin: SITE_ORIGIN });
    });

    it.each([
        ['nothing', undefined],
        ['a frame without an origin', frameTree({ securityOrigin: undefined })],
        ['a frame id that is not text', frameTree({ id: 3 })],
        ['an overlong origin', frameTree({ securityOrigin: `https://${'a'.repeat(300)}` })],
    ])('rejects %s', (_name, result) => {
        expect(() => readMainFrame(result)).toThrow(UNEXPECTED);
    });
});

describe('readContextId', () => {
    it('reads the id of the new isolated world', () => {
        expect(readContextId({ executionContextId: 12 })).toBe(12);
    });

    it.each([[{}], [{ executionContextId: '12' }], [null]])('rejects %j', (result) => {
        expect(() => readContextId(result)).toThrow(UNEXPECTED);
    });
});

describe('readChain', () => {
    it('reads the chain, leaf first', () => {
        expect(readChain({ tableNames: [...SITE_CHAIN] })).toEqual([...SITE_CHAIN]);
    });

    it('says there is no certificate when no response from the site arrived', () => {
        expect(() => readChain({ tableNames: [] })).toThrow(NO_CERTIFICATE);
    });

    it.each([
        ['no result', undefined],
        ['a chain that is not a list', { tableNames: 'MIIB' }],
        ['a certificate that is not base64', { tableNames: ['not base64!'] }],
        ['a certificate that is not a string', { tableNames: [42] }],
        ['an oversized certificate', { tableNames: ['A'.repeat(MAX_CERT_BASE64_LENGTH + 4)] }],
        ['an overlong chain', { tableNames: Array(MAX_CHAIN_LENGTH + 1).fill(SITE_CHAIN[0]) }],
    ])('rejects %s', (_name, result) => {
        expect(() => readChain(result)).toThrow(UNEXPECTED);
    });
});

describe('readResponseSecurity', () => {
    it('reads how the connection is secured and whether Chrome accepted the certificate', () => {
        expect(readResponseSecurity([responseReceived()], SITE_ORIGIN)).toEqual({
            connection: { protocol: 'TLS 1.3', keyExchange: '', keyExchangeGroup: 'X25519MLKEM768', cipher: 'AES_128_GCM' },
            trusted: true,
        });
    });

    it('keeps the MAC of a non-AEAD cipher', () => {
        const security = readResponseSecurity([responseReceived({}, { protocol: 'TLS 1.2', keyExchange: 'ECDHE_RSA', keyExchangeGroup: undefined, cipher: 'AES_256_CBC', mac: 'HMAC-SHA1' })], SITE_ORIGIN);
        expect(security?.connection).toEqual({ protocol: 'TLS 1.2', keyExchange: 'ECDHE_RSA', cipher: 'AES_256_CBC', mac: 'HMAC-SHA1' });
    });

    it.each([['insecure'], ['unknown']])('treats a %s response as not accepted, e.g. after clicking past a warning', (securityState) => {
        expect(readResponseSecurity([responseReceived({ securityState })], SITE_ORIGIN)?.trusted).toBe(false);
    });

    it('skips responses from other origins and responses without TLS details, and takes the last usable one', () => {
        const events = [
            responseReceived({ url: 'https://cdn.example.net/app.js' }, { protocol: 'QUIC' }),
            responseReceived({ securityDetails: undefined }),
            { response: 'garbage' },
            responseReceived({ url: 'not a url' }),
            responseReceived({}, { protocol: 'TLS 1.2' }),
            responseReceived({ securityDetails: undefined, securityState: 'unknown' }),
        ];
        expect(readResponseSecurity(events, SITE_ORIGIN)?.connection.protocol).toBe('TLS 1.2');
    });

    it('drops optional fields of the wrong type instead of failing', () => {
        const security = readResponseSecurity([responseReceived({}, { keyExchangeGroup: 5, mac: null })], SITE_ORIGIN);
        expect(security?.connection).toEqual({ protocol: 'TLS 1.3', keyExchange: '', cipher: 'AES_128_GCM' });
    });

    it('finds nothing when no usable response arrived', () => {
        expect(readResponseSecurity([], SITE_ORIGIN)).toBeUndefined();
        expect(readResponseSecurity([responseReceived({}, { cipher: 7 })], SITE_ORIGIN)).toBeUndefined();
    });
});

describe('headRequestId', () => {
    it('picks out HEAD requests', () => {
        expect(headRequestId(requestWillBeSent('HEAD', '4.2'))).toBe('4.2');
    });

    it.each([
        ['a GET', requestWillBeSent('GET')],
        ['a request id that is not text', requestWillBeSent('HEAD', 7 as unknown as string)],
        ['no request', { requestId: '1.1' }],
        ['nothing', undefined],
    ])('ignores %s', (_name, params) => {
        expect(headRequestId(params)).toBeUndefined();
    });
});

describe('responseRequestId', () => {
    it('reads the id of the request a response answers', () => {
        expect(responseRequestId(responseReceived())).toBe('1.1');
        expect(responseRequestId({ requestId: 3 })).toBeUndefined();
        expect(responseRequestId(null)).toBeUndefined();
    });
});

describe('lastResponseUrl', () => {
    it('reads where the last response came from, e.g. the page a redirect ended at', () => {
        const redirected = responseReceived({ url: `${SITE_ORIGIN}/wiki/Main_Page`, securityDetails: undefined });
        expect(lastResponseUrl([responseReceived(), redirected])).toBe(`${SITE_ORIGIN}/wiki/Main_Page`);
    });

    it.each([
        ['no response', []],
        ['a URL that is not text', [responseReceived({ url: 7 })]],
        ['an implausibly long URL', [responseReceived({ url: `${SITE_ORIGIN}/${'a'.repeat(10_000)}` })]],
        ['no response object', [{ requestId: '1.1' }]],
    ])('finds nothing for %s', (_name, events) => {
        expect(lastResponseUrl(events)).toBeUndefined();
    });
});

describe('originOf', () => {
    it('reads the origin of a URL, and nothing of anything else', () => {
        expect(originOf('https://www.example.com/a?b#c')).toBe('https://www.example.com');
        expect(originOf('not a url')).toBeUndefined();
        expect(originOf(42)).toBeUndefined();
    });
});

describe('readPausedRequest', () => {
    it('reads the id and URL of a held request', () => {
        expect(readPausedRequest({ requestId: 'interception-1', request: { url: 'https://www.example.com/', method: 'HEAD' } }))
            .toEqual({ id: 'interception-1', url: 'https://www.example.com/' });
    });

    it.each([
        ['no request', { requestId: 'interception-1' }],
        ['a URL that is not text', { requestId: 'interception-1', request: { url: 7 } }],
    ])('still reads the id of %s, so the request can be answered', (_name, params) => {
        expect(readPausedRequest(params)).toEqual({ id: 'interception-1', url: undefined });
    });

    it.each([
        ['no id', { request: { url: 'https://www.example.com/' } }],
        ['nothing', undefined],
    ])('finds nothing in %s', (_name, params) => {
        expect(readPausedRequest(params)).toBeUndefined();
    });
});
