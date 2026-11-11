/**
 * Reads the DevTools protocol results the background worker gets through chrome.debugger.
 * The data comes from Chrome, but parts of it (URLs, names) describe the site, so every field is checked before use.
 */
import { isChain, isField, MAX_FIELD_LENGTH, type SiteConnection } from './messages';

export const UNEXPECTED = 'Chrome answered in a form Cert Tool does not understand.';
export const NO_CERTIFICATE = "Couldn't get a response from this site to read its certificate from. Check that the site is reachable and try again.";

/** Cert Tool's own request makes at most two; the rest are the page's own HEAD requests, which are rare. */
export const MAX_HEAD_REQUESTS = 50;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Optional fields are informational, so one of an unexpected type is dropped rather than failing the whole read. */
const optionalField = (value: unknown): string | undefined => (isField(value) ? value : undefined);

/** Leaves out the optional keys that are unset, so the result compares and serializes cleanly. */
const withoutUndefined = <T extends object>(value: T): T =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

export interface MainFrame {
    readonly id: string;
    /** e.g. "https://www.example.com"; "null" or another scheme for pages without one. */
    readonly origin: string;
}

/** The top frame from the result of Page.getFrameTree. */
export function readMainFrame(result: unknown): MainFrame {
    const frame = isRecord(result) && isRecord(result.frameTree) ? result.frameTree.frame : undefined;
    if (!isRecord(frame) || !isField(frame.id) || !isField(frame.securityOrigin)) throw new Error(UNEXPECTED);
    return { id: frame.id, origin: frame.securityOrigin };
}

/** The execution context from the result of Page.createIsolatedWorld. */
export function readContextId(result: unknown): number {
    if (!isRecord(result) || !Number.isSafeInteger(result.executionContextId)) throw new Error(UNEXPECTED);
    return result.executionContextId as number;
}

/** The chain from the result of Network.getCertificate: the leaf first, as Chrome verified it. */
export function readChain(result: unknown): readonly string[] {
    if (!isRecord(result) || !Array.isArray(result.tableNames)) throw new Error(UNEXPECTED);
    if (result.tableNames.length === 0) throw new Error(NO_CERTIFICATE);
    if (!isChain(result.tableNames)) throw new Error(UNEXPECTED);
    return [...result.tableNames];
}

export interface ResponseSecurity {
    readonly connection: SiteConnection;
    /** Whether Chrome accepted the certificate; false after the user clicked past a certificate warning. */
    readonly trusted: boolean;
}

/** The origin of a URL Chrome reported, e.g. "https://www.example.com"; undefined when it is not a URL. */
export function originOf(url: unknown): string | undefined {
    if (typeof url !== 'string' || url.length > MAX_FIELD_LENGTH * 32) return undefined;
    try {
        return new URL(url).origin;
    } catch {
        return undefined; // Not a URL, so not a response from the site.
    }
}

/** Where the last response came from, e.g. the page a redirect ended at; undefined when Chrome reported none. */
export function lastResponseUrl(events: readonly unknown[]): string | undefined {
    const params = events.at(-1);
    const response = isRecord(params) ? params.response : undefined;
    return isRecord(response) && originOf(response.url) !== undefined ? response.url as string : undefined;
}

function readSecurity(params: unknown, origin: string): ResponseSecurity | undefined {
    const response = isRecord(params) ? params.response : undefined;
    if (!isRecord(response) || originOf(response.url) !== origin) return undefined;
    const details = response.securityDetails;
    if (!isRecord(details) || !isField(details.protocol) || !isField(details.keyExchange) || !isField(details.cipher)) return undefined;
    const connection = withoutUndefined({
        protocol: details.protocol,
        keyExchange: details.keyExchange,
        keyExchangeGroup: optionalField(details.keyExchangeGroup),
        cipher: details.cipher,
        mac: optionalField(details.mac),
    });
    // Chrome marks a response "secure" only when its certificate has no errors.
    return { connection, trusted: response.securityState === 'secure' };
}

/**
 * How the connection to the site is secured, from Network.responseReceived events for it.
 * The last one with TLS details wins: after a redirect, the response that came straight from the site comes last.
 */
export function readResponseSecurity(events: readonly unknown[], origin: string): ResponseSecurity | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        const security = readSecurity(events[i], origin);
        if (security) return security;
    }
    return undefined;
}

const requestIdOf = (params: Record<string, unknown>): string | undefined => (isField(params.requestId) ? params.requestId : undefined);

/** The id of a HEAD request from a Network.requestWillBeSent event, or undefined for any other request. */
export function headRequestId(params: unknown): string | undefined {
    if (!isRecord(params) || !isRecord(params.request) || params.request.method !== 'HEAD') return undefined;
    return requestIdOf(params);
}

/** The id of the request a Network.responseReceived event answers. */
export const responseRequestId = (params: unknown): string | undefined => (isRecord(params) ? requestIdOf(params) : undefined);

export interface PausedRequest {
    readonly id: string;
    /** Undefined when Chrome did not say where the request goes; it still has to be answered. */
    readonly url: string | undefined;
}

/** The request a Fetch.requestPaused event holds; undefined when there is no id to answer it by. */
export function readPausedRequest(params: unknown): PausedRequest | undefined {
    const id = isRecord(params) ? requestIdOf(params) : undefined;
    if (id === undefined) return undefined;
    const url = isRecord(params) && isRecord(params.request) && typeof params.request.url === 'string' ? params.request.url : undefined;
    return { id, url };
}
