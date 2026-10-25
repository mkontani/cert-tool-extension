import type { CertContext, CertExtensions, CheckEnv } from '../../lint/types';

const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16));

export const OID = {
    rsaEncryption: '1.2.840.113549.1.1.1',
    ecPublicKey: '1.2.840.10045.2.1',
    sha256WithRSA: '1.2.840.113549.1.1.11',
    sha1WithRSA: '1.2.840.113549.1.1.5',
    ecdsaWithSHA256: '1.2.840.10045.4.3.2',
    serverAuth: '1.3.6.1.5.5.7.3.1',
    clientAuth: '1.3.6.1.5.5.7.3.2',
    codeSigning: '1.3.6.1.5.5.7.3.3',
    anyExtendedKeyUsage: '2.5.29.37.0',
    dvPolicy: '2.23.140.1.2.1',
    ovPolicy: '2.23.140.1.2.2',
    anyPolicy: '2.5.29.32.0',
} as const;

export const ALG = {
    rsaKey: { oid: OID.rsaEncryption, derHex: '300d06092a864886f70d0101010500' },
    p256Key: { oid: OID.ecPublicKey, derHex: '301306072a8648ce3d020106082a8648ce3d030107' },
    sha256WithRSA: { oid: OID.sha256WithRSA, derHex: '300d06092a864886f70d01010b0500' },
} as const;

/** A BR-conformant subscriber certificate, mirroring the parsed PUBLIC_RSA_LEAF fixture. */
export const BASE_CERT: CertContext = {
    version: 3,
    serialNumber: hex('5a1b2c3d4e5f60718293a4b5c6d7e8f9'),
    notBefore: new Date('2026-04-01T00:00:00Z'),
    notAfter: new Date('2026-06-29T23:59:59Z'),
    subjectCommonNames: ['www.example.com'],
    subjectIsEmpty: false,
    isSelfIssued: false,
    signatureAlgorithm: ALG.sha256WithRSA,
    signatureAlgorithmsMatch: true,
    publicKey: { algorithm: ALG.rsaKey, rsaModulusBits: 2048 },
    extensions: {
        all: [
            { oid: '2.5.29.17', critical: false },
            { oid: '2.5.29.37', critical: false },
            { oid: '2.5.29.15', critical: true },
            { oid: '2.5.29.19', critical: true },
            { oid: '2.5.29.32', critical: false },
            { oid: '1.3.6.1.5.5.7.1.1', critical: false },
            { oid: '2.5.29.31', critical: false },
            { oid: '2.5.29.35', critical: false },
            { oid: '1.3.6.1.4.1.11129.2.4.2', critical: false },
        ],
        subjectAltName: {
            critical: false,
            dnsNames: ['www.example.com', 'example.com'],
            ipAddresses: [],
            otherNameTypes: [],
        },
        extKeyUsage: [OID.serverAuth],
        basicConstraints: { ca: false },
        keyUsage: { critical: true, flags: ['digitalSignature', 'keyEncipherment'] },
        certificatePolicies: [OID.dvPolicy],
        authorityInfoAccess: { ocsp: ['http://ocsp.example.test'], caIssuers: ['http://ca.example.test/ca.der'] },
        hasAuthorityKeyIdentifier: true,
        hasCrlDistributionPoints: true,
        hasSctList: true,
    },
};

type CertOverrides = Omit<Partial<CertContext>, 'extensions'> & { readonly extensions?: Partial<CertExtensions> };

export function makeCert(overrides: CertOverrides = {}): CertContext {
    return { ...BASE_CERT, ...overrides, extensions: { ...BASE_CERT.extensions, ...overrides.extensions } };
}

export function makeSan(dnsNames: readonly string[], ipAddresses: readonly string[] = []): CertExtensions['subjectAltName'] {
    return { critical: false, dnsNames, ipAddresses, otherNameTypes: [] };
}

/** A moment inside BASE_CERT's validity period. */
export const NOW = new Date('2026-05-01T00:00:00Z');

export function makeEnv(overrides: Partial<CheckEnv> = {}): CheckEnv {
    return { now: NOW, ...overrides };
}

const DAY_MS = 86_400_000;

/** Validity window whose BR "validity period" (notAfter - notBefore + 1s) is exactly `days` days. */
export function validityOfDays(notBefore: string, days: number): Pick<CertContext, 'notBefore' | 'notAfter'> {
    const start = new Date(notBefore);
    return { notBefore: start, notAfter: new Date(start.getTime() + days * DAY_MS - 1000) };
}
