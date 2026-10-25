export type PemKind = 'certificate' | 'csr';

/** One certificate or CSR block: its DER, or why it could not be read. */
export type PemBlock =
    | { readonly kind: PemKind; readonly der: Uint8Array }
    | { readonly kind: PemKind; readonly error: string };

export interface PemScan {
    /** Certificate and CSR blocks in input order, e.g. the leaf and intermediates of a full chain. */
    readonly blocks: readonly PemBlock[];
    /** Set when the input held more than MAX_PEM_BLOCKS blocks and the rest were not read. */
    readonly truncated: boolean;
}

/** Far more than any real chain, while keeping a hostile paste from producing thousands of entries. */
export const MAX_PEM_BLOCKS = 100;

const LABELS: Readonly<Record<string, PemKind>> = {
    'CERTIFICATE': 'certificate',
    'X509 CERTIFICATE': 'certificate',
    'CERTIFICATE REQUEST': 'csr',
    'NEW CERTIFICATE REQUEST': 'csr',
};

const BEGIN = '-----BEGIN ';
const DASHES = '-----';
const MAX_LABEL_LENGTH = 64;

const kindOf = (label: string): PemKind | undefined => (Object.hasOwn(LABELS, label) ? LABELS[label] : undefined);

/** "The CERTIFICATE block" for the first block, "The CERTIFICATE block #2" after that. */
const blockName = (label: string, index: number) => `The ${label} block${index === 0 ? '' : ` #${index + 1}`}`;

function decodeBlock(kind: PemKind, body: string, name: string): PemBlock {
    try {
        return { kind, der: Uint8Array.from(atob(body.replace(/\s/g, '')), c => c.charCodeAt(0)) };
    } catch {
        return { kind, error: `${name} is not valid base64.` };
    }
}

/**
 * Finds the certificates and CSRs in pasted text, skipping keys and other PEM blocks.
 * Uses indexOf rather than a regex, and never rescans text, so hostile input cannot make the scan quadratic.
 */
export function findPemBlocks(text: string): PemScan {
    const blocks: PemBlock[] = [];
    for (let pos = 0; ;) {
        const begin = text.indexOf(BEGIN, pos);
        if (begin === -1) break;
        const labelStart = begin + BEGIN.length;
        const labelEnd = text.indexOf(DASHES, labelStart);
        if (labelEnd === -1) break;
        pos = labelEnd;
        if (labelEnd - labelStart > MAX_LABEL_LENGTH) continue;
        const label = text.slice(labelStart, labelEnd);
        const kind = kindOf(label);
        if (!kind) continue;
        if (blocks.length === MAX_PEM_BLOCKS) return { blocks, truncated: true };

        const name = blockName(label, blocks.length);
        const bodyStart = labelEnd + DASHES.length;
        const endLine = `-----END ${label}${DASHES}`;
        const end = text.indexOf(endLine, bodyStart);
        if (end === -1) {
            // A truncated paste: keep what came before it.
            blocks.push({ kind, error: `${name} has no matching END line.` });
            break;
        }
        blocks.push(decodeBlock(kind, text.slice(bodyStart, end), name));
        pos = end + endLine.length;
    }
    return { blocks, truncated: false };
}
