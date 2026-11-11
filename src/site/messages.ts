/**
 * Messages between the popup and the background service worker for showing the certificate of the site in the current tab.
 * The background worker reads it from Chrome with the debugger API; the popup decodes and shows it.
 * Every message is plain JSON, because that is all chrome.runtime messaging carries.
 */

/** Popup → background: read the certificate chain Chrome verified for this tab's page. */
export const MSG_FETCH_SITE_CERTS = 'cert-tool:fetch-site-certs';

/** Shown for http:// pages, local files and the like. */
export const NOT_HTTPS = "This page wasn't loaded over HTTPS, so it has no certificate to show.";

/** Real chains have three or four certificates; this keeps a broken report from producing hundreds of entries. */
export const MAX_CHAIN_LENGTH = 16;
/** Base64 of a 96 KiB certificate, far larger than any real one. */
export const MAX_CERT_BASE64_LENGTH = 128 * 1024;
/** Protocol, cipher and error names are short; anything longer is not what Chrome sends. */
export const MAX_FIELD_LENGTH = 256;

export interface FetchSiteCertsRequest {
    readonly type: typeof MSG_FETCH_SITE_CERTS;
    readonly tabId: number;
}

/** How the page's connection is secured, in Chrome's words (e.g. "TLS 1.3", "X25519MLKEM768", "AES_128_GCM"). */
export interface SiteConnection {
    readonly protocol: string;
    /** Empty for TLS 1.3, which always uses (EC)DHE; e.g. "ECDHE_RSA" before that. */
    readonly keyExchange: string;
    readonly keyExchangeGroup?: string;
    readonly cipher: string;
    /** Only for ciphers that are not AEAD. */
    readonly mac?: string;
}

export interface SiteCertificates {
    /** The page's origin, e.g. "https://www.example.com". */
    readonly origin: string;
    /** Base64 DER certificates as Chrome verified them: the leaf first, usually ending at the root it trusts. */
    readonly chain: readonly string[];
    readonly connection: SiteConnection;
    /** Whether Chrome accepted the certificate; false after the user clicked past a certificate warning. */
    readonly trusted: boolean;
    /**
     * Whose connection the certificate and connection details come from: the tab's, or Cert Tool's own,
     * used when another extension's frame on the page keeps the debugger off the tab.
     */
    readonly via: SiteConnectionSource;
}

export type SiteConnectionSource = 'tab' | 'cert-tool';

export type SiteCertsReply =
    | { readonly ok: true; readonly site: SiteCertificates }
    | { readonly ok: false; readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const isField = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_FIELD_LENGTH;

const isOptionalField = (value: unknown): boolean => value === undefined || isField(value);

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const isCertificateBase64 = (value: unknown): value is string =>
    typeof value === 'string' && value.length <= MAX_CERT_BASE64_LENGTH && value.length % 4 === 0 && BASE64.test(value);

export const isChain = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.length > 0 && value.length <= MAX_CHAIN_LENGTH && value.every(isCertificateBase64);

function isConnection(value: unknown): value is SiteConnection {
    return isRecord(value)
        && isField(value.protocol) && isField(value.keyExchange) && isField(value.cipher)
        && isOptionalField(value.keyExchangeGroup) && isOptionalField(value.mac);
}

export const isHttpsOrigin = (value: unknown): value is string => isField(value) && value.startsWith('https://');

function isSiteCertificates(value: unknown): value is SiteCertificates {
    return isRecord(value) && isHttpsOrigin(value.origin) && isChain(value.chain) && isConnection(value.connection)
        && typeof value.trusted === 'boolean' && (value.via === 'tab' || value.via === 'cert-tool');
}

export function isFetchSiteCertsRequest(msg: unknown): msg is FetchSiteCertsRequest {
    return isRecord(msg) && msg.type === MSG_FETCH_SITE_CERTS && Number.isSafeInteger(msg.tabId) && (msg.tabId as number) >= 0;
}

export function isSiteCertsReply(msg: unknown): msg is SiteCertsReply {
    if (!isRecord(msg)) return false;
    if (msg.ok === true) return isSiteCertificates(msg.site);
    return msg.ok === false && typeof msg.error === 'string';
}
