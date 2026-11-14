/** The names the Inspector printed for one block; a CSR has no issuer. */
export interface ChainNames {
    readonly subject: string;
    readonly issuer?: string;
}

/** Which certificate in the input issued a certificate, as far as their names tell. */
export type IssuerLink =
    /** The next certificate, as in a chain sent leaf first. */
    | { readonly kind: 'next' }
    /** The certificate itself: a root, which ends the chain. */
    | { readonly kind: 'self' }
    /** Another certificate in the input, which is listed out of order. */
    | { readonly kind: 'elsewhere'; readonly index: number }
    /** No certificate in the input. */
    | { readonly kind: 'missing' }
    /** Nothing to link: a CSR, or a block that could not be read. */
    | { readonly kind: 'unknown' };

/**
 * A name as the Inspector prints it, without the differences in case and spacing that RFC 5280 (§7.1, via RFC 4518) ignores
 * when it compares the directory strings most names are made of. Comparing printed names also ignores the string type
 * (PrintableString or UTF8String), which CAs do not always keep the same between a certificate's issuer and its issuer's subject.
 */
const comparable = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Matches each certificate's issuer to the subject of another, by their names.
 * A self-issued certificate ends the chain even when a copy of it follows.
 */
export function issuerLinks(blocks: readonly (ChainNames | null)[]): IssuerLink[] {
    const issuesCertificates = (block: ChainNames | null, issuer: string): boolean =>
        block !== null && block.issuer !== undefined && comparable(block.subject) === issuer;

    return blocks.map((block, i): IssuerLink => {
        if (block?.issuer === undefined) return { kind: 'unknown' };
        const issuer = comparable(block.issuer);
        if (issuer === comparable(block.subject)) return { kind: 'self' };
        if (issuesCertificates(blocks[i + 1] ?? null, issuer)) return { kind: 'next' };
        const index = blocks.findIndex((other, j) => j !== i && issuesCertificates(other, issuer));
        return index === -1 ? { kind: 'missing' } : { kind: 'elsewhere', index };
    });
}
