import { AsnConvert } from '@peculiar/asn1-schema';
import {
    AuthorityInfoAccessSyntax,
    AuthorityKeyIdentifier,
    BasicConstraints,
    CertificatePolicies,
    CRLDistributionPoints,
    ExtendedKeyUsage,
    Extension,
    IssueAlternativeName,
    KeyUsage,
    KeyUsageFlags,
    NameConstraints,
    PolicyConstraints,
    SubjectAlternativeName,
    SubjectInfoAccessSyntax,
    SubjectKeyIdentifier,
    UserNotice,
    id_ce_authorityKeyIdentifier,
    id_ce_basicConstraints,
    id_ce_certificatePolicies,
    id_ce_cRLDistributionPoints,
    id_ce_extKeyUsage,
    id_ce_issuerAltName,
    id_ce_keyUsage,
    id_ce_nameConstraints,
    id_ce_policyConstraints,
    id_ce_subjectAltName,
    id_ce_subjectKeyIdentifier,
    id_pe_authorityInfoAccess,
    id_pe_subjectInfoAccess,
    id_qt_csp,
    id_qt_unotice,
    type GeneralSubtrees,
    type PolicyQualifierInfo,
} from '@peculiar/asn1-x509';
import * as asn1js from 'asn1js';
import { asn1String, bytesToNumber, colonHex, describeGeneralName, displayText, formatRdn, hexValue, nameFor } from './format';
import { describeSctList } from './sct';
import type { DisplayEntry, ExtensionInfo } from './types';

const OID_TLS_FEATURE = '1.3.6.1.5.5.7.1.24';
const OID_SCT_LIST = '1.3.6.1.4.1.11129.2.4.2';
const OID_CT_POISON = '1.3.6.1.4.1.11129.2.4.3';

const EXTENSION_NAMES: Readonly<Record<string, string>> = {
    '2.5.29.9': 'subjectDirectoryAttributes',
    '2.5.29.14': 'subjectKeyIdentifier',
    '2.5.29.15': 'keyUsage',
    '2.5.29.16': 'privateKeyUsagePeriod',
    '2.5.29.17': 'subjectAltName',
    '2.5.29.18': 'issuerAltName',
    '2.5.29.19': 'basicConstraints',
    '2.5.29.30': 'nameConstraints',
    '2.5.29.31': 'cRLDistributionPoints',
    '2.5.29.32': 'certificatePolicies',
    '2.5.29.33': 'policyMappings',
    '2.5.29.35': 'authorityKeyIdentifier',
    '2.5.29.36': 'policyConstraints',
    '2.5.29.37': 'extKeyUsage',
    '2.5.29.46': 'freshestCRL',
    '2.5.29.54': 'inhibitAnyPolicy',
    '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
    '1.3.6.1.5.5.7.1.11': 'subjectInfoAccess',
    [OID_TLS_FEATURE]: 'tlsFeature',
    [OID_SCT_LIST]: 'signedCertificateTimestampList',
    [OID_CT_POISON]: 'ctPrecertificatePoison',
    '1.3.6.1.5.5.7.48.1.5': 'ocspNoCheck',
    '2.16.840.1.113730.1.1': 'nsCertType',
    '2.16.840.1.113730.1.13': 'nsComment',
};

