import { isContentCommand, MSG_SCAN_PAGE, type ContentCommand, type ContentReply, type PageScan } from '../page/messages';
import { extractPemText, findPemContainers } from './detect';
import { isShown } from './dom';
import { createOverlay, type Anchor, type Overlay } from './overlay';

/** Parses page texts into one scan each, in order (the background service worker does this in the extension). */
export type ParseTexts = (texts: readonly string[]) => Promise<readonly PageScan[]>;

export interface ControllerDeps {
    readonly doc: Document;
    readonly parse: ParseTexts;
    readonly makeOverlay?: (doc: Document) => Overlay;
}

export interface Controller {
    handle(command: ContentCommand): Promise<{ found: number }>;
    /** Removes the overlay and its listeners. */
    dispose(): void;
}

const NONE_ON_PAGE = 'No certificates or CSRs found on this page.';
const NONE_IN_SELECTION = 'No certificate or CSR found in the selection.';
const foundMessage = (n: number) => `Found ${n} ${n === 1 ? 'certificate or CSR' : 'certificates or CSRs'} on this page.`;

interface TextSource {
    readonly text: string;
    readonly anchor?: () => DOMRect;
}

/** The selected text, including inside a textarea or input, whose selection the document selection does not report. */
function readSelection(doc: Document): TextSource {
    const active = doc.activeElement;
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
        const { selectionStart: start, selectionEnd: end } = active;
        if (start !== null && end !== null && end > start) return { text: active.value.slice(start, end), anchor: () => active.getBoundingClientRect() };
    }
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return { text: '' };
    const range = selection.getRangeAt(0);
    // jsdom has no Range#getBoundingClientRect.
    return { text: selection.toString(), anchor: typeof range.getBoundingClientRect === 'function' ? () => range.getBoundingClientRect() : undefined };
}

/** Top-right of the viewport, for text whose position is unknown (e.g. the menu's copy of a selection in another frame). */
const fallbackAnchor = (doc: Document): Anchor => () => new DOMRect(doc.documentElement.clientWidth - 16, 16, 0, 0);

/** Carries out the popup's and context menu's commands on the page. */
export function createController({ doc, parse, makeOverlay = createOverlay }: ControllerDeps): Controller {
    let overlay: Overlay | undefined;
    /** Bumped by every scan, so a slower earlier scan does not paint over a later one. */
    let generation = 0;
    const getOverlay = () => (overlay ??= makeOverlay(doc));

    async function scanPage(): Promise<{ found: number }> {
        const current = ++generation;
        const ui = getOverlay();
        ui.clear();
        // Hidden blocks are skipped, so a page cannot dress up invisible text with the extension's badge.
        const containers = findPemContainers(doc.body ?? doc.documentElement, ui.host).filter(c => isShown(c.element));
        if (containers.length === 0) {
            ui.toast(NONE_ON_PAGE);
            return { found: 0 };
        }
        const scans = await parse(containers.map(c => c.text));
        const targets = containers.flatMap((c, i) => (scans[i]?.items.length ? [{ element: c.element, scan: scans[i] }] : []));
        const found = targets.reduce((n, t) => n + t.scan.items.length, 0);
        if (current !== generation) return { found };
        ui.showBadges(targets);
        ui.toast(found > 0 ? foundMessage(found) : NONE_ON_PAGE);
        return { found };
    }

    async function inspectSelection(fallbackText: string, preferFallback: boolean): Promise<{ found: number }> {
        const ui = getOverlay();
        const own = readSelection(doc);
        const menuCopy: TextSource = { text: fallbackText };
        const sources = preferFallback ? [menuCopy, own] : [own, menuCopy];
        const picked = sources.map(source => ({ ...source, text: extractPemText(source.text) })).find(source => source.text);
        if (!picked) {
            ui.toast(NONE_IN_SELECTION);
            return { found: 0 };
        }
        const [scan] = await parse([picked.text]);
        if (!scan || scan.items.length === 0) {
            ui.toast(NONE_IN_SELECTION);
            return { found: 0 };
        }
        ui.showCardAt(picked.anchor ?? fallbackAnchor(doc), scan);
        return { found: scan.items.length };
    }

    return {
        handle: command => (command.type === MSG_SCAN_PAGE
            ? scanPage()
            : inspectSelection(command.fallbackText, command.preferFallback ?? false)),
        dispose() {
            overlay?.destroy();
            overlay = undefined;
        },
    };
}

/**
 * The content script's chrome.runtime.onMessage listener. Accepts commands only from its own extension's pages
 * (popup, background), never from other extensions or content scripts, and answers asynchronously.
 */
export function createMessageListener(extensionId: string, handle: (command: ContentCommand) => Promise<{ found: number }>) {
    return (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (reply: ContentReply) => void): boolean => {
        if (sender.id !== extensionId || sender.tab || !isContentCommand(msg)) return false;
        handle(msg).then(sendResponse, (e: unknown) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
        return true;
    };
}
