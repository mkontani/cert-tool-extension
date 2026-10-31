/**
 * Messages between the popup, the background service worker and the content script that inspects certificates on web pages.
 * Every message is plain JSON, because that is all chrome.runtime messaging carries.
 * Only type imports here: the content script bundles this file and must stay free of the parsing libraries.
 */
import type { PemKind } from '../inspector/pem';
import type { InspectionResult } from '../inspector/types';
import type { Validity } from './validity';

/** Popup → content script: find and badge every certificate and CSR on the page. */
export const MSG_SCAN_PAGE = 'cert-tool:scan-page';
/** Background → content script: show the certificate in the user's selection. */
export const MSG_INSPECT_SELECTION = 'cert-tool:inspect-selection';
/** Content script → background: parse these page texts. Parsing lives in the background to keep the content script small. */
export const MSG_INSPECT_TEXTS = 'cert-tool:inspect-texts';

/** More than any real page shows, while keeping a hostile page from queuing unbounded parsing. */
export const MAX_TEXTS = 50;
export const MAX_TEXT_LENGTH = 512 * 1024;

export type ContentCommand =
    | { readonly type: typeof MSG_SCAN_PAGE }
    /**
     * fallbackText is the context menu's copy of the selection, used when the page's own selection has no certificate.
     * preferFallback puts it first, for a click in another frame, where this frame's selection may be stale.
     */
    | { readonly type: typeof MSG_INSPECT_SELECTION; readonly fallbackText: string; readonly preferFallback?: boolean };

/** How many certificates and CSRs the content script showed, or why it could not. */
export type ContentReply = { readonly found: number } | { readonly error: string };

export interface InspectTextsRequest {
    readonly type: typeof MSG_INSPECT_TEXTS;
    readonly texts: readonly string[];
}

/** One certificate or CSR found on a page. */
export type PageItem =
    | { readonly status: 'ok'; readonly kind: PemKind; readonly result: InspectionResult; readonly validity?: Validity }
    | { readonly status: 'error'; readonly kind: PemKind; readonly error: string };

/** Everything found in one block of page text, e.g. the leaf and intermediates of a pasted chain. */
export interface PageScan {
    readonly items: readonly PageItem[];
    /** Set when the text held more blocks than were read. */
    readonly truncated: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isBoundedText = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;

export function isInspectTextsRequest(msg: unknown): msg is InspectTextsRequest {
    return isRecord(msg)
        && msg.type === MSG_INSPECT_TEXTS
        && Array.isArray(msg.texts)
        && msg.texts.length <= MAX_TEXTS
        && msg.texts.every(isBoundedText);
}

export function isContentCommand(msg: unknown): msg is ContentCommand {
    if (!isRecord(msg)) return false;
    if (msg.type === MSG_SCAN_PAGE) return true;
    return msg.type === MSG_INSPECT_SELECTION
        && isBoundedText(msg.fallbackText)
        && (msg.preferFallback === undefined || typeof msg.preferFallback === 'boolean');
}

export function isContentReply(msg: unknown): msg is ContentReply {
    return isRecord(msg) && (typeof msg.found === 'number' || typeof msg.error === 'string');
}
