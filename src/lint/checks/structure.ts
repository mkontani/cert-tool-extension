import type { CertContext, CheckDefinition } from '../types';
import { PASS, RESERVED_POLICY_OIDS, issue, validityDays } from './common';

const MAX_SERIAL_OCTETS = 20;
const MIN_SERIAL_ENTROPY_OCTETS = 8;
const OID_ANY_POLICY = '2.5.29.32.0';

/** Extensions that path validators in browsers and operating systems process when marked critical. */
const UNDERSTOOD_CRITICAL_EXTENSIONS: ReadonlySet<string> = new Set([
    '2.5.29.15', // keyUsage
    '2.5.29.17', // subjectAltName
    '2.5.29.19', // basicConstraints
    '2.5.29.30', // nameConstraints
    '2.5.29.32', // certificatePolicies
    '2.5.29.33', // policyMappings
    '2.5.29.36', // policyConstraints
    '2.5.29.37', // extKeyUsage
    '2.5.29.54', // inhibitAnyPolicy
]);

/** BR "Short-lived Subscriber Certificate" thresholds by issuance date. */
const SHORT_LIVED_LIMITS = [
    { from: new Date('2026-03-15T00:00:00Z'), maxDays: 7 },
    { from: new Date('2024-03-15T00:00:00Z'), maxDays: 10 },
] as const;

function isShortLived(cert: CertContext): boolean {
    const limit = SHORT_LIVED_LIMITS.find(l => cert.notBefore >= l.from);
    return limit !== undefined && validityDays(cert) <= limit.maxDays;
}

/** Serial content octets without the 0x00 padding that keeps a high-bit value positive. */
function significantSerialOctets(serial: Uint8Array): number {
    return serial.length > 1 && serial[0] === 0 ? serial.length - 1 : serial.length;
}

export const selfSigned: CheckDefinition = {
    id: 'self_signed',
    title: 'Issued by a CA (not self-signed)',
    citation: 'RFC 5280 §6.1',
    profiles: ['public', 'private'],
    run: cert =>
        cert.isSelfIssued
            ? issue('info', 'Issuer and subject are identical (self-signed): every client must be configured to trust it explicitly.')
            : PASS,
};

export const x509V3: CheckDefinition = {
    id: 'x509_v3',
    title: 'Certificate is X.509 v3',
    citation: 'BR §7.1.1; RFC 5280 §4.1.2.1',
    profiles: ['public', 'private'],
    run: cert => (cert.version === 3 ? PASS : issue('error', `Certificate is X.509 v${cert.version}; v3 is required.`)),
};

export const serialNumberRange: CheckDefinition = {
    id: 'serial_number_range',
    title: 'Serial number is positive and at most 20 octets',
    citation: 'RFC 5280 §4.1.2.2',
    profiles: ['public', 'private'],
    run: cert => {
        const serial = cert.serialNumber;
        if (serial.length > MAX_SERIAL_OCTETS) {
            return issue('error', `Serial number is ${serial.length} octets; at most ${MAX_SERIAL_OCTETS} are allowed.`);
        }
        if (serial.length === 0 || (serial[0] & 0x80) !== 0) return issue('error', 'Serial number is negative or empty.');
        if (serial.every(b => b === 0)) return issue('error', 'Serial number is zero.');
        return PASS;
    },
};

export const serialNumberEntropy: CheckDefinition = {
    id: 'serial_number_entropy',
    title: 'Serial number is long enough for 64 bits of randomness',
    citation: 'BR §7.1.2.7',
    profiles: ['public'],
    run: cert => {
        const octets = significantSerialOctets(cert.serialNumber);
        return octets < MIN_SERIAL_ENTROPY_OCTETS
            ? issue('warn', `Serial number has ${octets} octets; it cannot contain the required 64 bits of CSPRNG output.`)
            : PASS;
    },
};

export const brPolicyOid: CheckDefinition = {
    id: 'br_policy_oid',
    title: 'certificatePolicies has exactly one CA/B Forum policy',
    citation: 'BR §7.1.2.7.9',
    profiles: ['public'],
    run: cert => {
        const policies = cert.extensions.certificatePolicies;
        if (!policies || policies.length === 0) return issue('error', 'certificatePolicies is missing or empty.');
        if (policies.includes(OID_ANY_POLICY)) return issue('error', 'anyPolicy MUST NOT be present.');
        const reserved = policies.filter(oid => RESERVED_POLICY_OIDS.has(oid));
        return reserved.length === 1
            ? PASS
            : issue('error', `Found ${reserved.length} CA/B Forum reserved policy OIDs (DV/OV/IV/EV); exactly one is required.`);
    },
};

export const authorityKeyId: CheckDefinition = {
    id: 'authority_key_id',
    title: 'authorityKeyIdentifier is present',
    citation: 'BR §7.1.2.7.6',
    profiles: ['public'],
    run: cert => (cert.extensions.hasAuthorityKeyIdentifier ? PASS : issue('error', 'authorityKeyIdentifier is missing.')),
};

export const revocationInfo: CheckDefinition = {
    id: 'revocation_info',
    title: 'Revocation information (OCSP or CRL) is provided',
    citation: 'BR §7.1.2.11.2',
    profiles: ['public'],
    run: cert => {
        const hasOcsp = (cert.extensions.authorityInfoAccess?.ocsp.length ?? 0) > 0;
        if (hasOcsp || cert.extensions.hasCrlDistributionPoints || isShortLived(cert)) return PASS;
        return issue('error', 'Neither an OCSP URL nor a CRL distribution point is present.');
    },
};

export const caIssuers: CheckDefinition = {
    id: 'ca_issuers',
    title: 'AIA includes the issuing CA certificate URL',
    citation: 'BR §7.1.2.7.7',
    profiles: ['public'],
    run: cert =>
        (cert.extensions.authorityInfoAccess?.caIssuers.length ?? 0) > 0
            ? PASS
            : issue('warn', 'No caIssuers URL; clients cannot fetch a missing intermediate certificate.'),
};

export const sctEmbedded: CheckDefinition = {
    id: 'sct_embedded',
    title: 'Certificate Transparency SCTs are embedded',
    citation: 'Chrome / Apple Certificate Transparency policies',
    profiles: ['public'],
    run: cert =>
        cert.extensions.hasSctList
            ? PASS
            : issue('warn', 'No embedded SCTs. Unless the server delivers SCTs via TLS or OCSP, Chrome and Safari will reject it.'),
};

export const extensionsUnique: CheckDefinition = {
    id: 'extensions_unique',
    title: 'Extensions are unique and critical ones are understood',
    citation: 'RFC 5280 §4.2',
    profiles: ['public', 'private'],
    run: cert => {
        const oids = cert.extensions.all.map(ext => ext.oid);
        const duplicates = [...new Set(oids.filter((oid, i) => oids.indexOf(oid) !== i))];
        if (duplicates.length > 0) {
            return issue('error', `Repeated extension(s): ${duplicates.join(', ')}. Only the first occurrence was checked.`);
        }
        const unknownCritical = cert.extensions.all
            .filter(ext => ext.critical && !UNDERSTOOD_CRITICAL_EXTENSIONS.has(ext.oid))
            .map(ext => ext.oid);
        return unknownCritical.length > 0
            ? issue('warn', `Critical extension(s) ${unknownCritical.join(', ')} will be rejected by clients that do not support them.`)
            : PASS;
    },
};