const KEY_USAGE_NAMES: ReadonlyArray<readonly [KeyUsageFlags, string]> = [
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

const EKU_NAMES: Readonly<Record<string, string>> = {
    '1.3.6.1.5.5.7.3.1': 'serverAuth',
    '1.3.6.1.5.5.7.3.2': 'clientAuth',
    '1.3.6.1.5.5.7.3.3': 'codeSigning',
    '1.3.6.1.5.5.7.3.4': 'emailProtection',
    '1.3.6.1.5.5.7.3.8': 'timeStamping',
    '1.3.6.1.5.5.7.3.9': 'OCSPSigning',
    '2.5.29.37.0': 'anyExtendedKeyUsage',
};

const ACCESS_METHODS: Readonly<Record<string, string>> = {
    '1.3.6.1.5.5.7.48.1': 'OCSP',
    '1.3.6.1.5.5.7.48.2': 'CA Issuers',
    '1.3.6.1.5.5.7.48.3': 'Time Stamping',
    '1.3.6.1.5.5.7.48.5': 'CA Repository',
};

const POLICY_NAMES: Readonly<Record<string, string>> = {
    '2.23.140.1.2.1': 'CA/B Domain Validated',
    '2.23.140.1.2.2': 'CA/B Organization Validated',
    '2.23.140.1.2.3': 'CA/B Individual Validated',
    '2.23.140.1.1': 'CA/B Extended Validation',
    '2.5.29.32.0': 'anyPolicy',
};

const TLS_FEATURES: Readonly<Record<string, string>> = {
    5: 'status_request (OCSP Must-Staple)',
    17: 'status_request_v2',
};

type Described = Pick<ExtensionInfo, 'value' | 'entries'>;

const listOf = (entries: readonly DisplayEntry[]): Described =>
    entries.length === 0
        ? { value: '(empty)' }
        : { value: entries.map(e => `${e.type}:${e.value}`).join(', '), entries };

function describeAuthorityKeyIdentifier(value: ArrayBuffer): Described {
    const aki = AsnConvert.parse(value, AuthorityKeyIdentifier);
    const keyId = aki.keyIdentifier && colonHex(aki.keyIdentifier.buffer);
    if (keyId && !aki.authorityCertIssuer && !aki.authorityCertSerialNumber) return { value: keyId };
    return listOf([
        ...(keyId ? [{ type: 'KeyID', value: keyId }] : []),
        ...(aki.authorityCertIssuer ?? []).map(describeGeneralName),
        ...(aki.authorityCertSerialNumber ? [{ type: 'Serial', value: colonHex(aki.authorityCertSerialNumber) }] : []),
    ]);
}

function describeCrlDistributionPoints(value: ArrayBuffer): Described {
    return listOf(AsnConvert.parse(value, CRLDistributionPoints).flatMap(point => [
        ...(point.distributionPoint?.fullName ?? []).map(describeGeneralName),
        ...(point.distributionPoint?.nameRelativeToCRLIssuer
            ? [{ type: 'RelativeName', value: formatRdn(point.distributionPoint.nameRelativeToCRLIssuer) }]
            : []),
        ...(point.reasons ? [{ type: 'Reasons', value: point.reasons.toJSON().join(', ') }] : []),
        ...(point.cRLIssuer ?? []).map(name => {
            const issuer = describeGeneralName(name);
            return { type: 'CRL Issuer', value: `${issuer.type} ${issuer.value}` };
        }),
    ]));
}

const describeAccess = (syntax: typeof AuthorityInfoAccessSyntax | typeof SubjectInfoAccessSyntax) =>
    (value: ArrayBuffer): Described =>
        listOf(AsnConvert.parse(value, syntax).map(access => ({
            type: nameFor(ACCESS_METHODS, access.accessMethod) ?? access.accessMethod,
            value: describeGeneralName(access.accessLocation).value,
        })));

function describeQualifier(info: PolicyQualifierInfo): DisplayEntry {
    if (info.policyQualifierId === id_qt_csp) {
        const uri = asn1String(info.qualifier);
        if (uri !== undefined) return { type: 'CPS', value: displayText(uri) };
    }
    if (info.policyQualifierId === id_qt_unotice) {
        const notice = AsnConvert.parse(info.qualifier, UserNotice);
        const text = notice.explicitText?.toString()
            ?? (notice.noticeRef ? `${notice.noticeRef.organization.toString()} #${notice.noticeRef.noticeNumbers.join(', #')}` : '');
        return { type: 'Notice', value: displayText(text) };
    }
    return { type: info.policyQualifierId, value: hexValue(info.qualifier) };
}

function describeCertificatePolicies(value: ArrayBuffer): Described {
    return listOf(AsnConvert.parse(value, CertificatePolicies).flatMap(policy => {
        const name = nameFor(POLICY_NAMES, policy.policyIdentifier);
        return [
            { type: 'Policy', value: name ? `${policy.policyIdentifier} (${name})` : policy.policyIdentifier },
            ...(policy.policyQualifiers ?? []).map(describeQualifier),
        ];
    }));
}

function describeNameConstraints(value: ArrayBuffer): Described {
    const constraints = AsnConvert.parse(value, NameConstraints);
    const subtrees = (type: string, trees: GeneralSubtrees | undefined) =>
        (trees ?? []).map(tree => {
            const base = describeGeneralName(tree.base);
            return { type, value: `${base.type} ${base.value}` };
        });
    return listOf([
        ...subtrees('Permitted', constraints.permittedSubtrees),
        ...subtrees('Excluded', constraints.excludedSubtrees),
    ]);
}

function describePolicyConstraints(value: ArrayBuffer): Described {
    const constraints = AsnConvert.parse(value, PolicyConstraints);
    const parts = [
        constraints.requireExplicitPolicy && `requireExplicitPolicy:${bytesToNumber(constraints.requireExplicitPolicy)}`,
        constraints.inhibitPolicyMapping && `inhibitPolicyMapping:${bytesToNumber(constraints.inhibitPolicyMapping)}`,
    ];
    return { value: parts.filter(Boolean).join(', ') || '(empty)' };
}

/** RFC 7633 TLS Feature: a SEQUENCE OF INTEGER naming TLS extensions the server must send. */
function describeTlsFeature(value: ArrayBuffer): Described {
    const parsed = asn1js.fromBER(value);
    if (parsed.offset === -1 || !(parsed.result instanceof asn1js.Sequence)) throw new Error('TLS feature is not a SEQUENCE');
    const features = parsed.result.valueBlock.value.map(item => {
        if (!(item instanceof asn1js.Integer)) throw new Error('TLS feature is not an INTEGER');
        const id = String(item.valueBlock.valueDec);
        return nameFor(TLS_FEATURES, id) ?? id;
    });
    return { value: features.join(', ') };
}

function describeKeyUsage(value: ArrayBuffer): Described {
    const bits = AsnConvert.parse(value, KeyUsage).toNumber();
    return { value: KEY_USAGE_NAMES.filter(([bit]) => (bits & bit) !== 0).map(([, name]) => name).join(', ') || '(none)' };
}

function describeBasicConstraints(value: ArrayBuffer): Described {
    const bc = AsnConvert.parse(value, BasicConstraints);
    return { value: bc.pathLenConstraint === undefined ? `CA:${bc.cA}` : `CA:${bc.cA}, pathLen:${bc.pathLenConstraint}` };
}

const DECODERS: Readonly<Record<string, (value: ArrayBuffer) => Described>> = {
    [id_ce_subjectKeyIdentifier]: value => ({ value: colonHex(AsnConvert.parse(value, SubjectKeyIdentifier).buffer) }),
    [id_ce_authorityKeyIdentifier]: describeAuthorityKeyIdentifier,
    [id_ce_keyUsage]: describeKeyUsage,
    [id_ce_extKeyUsage]: value => ({
        value: AsnConvert.parse(value, ExtendedKeyUsage).map(oid => nameFor(EKU_NAMES, oid) ?? oid).join(', '),
    }),
    [id_ce_basicConstraints]: describeBasicConstraints,
    [id_ce_subjectAltName]: value => listOf(AsnConvert.parse(value, SubjectAlternativeName).map(describeGeneralName)),
    [id_ce_issuerAltName]: value => listOf(AsnConvert.parse(value, IssueAlternativeName).map(describeGeneralName)),
    [id_ce_cRLDistributionPoints]: describeCrlDistributionPoints,
    [id_pe_authorityInfoAccess]: describeAccess(AuthorityInfoAccessSyntax),
    [id_pe_subjectInfoAccess]: describeAccess(SubjectInfoAccessSyntax),
    [id_ce_certificatePolicies]: describeCertificatePolicies,
    [id_ce_nameConstraints]: describeNameConstraints,
    [id_ce_policyConstraints]: describePolicyConstraints,
    [OID_TLS_FEATURE]: describeTlsFeature,
    [OID_SCT_LIST]: value => listOf(describeSctList(value)),
    [OID_CT_POISON]: () => ({ value: '(present)' }),
};

/** Renders a DER-encoded Extension for display. Values that cannot be decoded are shown as hex. */
export function describeExtension(der: Uint8Array): ExtensionInfo {
    const ext = AsnConvert.parse(der, Extension);
    const value = ext.extnValue.buffer;
    const decoder = nameFor(DECODERS, ext.extnID);
    let described: Described;
    try {
        described = decoder ? decoder(value) : { value: hexValue(value) };
    } catch {
        // A malformed or unexpected encoding is still worth showing; hex keeps every byte visible.
        described = { value: hexValue(value) };
    }
    return { name: nameFor(EXTENSION_NAMES, ext.extnID) ?? ext.extnID, critical: ext.critical, ...described };
}
