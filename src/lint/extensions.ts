import { AsnConvert } from '@peculiar/asn1-schema';
import {
    AuthorityInfoAccessSyntax,
    BasicConstraints,
    CertificatePolicies,
    ExtendedKeyUsage,
    Extension,
    GeneralName,
    KeyUsage,
    KeyUsageFlags,
    SubjectAlternativeName,
    id_ad_caIssuers,
    id_ad_ocsp,
    id_ce_authorityKeyIdentifier,
    id_ce_basicConstraints,
    id_ce_certificatePolicies,
    id_ce_cRLDistributionPoints,
    id_ce_extKeyUsage,
    id_ce_keyUsage,
    id_ce_subjectAltName,
    id_pe_authorityInfoAccess,
} from '@peculiar/asn1-x509';
import { formatIp, parseIp } from './net';
import type { CertExtensions, KeyUsageFlag, SubjectAltNameInfo } from './types';

const OID_SCT_LIST = '1.3.6.1.4.1.11129.2.4.2';

const KEY_USAGE_BITS: ReadonlyArray<readonly [KeyUsageFlags, KeyUsageFlag]> = [
    [KeyUsageFlags.digitalSignature, 'digitalSignature'],
    [KeyUsageFlags.nonRepudiation, 'nonRepudiation'],
    [KeyUsageFlags.keyEncipherment, 'keyEncipherment'],
    [KeyUsageFlags.dataEncipherment, 'dataEncipherment'],
    [KeyUsageFlags.keyAgreement, 'keyAgreement'],
    [KeyUsageFlags.keyCertSign, 'keyCertSign'],
    [KeyUsageFlags.cRLSign, 'cRLSign'],
    [KeyUsageFlags.encipherOnly, 'encipherOnly'],
    [KeyUsageFlags.decipherOnly, 'decipherOnly'],
];

const OTHER_NAME_TYPES = [
    'otherName',
    'rfc822Name',
    'x400Address',
    'directoryName',
    'ediPartyName',
    'uniformResourceIdentifier',
    'registeredID',
] as const;

type Decoder<T> = new () => T;

function decode<T>(ext: Extension, type: Decoder<T>, label: string): T {
    try {
        return AsnConvert.parse(ext.extnValue.buffer, type);
    } catch (e: unknown) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new Error(`Malformed ${label} extension: ${reason}`);
    }
}

function nameTypeOf(name: GeneralName): string {
    return OTHER_NAME_TYPES.find(type => name[type] !== undefined) ?? 'unknown';
}

function decodeSubjectAltName(ext: Extension): SubjectAltNameInfo {
    const names = decode(ext, SubjectAlternativeName, 'subjectAltName');
    const dnsNames: string[] = [];
    const ipAddresses: string[] = [];
    const otherNameTypes: string[] = [];
    for (const name of names) {
        if (name.dNSName !== undefined) {
            dnsNames.push(name.dNSName);
        } else if (name.iPAddress !== undefined) {
            const bytes = parseIp(name.iPAddress);
            ipAddresses.push(bytes ? formatIp(bytes) : name.iPAddress);
        } else {
            otherNameTypes.push(nameTypeOf(name));
        }
    }
    return { critical: ext.critical, dnsNames, ipAddresses, otherNameTypes };
}

function decodeKeyUsage(ext: Extension): NonNullable<CertExtensions['keyUsage']> {
    const bits = decode(ext, KeyUsage, 'keyUsage').toNumber();
    const flags = KEY_USAGE_BITS.filter(([bit]) => (bits & bit) !== 0).map(([, flag]) => flag);
    return { critical: ext.critical, flags };
}

function decodeBasicConstraints(ext: Extension): NonNullable<CertExtensions['basicConstraints']> {
    const bc = decode(ext, BasicConstraints, 'basicConstraints');
    return bc.pathLenConstraint === undefined ? { ca: bc.cA } : { ca: bc.cA, pathLenConstraint: bc.pathLenConstraint };
}

function decodeAuthorityInfoAccess(ext: Extension): NonNullable<CertExtensions['authorityInfoAccess']> {
    const descriptions = decode(ext, AuthorityInfoAccessSyntax, 'authorityInfoAccess');
    const urisFor = (method: string) =>
        descriptions
            .filter(d => d.accessMethod === method)
            .map(d => d.accessLocation.uniformResourceIdentifier ?? '')
            .filter(uri => uri !== '');
    return { ocsp: urisFor(id_ad_ocsp), caIssuers: urisFor(id_ad_caIssuers) };
}

/** Decodes the extensions the checks need. The first occurrence wins if an extension is repeated. */
export function decodeExtensions(extensions: readonly Extension[]): CertExtensions {
    const find = (oid: string) => extensions.find(ext => ext.extnID === oid);
    const san = find(id_ce_subjectAltName);
    const eku = find(id_ce_extKeyUsage);
    const bc = find(id_ce_basicConstraints);
    const ku = find(id_ce_keyUsage);
    const policies = find(id_ce_certificatePolicies);
    const aia = find(id_pe_authorityInfoAccess);

    return {
        all: extensions.map(ext => ({ oid: ext.extnID, critical: ext.critical })),
        subjectAltName: san ? decodeSubjectAltName(san) : null,
        extKeyUsage: eku ? [...decode(eku, ExtendedKeyUsage, 'extKeyUsage')] : null,
        basicConstraints: bc ? decodeBasicConstraints(bc) : null,
        keyUsage: ku ? decodeKeyUsage(ku) : null,
        certificatePolicies: policies
            ? decode(policies, CertificatePolicies, 'certificatePolicies').map(p => p.policyIdentifier)
            : null,
        authorityInfoAccess: aia ? decodeAuthorityInfoAccess(aia) : null,
        hasAuthorityKeyIdentifier: find(id_ce_authorityKeyIdentifier) !== undefined,
        hasCrlDistributionPoints: find(id_ce_cRLDistributionPoints) !== undefined,
        hasSctList: find(OID_SCT_LIST) !== undefined,
    };
}
