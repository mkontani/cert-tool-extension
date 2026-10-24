import { sameBytes } from '../bytes';
import { dnsNameSyntaxError, parseIp } from '../net';
import type { CheckDefinition, SubjectAltNameInfo } from '../types';
import { NOT_APPLICABLE, PASS, issue } from './common';

type Host = { readonly kind: 'ip'; readonly bytes: Uint8Array } | { readonly kind: 'dns'; readonly name: string };

/** Accepts a bare hostname, an IP (optionally bracketed) or a URL; returns null if it is none of these. */
function normalizeHost(input: string): Host | null {
    let host = input.trim();
    try {
        if (host.includes('://')) host = new URL(host).hostname;
        host = host.replace(/^\[(.*)\]$/, '$1');
        const bytes = parseIp(host);
        if (bytes) return { kind: 'ip', bytes };
        if (/[\s/?#@*]/.test(host)) return null;
        // The URL parser lowercases, converts IDNs to A-labels and expands shorthand IPv4 such as "127.1".
        const name = new URL(`http://${host}`).hostname.replace(/\.$/, '');
        const expanded = parseIp(name);
        return expanded ? { kind: 'ip', bytes: expanded } : { kind: 'dns', name };
    } catch (_e) {
        return null;
    }
}

function dnsNameMatches(pattern: string, host: string): boolean {
    const name = pattern.toLowerCase();
    if (!name.startsWith('*.')) return name === host;
    const dot = host.indexOf('.');
    return dot > 0 && host.slice(dot + 1) === name.slice(2);
}

function hostCovered(san: SubjectAltNameInfo, host: Host): boolean {
    if (host.kind === 'dns') return san.dnsNames.some(pattern => dnsNameMatches(pattern, host.name));
    return san.ipAddresses.some(ip => {
        const bytes = parseIp(ip);
        return bytes !== null && sameBytes(bytes, host.bytes);
    });
}

export const hostnameMatch: CheckDefinition = {
    id: 'hostname_match',
    title: 'Hostname is covered by the subjectAltName',
    citation: 'RFC 9525 §6',
    profiles: ['public', 'private'],
    run: (cert, env) => {
        const input = env.hostname?.trim();
        if (!input) return NOT_APPLICABLE;
        const host = normalizeHost(input);
        if (!host) return issue('error', `"${input}" is not a valid hostname or IP address.`);
        const san = cert.extensions.subjectAltName;
        if (!san) return issue('error', 'The certificate has no subjectAltName, so it matches no hostname.');
        return hostCovered(san, host) ? PASS : issue('error', `"${input}" is not covered by any subjectAltName entry.`);
    },
};

/** A wildcard is only valid as the entire leftmost label, followed by at least two labels. */
function wildcardError(name: string): string | null {
    if (!name.includes('*')) return null;
    if (!name.startsWith('*.') || name.slice(2).includes('*')) return 'misplaced wildcard';
    return name.slice(2).split('.').length < 2 ? 'wildcard directly below a top-level domain' : null;
}

export const dnsNameSyntax: CheckDefinition = {
    id: 'dns_name_syntax',
    title: 'DNS names in the subjectAltName are well-formed',
    citation: 'RFC 5280 §4.2.1.6; BR §3.2.2.6, §7.1.2.7.12',
    profiles: ['public', 'private'],
    run: cert => {
        const san = cert.extensions.subjectAltName;
        if (!san) return NOT_APPLICABLE;
        const errors = san.dnsNames.flatMap(name => {
            const reason = wildcardError(name) ?? dnsNameSyntaxError(name);
            return reason ? [`"${name}" (${reason})`] : [];
        });
        if (errors.length > 0) return issue('error', `Malformed DNS name(s): ${errors.join(', ')}.`);
        const underscored = san.dnsNames.filter(name => name.includes('_'));
        return underscored.length > 0
            ? issue('warn', `Underscores are not valid in hostnames and some clients reject them: ${underscored.join(', ')}.`)
            : PASS;
    },
};
