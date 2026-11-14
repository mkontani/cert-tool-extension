import { parseIp } from '../lint/net';

/** One name to request in a CSR's subjectAltName. */
export type SanEntry =
    | { readonly kind: 'dns' | 'email' | 'uri'; readonly value: string }
    | { readonly kind: 'ip'; readonly value: string; readonly bytes: Uint8Array };

const URI = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
/** One "@", with no spaces, angle brackets, or a "mailto:"-style scheme before it. */
const EMAIL = /^[^@\s<>:]+@[^@\s<>]+$/;
/** Only digits and dots, or hex digits, colons and dots with at least one colon: meant as an IP address. */
const IP_LIKE = /^(?:[0-9.]+|[0-9a-f.]*:[0-9a-f:.]*)$/i;
/** A DNS label (RFC 1035, plus the underscores of names such as _acme-challenge): 1 to 63 characters, no hyphen at either end. */
const DNS_LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i;
const MAX_DNS_NAME_LENGTH = 253;

export const isEmailAddress = (value: string): boolean => EMAIL.test(value);

/** A host name of DNS labels, optionally with "*" as the whole leftmost label, and without the trailing dot certificates leave out. */
function isDnsName(value: string): boolean {
    if (value.length > MAX_DNS_NAME_LENGTH) return false;
    const labels = value.split('.');
    if (labels[0] === '*' && labels.length > 1) labels.shift();
    return labels.every(label => DNS_LABEL.test(label));
}

function parseSan(value: string): SanEntry {
    if (/[^\x20-\x7e]/.test(value)) throw new Error(`"${value}" is not ASCII. Write internationalized domain names in punycode (xn--…).`);
    if (URI.test(value)) return { kind: 'uri', value };
    if (value.includes('@')) {
        if (!isEmailAddress(value)) throw new Error(`"${value}" is not a valid email address.`);
        return { kind: 'email', value };
    }
    if (IP_LIKE.test(value)) {
        const bytes = parseIp(value);
        if (!bytes) throw new Error(`"${value}" is not a valid IP address.`);
        return { kind: 'ip', value, bytes };
    }
    if (value.includes(':')) throw new Error(`"${value}" is not a valid DNS name or IP address.`);
    if (!isDnsName(value)) throw new Error(`"${value}" is not a valid DNS name.`);
    return { kind: 'dns', value };
}

/**
 * The names typed into the SANs field, separated by commas, spaces or new lines, each sorted into the type a CA expects.
 * Throws on the first name that cannot be requested, with a message that can be shown as is.
 */
export const parseSans = (text: string): SanEntry[] => text.split(/[\s,]+/).filter(Boolean).map(parseSan);
