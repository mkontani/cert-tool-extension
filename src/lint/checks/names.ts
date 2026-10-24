import { hasReservedLdhLabel, isInternalName, isReservedIp, isReverseZoneName, parseIp } from '../net';
import type { CertContext, CheckDefinition } from '../types';
import { NOT_APPLICABLE, PASS, issue } from './common';

const REVERSE_ZONE_RULE_START = new Date('2026-03-15T00:00:00Z');

export const sanPresent: CheckDefinition = {
    id: 'san_present',
    title: 'subjectAltName contains a DNS name or IP address',
    citation: 'BR §7.1.2.7.12; Apple; Chrome',
    profiles: ['public', 'private'],
    run: cert => {
        const san = cert.extensions.subjectAltName;
        if (!san) return issue('error', 'No subjectAltName extension. Browsers ignore the CN, so the certificate matches no host.');
        if (san.dnsNames.length === 0 && san.ipAddresses.length === 0) {
            return issue('error', 'The subjectAltName contains no DNS name or IP address.');
        }
        return PASS;
    },
};

function nonPublicEntries(cert: CertContext): string[] {
    const san = cert.extensions.subjectAltName;
    if (!san) return [];
    const reverseZoneBanned = cert.notBefore >= REVERSE_ZONE_RULE_START;
    const badNames = san.dnsNames.flatMap(name => {
        if (isInternalName(name.replace(/^\*\./, ''))) return [`${name} (internal name)`];
        if (reverseZoneBanned && isReverseZoneName(name)) return [`${name} (reverse-zone name)`];
        if (name.includes('_')) return [`${name} (underscore)`];
        if (hasReservedLdhLabel(name)) return [`${name} (reserved "??--" label)`];
        return [];
    });
    const badIps = san.ipAddresses
        .filter(ip => {
            const bytes = parseIp(ip);
            return bytes === null || isReservedIp(bytes);
        })
        .map(ip => `${ip} (reserved IP)`);
    const badTypes = san.otherNameTypes.map(type => `${type} (type not permitted)`);
    return [...badNames, ...badIps, ...badTypes];
}

export const sanPublicNames: CheckDefinition = {
    id: 'san_public_names',
    title: 'subjectAltName contains only public names and addresses',
    citation: 'BR §7.1.2.7.12',
    profiles: ['public'],
    run: cert => {
        if (!cert.extensions.subjectAltName) return NOT_APPLICABLE;
        const bad = nonPublicEntries(cert);
        return bad.length === 0 ? PASS : issue('error', `Not allowed in a publicly-trusted certificate: ${bad.join(', ')}.`);
    },
};

export const sanCriticality: CheckDefinition = {
    id: 'san_criticality',
    title: 'subjectAltName criticality matches the subject',
    citation: 'BR §7.1.2.7.12; RFC 5280 §4.2.1.6',
    profiles: ['public'],
    run: cert => {
        const san = cert.extensions.subjectAltName;
        if (!san) return NOT_APPLICABLE;
        if (cert.subjectIsEmpty && !san.critical) return issue('error', 'The subject is empty, so subjectAltName MUST be critical.');
        if (!cert.subjectIsEmpty && san.critical) return issue('error', 'The subject is not empty, so subjectAltName MUST NOT be critical.');
        return PASS;
    },
};

export const cnInSan: CheckDefinition = {
    id: 'cn_in_san',
    title: 'Common Name is one of the subjectAltName values',
    citation: 'BR §7.1.4.3',
    profiles: ['public'],
    run: cert => {
        const cns = cert.subjectCommonNames;
        if (cns.length === 0) return PASS;
        if (cns.length > 1) return issue('error', `The subject has ${cns.length} Common Names; at most one is allowed.`);
        const [cn] = cns;
        const san = cert.extensions.subjectAltName;
        const listed = san !== null && (san.dnsNames.includes(cn) || san.ipAddresses.includes(cn));
        return listed ? PASS : issue('error', `CN "${cn}" is not an exact copy of any subjectAltName value.`);
    },
};
