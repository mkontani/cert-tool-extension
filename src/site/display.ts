import type { SiteConnection } from './messages';

/** Where a certificate sits in the chain Chrome verified. */
export type ChainRole = 'Leaf' | 'Intermediate' | 'Root';

/**
 * Chrome lists the chain leaf first and ends it at the trust anchor, so the position and whether a certificate issued itself
 * tell its role. Only the last certificate can be the root: a self-issued one mid-chain is a key-rollover intermediate.
 */
export function chainRole(index: number, count: number, selfIssued: boolean): ChainRole {
    if (index === 0) return 'Leaf';
    return index === count - 1 && selfIssued ? 'Root' : 'Intermediate';
}

const PEM_LINE_LENGTH = 64;

/** One base64 DER certificate as a PEM block (RFC 7468), ending with a newline. */
function toPem(base64: string): string {
    const lines = [];
    for (let i = 0; i < base64.length; i += PEM_LINE_LENGTH) lines.push(base64.slice(i, i + PEM_LINE_LENGTH));
    return ['-----BEGIN CERTIFICATE-----', ...lines, '-----END CERTIFICATE-----', ''].join('\n');
}

/** The chain as PEM, in the same order, like a fullchain.pem file. */
export const chainToPem = (chain: readonly string[]): string => chain.map(toPem).join('');

const joinWith = (main: string, extra: string | undefined) => (main && extra ? `${main} with ${extra}` : main || extra || '');

/** "TLS 1.3 · X25519MLKEM768 · AES_128_GCM", leaving out whatever Chrome reported as empty. */
export function describeConnection(c: SiteConnection): string {
    return [c.protocol, joinWith(c.keyExchange, c.keyExchangeGroup), joinWith(c.cipher, c.mac)].filter(Boolean).join(' · ');
}
