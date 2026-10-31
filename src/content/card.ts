import { MAX_PEM_BLOCKS } from '../inspector/pem';
import type { DisplayEntry, ExtensionInfo, InspectionResult } from '../inspector/types';
import type { PageItem, PageScan } from '../page/messages';
import { describeValidity } from '../page/validity';
import { h } from './dom';
import { toneOf } from './summary';

export interface CardHandlers {
    readonly onClose: () => void;
}

/** Entries listed per extension; a hostile certificate can carry tens of thousands of SANs. */
export const MAX_CARD_ENTRIES = 100;
/** Characters shown per value before it is shortened. */
export const MAX_CARD_TEXT = 2000;
/** The page supplies the certificate, so nothing in it is vouched for; said on every card. */
const DISCLAIMER = 'Shown as written in the certificate. Signatures and trust are not checked.';

const clip = (text: string) => (text.length > MAX_CARD_TEXT ? `${text.slice(0, MAX_CARD_TEXT)}…` : text);

const KIND_NAMES = { certificate: 'X.509 Certificate', csr: 'Certificate Signing Request (CSR)' } as const;

/** Label/value rows in the order the popup's Inspector shows them; absent fields are left out. */
function fieldRows(result: InspectionResult): readonly (readonly [string, string, boolean?])[] {
    const rows: readonly (readonly [string, string | undefined, boolean?])[] = [
        ['Subject', result.subject],
        ['Issuer', result.issuer],
        ['Serial', result.serial, true],
        ['Not before', result.notBefore],
        ['Not after', result.notAfter],
        ['Public key', result.pubKeyAlgo],
        ['Signature', result.signatureAlgo],
    ];
    return rows.filter((row): row is readonly [string, string, boolean?] => Boolean(row[1]));
}

function renderFields(doc: Document, result: InspectionResult): HTMLDListElement {
    const dl = h(doc, 'dl');
    for (const [label, value, mono] of fieldRows(result)) {
        dl.append(h(doc, 'dt', undefined, label), h(doc, 'dd', mono ? 'mono' : undefined, clip(value)));
    }
    return dl;
}

function renderEntries(doc: Document, entries: readonly DisplayEntry[]): HTMLUListElement {
    const shown = entries.slice(0, MAX_CARD_ENTRIES).map(e => h(doc, 'li', undefined, h(doc, 'span', 'type', clip(e.type)), h(doc, 'span', 'value', clip(e.value))));
    const hidden = entries.length - MAX_CARD_ENTRIES;
    return h(doc, 'ul', undefined, ...shown, hidden > 0 ? h(doc, 'li', 'more-entries', `… and ${hidden} more`) : undefined);
}

function renderExtension(doc: Document, ext: ExtensionInfo): HTMLElement {
    const name = h(doc, 'div', 'ext-name', clip(ext.name), ext.critical ? ' ' : undefined, ext.critical ? h(doc, 'span', 'crit', 'critical') : undefined);
    const body = ext.entries ? renderEntries(doc, ext.entries) : h(doc, 'div', 'ext-value', clip(ext.value));
    return h(doc, 'div', 'ext', name, body);
}

function renderItem(doc: Document, item: PageItem, index: number, total: number): HTMLElement {
    const head = h(doc, 'div', 'item-head',
        total > 1 ? h(doc, 'span', 'index', `${index + 1} / ${total}`) : undefined,
        h(doc, 'span', 'kind', item.status === 'ok' ? item.result.type : KIND_NAMES[item.kind]));
    if (item.status === 'error') {
        return h(doc, 'section', undefined, head, h(doc, 'div', 'title', 'Unreadable block'), h(doc, 'p', 'error', clip(item.error)));
    }
    const { result, validity } = item;
    return h(doc, 'section', undefined,
        head,
        h(doc, 'div', 'title', clip(result.label)),
        validity ? h(doc, 'p', `validity tone-${toneOf(item)}`, describeValidity(validity)) : undefined,
        renderFields(doc, result),
        result.extensions.length > 0 ? h(doc, 'div', 'exts-title', 'Extensions') : undefined,
        ...result.extensions.map(ext => renderExtension(doc, ext)));
}

/** The details card for one block of page text: every certificate and CSR in it, in order. */
export function renderCard(doc: Document, scan: PageScan, { onClose }: CardHandlers): HTMLElement {
    const close = h(doc, 'button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', onClose);

    const card = h(doc, 'div', 'card',
        h(doc, 'div', 'card-head', h(doc, 'span', 'brand', 'Cert Tool'), close),
        h(doc, 'p', 'disclaimer', DISCLAIMER),
        ...scan.items.map((item, i) => renderItem(doc, item, i, scan.items.length)),
        scan.truncated ? h(doc, 'p', 'note', `Only the first ${MAX_PEM_BLOCKS} blocks are listed.`) : undefined);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Certificate details');
    card.tabIndex = -1;
    return card;
}
