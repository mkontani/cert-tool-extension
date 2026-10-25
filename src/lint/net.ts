import { TLDS } from './data/tlds';
import { RESERVED_IP_BLOCKS } from './data/reservedIps';

const IPV4_OCTET = /^(0|[1-9]\d{0,2})$/;
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i;

function parseIPv4(text: string): Uint8Array | null {
    const parts = text.split('.');
    if (parts.length !== 4 || !parts.every(p => IPV4_OCTET.test(p))) return null;
    const octets = parts.map(Number);
    return octets.every(o => o <= 255) ? Uint8Array.from(octets) : null;
}

/** Parses colon-separated IPv6 groups; an embedded IPv4 is allowed only as the final segment. */
function parseIPv6Groups(text: string, allowTrailingIPv4: boolean): number[] | null {
    if (text === '') return [];
    const parts = text.split(':');
    const groups: number[] = [];
    for (const [i, part] of parts.entries()) {
        if (allowTrailingIPv4 && i === parts.length - 1 && part.includes('.')) {
            const v4 = parseIPv4(part);
            if (!v4) return null;
            groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        } else if (IPV6_GROUP.test(part)) {
            groups.push(parseInt(part, 16));
        } else {
            return null;
        }
    }
    return groups;
}

function parseIPv6(text: string): Uint8Array | null {
    const halves = text.split('::');
    if (halves.length > 2) return null;
    const compressed = halves.length === 2;
    const head = parseIPv6Groups(halves[0], !compressed);
    const tail = compressed ? parseIPv6Groups(halves[1], true) : [];
    if (!head || !tail) return null;

    const missing = 8 - head.length - tail.length;
    if (compressed ? missing < 1 : missing !== 0) return null;
    const groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
    return Uint8Array.from(groups.flatMap(g => [g >> 8, g & 0xff]));
}

/** Parses a textual IPv4 or IPv6 address into its 4- or 16-byte form. */
export function parseIp(text: string): Uint8Array | null {
    return text.includes(':') ? parseIPv6(text) : parseIPv4(text);
}

function longestZeroRun(groups: readonly number[]): { start: number; length: number } {
    let best = { start: -1, length: 0 };
    let start = -1;
    for (let i = 0; i <= groups.length; i++) {
        if (i < groups.length && groups[i] === 0) {
            if (start < 0) start = i;
        } else if (start >= 0) {
            if (i - start > best.length) best = { start, length: i - start };
            start = -1;
        }
    }
    return best;
}

/** Formats a 4- or 16-byte address; IPv6 follows RFC 5952 (lowercase, longest zero run compressed). */
export function formatIp(bytes: Uint8Array): string {
    if (bytes.length === 4) return Array.from(bytes).join('.');
    if (bytes.length !== 16) return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

    const groups = Array.from({ length: 8 }, (_, i) => (bytes[2 * i] << 8) | bytes[2 * i + 1]);
    const run = longestZeroRun(groups);
    const hex = (gs: readonly number[]) => gs.map(g => g.toString(16)).join(':');
    if (run.length < 2) return hex(groups);
    return `${hex(groups.slice(0, run.start))}::${hex(groups.slice(run.start + run.length))}`;
}

interface IpBlock {
    readonly network: Uint8Array;
    readonly prefixLength: number;
}

const RESERVED_BLOCKS: readonly IpBlock[] = RESERVED_IP_BLOCKS.map(cidr => {
    const [address, prefix] = cidr.split('/');
    const network = parseIp(address);
    if (!network) throw new Error(`Invalid reserved IP block: ${cidr}`);
    return { network, prefixLength: Number(prefix) };
});

function inBlock(address: Uint8Array, block: IpBlock): boolean {
    if (address.length !== block.network.length) return false;
    const fullBytes = Math.floor(block.prefixLength / 8);
    for (let i = 0; i < fullBytes; i++) {
        if (address[i] !== block.network[i]) return false;
    }
    const remainingBits = block.prefixLength % 8;
    if (remainingBits === 0) return true;
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (address[fullBytes] & mask) === (block.network[fullBytes] & mask);
}

/** True if the address falls in an IANA special-purpose block (private, loopback, documentation, ...). */
export function isReservedIp(address: Uint8Array): boolean {
    return RESERVED_BLOCKS.some(block => inBlock(address, block));
}

/** True if the DNS name does not end with an IANA-registered TLD (the BR "Internal Name"). */
export function isInternalName(dnsName: string): boolean {
    const labels = dnsName.toLowerCase().split('.');
    if (labels.length < 2) return true;
    return !TLDS.has(labels[labels.length - 1]);
}

const MAX_DNS_NAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;
// Underscores are tolerated here; callers decide how strictly to treat them.
const LABEL_CHARS = /^[A-Za-z0-9_-]+$/;

function labelSyntaxError(label: string): string | null {
    if (label === '') return 'contains an empty label';
    if (label.length > MAX_LABEL_LENGTH) return `has a label longer than ${MAX_LABEL_LENGTH} characters`;
    if (!LABEL_CHARS.test(label)) return 'contains characters other than letters, digits and hyphens';
    if (label.startsWith('-') || label.endsWith('-')) return 'has a label starting or ending with a hyphen';
    return null;
}

/**
 * Checks a SAN dNSName against the preferred name syntax (RFC 5280 §4.2.1.6). A leading "*." is
 * skipped; wildcard placement is validated separately. Returns a reason, or null if well-formed.
 */
export function dnsNameSyntaxError(name: string): string | null {
    const fqdn = name.startsWith('*.') ? name.slice(2) : name;
    if (fqdn === '') return 'is empty';
    if (fqdn.endsWith('.')) return 'ends with a dot';
    if (fqdn.length > MAX_DNS_NAME_LENGTH) return `is longer than ${MAX_DNS_NAME_LENGTH} characters`;
    for (const label of fqdn.split('.')) {
        const error = labelSyntaxError(label);
        if (error) return error;
    }
    return null;
}

/** True if any label is a Reserved LDH label ("??--*") other than an "xn--" A-label. */
export function hasReservedLdhLabel(name: string): boolean {
    return name
        .toLowerCase()
        .split('.')
        .some(label => label.slice(2, 4) === '--' && !label.startsWith('xn--'));
}

/** True if the name lies under in-addr.arpa or ip6.arpa (IP Address Reverse Zone Suffix). */
export function isReverseZoneName(dnsName: string): boolean {
    const name = dnsName.toLowerCase();
    return ['in-addr.arpa', 'ip6.arpa'].some(suffix => name === suffix || name.endsWith(`.${suffix}`));
}
