import { describe, it, expect } from 'vitest';
import { isFetchSiteCertsRequest, isSiteCertsReply, MSG_FETCH_SITE_CERTS } from '../../site/messages';
import { SITE_CHAIN, SITE_ORIGIN } from '../siteFixtures';

const site = { origin: SITE_ORIGIN, chain: [...SITE_CHAIN], connection: { protocol: 'TLS 1.3', keyExchange: '', cipher: 'AES_128_GCM' }, trusted: true, via: 'tab' };

describe('isFetchSiteCertsRequest', () => {
    it('accepts a request for one tab', () => {
        expect(isFetchSiteCertsRequest({ type: MSG_FETCH_SITE_CERTS, tabId: 12 })).toBe(true);
    });

    it.each([
        ['another message', { type: 'cert-tool:scan-page', tabId: 12 }],
        ['a missing tab', { type: MSG_FETCH_SITE_CERTS }],
        ['a fractional tab id', { type: MSG_FETCH_SITE_CERTS, tabId: 1.5 }],
        ['a negative tab id', { type: MSG_FETCH_SITE_CERTS, tabId: -1 }],
        ['a tab id as text', { type: MSG_FETCH_SITE_CERTS, tabId: '12' }],
        ['null', null],
    ])('rejects %s', (_name, msg) => {
        expect(isFetchSiteCertsRequest(msg)).toBe(false);
    });
});

describe('isSiteCertsReply', () => {
    it.each([
        ['a chain', { ok: true, site }],
        ['a chain Chrome did not accept', { ok: true, site: { ...site, trusted: false } }],
        ['a chain read over Cert Tool\'s own connection', { ok: true, site: { ...site, via: 'cert-tool' } }],
        ['an error', { ok: false, error: 'boom' }],
    ])('accepts %s', (_name, reply) => {
        expect(isSiteCertsReply(reply)).toBe(true);
    });

    it.each([
        ['nothing', undefined],
        ['an error without text', { ok: false }],
        ['an empty chain', { ok: true, site: { ...site, chain: [] } }],
        ['a chain of numbers', { ok: true, site: { ...site, chain: [1, 2] } }],
        ['a missing connection', { ok: true, site: { chain: site.chain } }],
        ['a connection without a cipher', { ok: true, site: { ...site, connection: { protocol: 'TLS 1.3', keyExchange: '' } } }],
        ['a missing trust verdict', { ok: true, site: { ...site, trusted: undefined } }],
        ['no word on whose connection it was', { ok: true, site: { ...site, via: undefined } }],
        ['an unknown connection', { ok: true, site: { ...site, via: 'page' } }],
        ['a missing origin', { ok: true, site: { ...site, origin: undefined } }],
        ['an origin that is not HTTPS', { ok: true, site: { ...site, origin: 'http://www.example.com' } }],
    ])('rejects %s', (_name, reply) => {
        expect(isSiteCertsReply(reply)).toBe(false);
    });
});
