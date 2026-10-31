import { MAX_TEXT_LENGTH, MAX_TEXTS } from '../page/messages';

/** A page element showing one or more certificates or CSRs, and exactly those blocks' text, for parsing. */
export interface PemContainer {
    readonly element: HTMLElement;
    readonly text: string;
}

/** Where a complete certificate or CSR block sits in a string: [start, end). */
export interface PemRange {
    readonly start: number;
    readonly end: number;
}

/** Each container becomes one request text, so the two limits match. */
export const MAX_CONTAINERS = MAX_TEXTS;
/** Page text read per scan; far beyond any real page, while bounding the work on a hostile one. */
export const MAX_PAGE_TEXT = 4 * 1024 * 1024;
/** Blocks located per scan. */
const MAX_RANGES = 1000;

const SUPPORTED_LABELS: ReadonlySet<string> = new Set(['CERTIFICATE', 'X509 CERTIFICATE', 'CERTIFICATE REQUEST', 'NEW CERTIFICATE REQUEST']);
const SKIPPED_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style', 'noscript', 'template']);
const BEGIN = '-----BEGIN ';
const DASHES = '-----';
const MAX_LABEL_LENGTH = 64;

/**
 * Finds the complete certificate and CSR blocks (matching BEGIN and END lines) in text.
 * A block whose END line comes after another BEGIN line was cut off and is skipped, so it cannot swallow the next block.
 * Linear time: each label's END line is searched for once per occurrence, and a missing one is never searched for again.
 */
export function findPemRanges(text: string, limit = MAX_RANGES): PemRange[] {
    const ranges: PemRange[] = [];
    const nextEnd = new Map<string, number>();
    for (let pos = 0; ranges.length < limit;) {
        const begin = text.indexOf(BEGIN, pos);
        if (begin === -1) break;
        const labelStart = begin + BEGIN.length;
        const labelEnd = text.indexOf(DASHES, labelStart);
        if (labelEnd === -1) break;
        pos = labelEnd + DASHES.length;
        if (labelEnd - labelStart > MAX_LABEL_LENGTH) continue;
        const label = text.slice(labelStart, labelEnd);
        if (!SUPPORTED_LABELS.has(label)) continue;

        const endLine = `-----END ${label}${DASHES}`;
        let end = nextEnd.get(label);
        if (end === undefined || (end !== -1 && end < pos)) {
            end = text.indexOf(endLine, pos);
            nextEnd.set(label, end);
        }
        if (end === -1) continue;
        const nextBegin = text.indexOf(BEGIN, pos);
        if (nextBegin !== -1 && nextBegin < end) continue;
        ranges.push({ start: begin, end: end + endLine.length });
        pos = end + endLine.length;
    }
    return ranges;
}

/** Whether the text holds at least one complete certificate or CSR block. */
export const hasPemPair = (text: string): boolean => findPemRanges(text, 1).length > 0;

/** The blocks' text joined, as many as fit in one request; empty when not even the first fits. */
function blocksText(text: string, ranges: readonly PemRange[]): string {
    const parts: string[] = [];
    let length = 0;
    for (const { start, end } of ranges) {
        length += end - start + (parts.length > 0 ? 1 : 0);
        if (length > MAX_TEXT_LENGTH) break;
        parts.push(text.slice(start, end));
    }
    return parts.join('\n');
}

/** Just the complete blocks in text, ready to send for parsing; empty when there are none. */
export const extractPemText = (text: string): string => blocksText(text, findPemRanges(text));

const isTextarea = (node: Node): node is HTMLTextAreaElement => node instanceof HTMLTextAreaElement;

function acceptNode(node: Node, exclude: Node | undefined): number {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.parentElement && isTextarea(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
    if (node === exclude || SKIPPED_ELEMENTS.has((node as Element).localName)) return NodeFilter.FILTER_REJECT;
    return isTextarea(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
}

/** The page's text as one string (as in the DOM, whether or not it is rendered), with where each text node starts in it. */
interface TextIndex {
    readonly text: string;
    readonly nodes: readonly Text[];
    readonly starts: readonly number[];
    /** Textareas show their current value, which is not in the DOM text; each with its position in the text. */
    readonly textareas: readonly { readonly element: HTMLTextAreaElement; readonly at: number }[];
}

function indexText(root: Node, exclude: Node | undefined): TextIndex {
    const doc = root.ownerDocument ?? (root as Document);
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: node => acceptNode(node, exclude) });
    const parts: string[] = [];
    const nodes: Text[] = [];
    const starts: number[] = [];
    const textareas: { element: HTMLTextAreaElement; at: number }[] = [];
    let length = 0;
    // Textarea values count toward the limit too, though they are not part of the text.
    let budget = MAX_PAGE_TEXT;
    for (let node = walker.nextNode(); node && budget > 0; node = walker.nextNode()) {
        if (isTextarea(node)) {
            textareas.push({ element: node, at: length });
            budget -= node.value.length;
            continue;
        }
        const data = (node as Text).data.slice(0, budget);
        if (!data) continue;
        nodes.push(node as Text);
        starts.push(length);
        parts.push(data);
        length += data.length;
        budget -= data.length;
    }
    return { text: parts.join(''), nodes, starts, textareas };
}

/** The text node holding the character at offset (binary search over node start offsets). */
function nodeAt({ nodes, starts }: TextIndex, offset: number): Text {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
    }
    return nodes[lo];
}

/** The smallest HTML element holding both text nodes; the browser's Range does this without walking every ancestor. */
function commonAncestor(a: Text, b: Text): HTMLElement | undefined {
    const range = a.ownerDocument.createRange();
    range.setStart(a, 0);
    range.setEnd(b, b.length);
    let node: Node | null = range.commonAncestorContainer;
    // Text inside SVG or MathML: badge the nearest HTML element around it.
    while (node && !(node instanceof HTMLElement)) node = node.parentNode;
    return node ?? undefined;
}

interface Ordered {
    readonly container: PemContainer;
    /** Position in the page text, and textareas before text at the same position (they come first in the DOM). */
    readonly at: number;
    readonly tie: number;
}

function textContainers(index: TextIndex): Ordered[] {
    const groups = new Map<HTMLElement, PemRange[]>();
    for (const range of findPemRanges(index.text)) {
        const element = commonAncestor(nodeAt(index, range.start), nodeAt(index, range.end - 1));
        if (element) groups.set(element, [...(groups.get(element) ?? []), range]);
    }
    return [...groups].flatMap(([element, ranges]) => {
        const text = blocksText(index.text, ranges);
        return text ? [{ container: { element, text }, at: ranges[0].start, tie: 1 }] : [];
    });
}

function textareaContainers(index: TextIndex): Ordered[] {
    return index.textareas.flatMap(({ element, at }) => {
        const text = extractPemText(element.value);
        return text ? [{ container: { element, text }, at, tie: 0 }] : [];
    });
}

/**
 * Finds the elements under root that show certificates or CSRs, in page order.
 * Each block belongs to the smallest element holding both its BEGIN and END lines, so a code viewer that puts
 * every line in its own element still yields one container, and a pasted chain in one element stays together.
 * Text inside `exclude` (the extension's own overlay), scripts and styles is ignored.
 */
export function findPemContainers(root: Node, exclude?: Node): PemContainer[] {
    const index = indexText(root, exclude);
    return [...textContainers(index), ...textareaContainers(index)]
        .sort((a, b) => a.at - b.at || a.tie - b.tie)
        .slice(0, MAX_CONTAINERS)
        .map(o => o.container);
}
