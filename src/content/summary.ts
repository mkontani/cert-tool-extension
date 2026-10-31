import type { PageItem, PageScan } from '../page/messages';
import { describeValidity, shortValidity } from '../page/validity';

/** Colour of a badge or validity line: ok (green), warn (amber), bad (red), info (neutral), error (unreadable). */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'error';

/** Higher wins when a chain's entries disagree. */
const TONE_RANK: Readonly<Record<Tone, number>> = { info: 0, ok: 1, error: 2, warn: 3, bad: 4 };

export function toneOf(item: PageItem): Tone {
    if (item.status === 'error') return 'error';
    if (item.kind === 'csr' || !item.validity) return 'info';
    switch (item.validity.state) {
        case 'valid': return 'ok';
        case 'expiring': return 'warn';
        case 'expired':
        case 'not-yet-valid': return 'bad';
    }
}

/** What the on-page badge shows for one block of text. */
export interface BadgeSummary {
    readonly tone: Tone;
    readonly label: string;
    /** e.g. "23d left" or "CSR". */
    readonly detail: string | undefined;
    /** How many more entries the block holds, e.g. the intermediates after a leaf. */
    readonly more: number;
    /** The same in words, for screen readers. */
    readonly description: string;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function detailOf(item: PageItem & { status: 'ok' }): { short: string; long: string } | undefined {
    if (item.kind === 'csr') return { short: 'CSR', long: 'certificate signing request' };
    return item.validity && { short: shortValidity(item.validity), long: lowerFirst(describeValidity(item.validity)) };
}

/** Summarises a block by its first readable entry, coloured by the worst entry. */
export function badgeSummary(scan: PageScan): BadgeSummary {
    const tone = scan.items.map(toneOf).reduce<Tone>((worst, t) => (TONE_RANK[t] > TONE_RANK[worst] ? t : worst), 'info');
    const firstIndex = scan.items.findIndex(item => item.status === 'ok');
    const first = scan.items[firstIndex];
    if (!first || first.status !== 'ok') {
        const label = scan.items.length === 1 ? 'Unreadable certificate' : `${scan.items.length} unreadable blocks`;
        return { tone, label, detail: undefined, more: 0, description: label };
    }
    const detail = detailOf(first);
    const more = scan.items.length - 1;
    const parts = [first.result.label, detail?.long, more > 0 ? `and ${more} more` : undefined];
    return { tone, label: first.result.label, detail: detail?.short, more, description: parts.filter(Boolean).join(', ') };
}
