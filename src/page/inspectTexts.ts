import { inspect } from '../inspector/inspect';
import { findPemBlocks, type PemBlock } from '../inspector/pem';
import type { PageItem, PageScan } from './messages';
import { validityOf } from './validity';

const failureMessage = (e: unknown) => `Failed to parse: ${e instanceof Error && e.message ? e.message : 'Unknown error'}`;

/** Decodes each block on its own, so one broken block does not hide the rest of a chain. */
function inspectBlock(block: PemBlock, now: number): PageItem {
    if ('error' in block) return { status: 'error', kind: block.kind, error: block.error };
    try {
        const result = inspect(block.der, block.kind);
        const validity = block.kind === 'certificate' ? validityOf(result.notBefore, result.notAfter, now) : undefined;
        return validity
            ? { status: 'ok', kind: block.kind, result, validity }
            : { status: 'ok', kind: block.kind, result };
    } catch (e: unknown) {
        return { status: 'error', kind: block.kind, error: failureMessage(e) };
    }
}

/** Inspects every certificate and CSR in one block of page text. */
export function inspectText(text: string, now: number): PageScan {
    const { blocks, truncated } = findPemBlocks(text);
    return { items: blocks.map(block => inspectBlock(block, now)), truncated };
}

export function inspectTexts(texts: readonly string[], now: number): PageScan[] {
    return texts.map(text => inspectText(text, now));
}
