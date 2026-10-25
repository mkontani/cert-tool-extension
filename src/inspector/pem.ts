export type PemKind = 'certificate' | 'csr';

export interface PemBlock {
    readonly kind: PemKind;
    readonly der: Uint8Array;
    /** How many blocks of the same kind the input holds, e.g. 3 for a full chain. */
    readonly count: number;
}

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

const kindOf = (label: string): PemKind | undefined => {
    if (label === 'CERTIFICATE') return 'certificate';
    if (label === 'CERTIFICATE REQUEST' || label === 'NEW CERTIFICATE REQUEST') return 'csr';
    return undefined;
};

/** Finds the first certificate or CSR in pasted text, skipping keys and other PEM blocks. */
export function findPemBlock(text: string): PemBlock | null {
    const blocks = [...text.matchAll(PEM_BLOCK)].flatMap(([, label, body]) => {
        const kind = kindOf(label);
        return kind ? [{ kind, body }] : [];
    });
    if (blocks.length === 0) return null;
    const [first] = blocks;
    const binary = atob(first.body.replace(/\s/g, ''));
    return {
        kind: first.kind,
        der: Uint8Array.from(binary, c => c.charCodeAt(0)),
        count: blocks.filter(block => block.kind === first.kind).length,
    };
}
