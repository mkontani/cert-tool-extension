export type Severity = 'error' | 'warn' | 'info';

/** Which rule set to apply: publicly-trusted (CA/B Forum BR + root programs) or a private/internal CA. */
export type Profile = 'public' | 'private';

export type KeyUsageFlag =
    | 'digitalSignature'
    | 'nonRepudiation'
    | 'keyEncipherment'
    | 'dataEncipherment'
    | 'keyAgreement'
    | 'keyCertSign'
    | 'cRLSign'
    | 'encipherOnly'
    | 'decipherOnly';

export interface AlgorithmInfo {
    readonly oid: string;
    /** Hex of the DER-encoded AlgorithmIdentifier, for byte-for-byte comparisons required by the BR. */
    readonly derHex: string;
}

export interface PublicKeyInfo {
    readonly algorithm: AlgorithmInfo;
    readonly rsaModulusBits?: number;
    /** namedCurve OID of an id-ecPublicKey key */
    readonly ecCurveOid?: string;
}

export interface ExtensionEntry {
    readonly oid: string;
    readonly critical: boolean;
}

export interface SubjectAltNameInfo {
    readonly critical: boolean;
    readonly dnsNames: readonly string[];
    /** Canonical text form (dotted IPv4, RFC 5952 IPv6). */
    readonly ipAddresses: readonly string[];
    /** GeneralName types other than dNSName / iPAddress, e.g. "rfc822Name". */
    readonly otherNameTypes: readonly string[];
}

export interface CertExtensions {
    /** Every extension in encoding order, duplicates included. */
    readonly all: readonly ExtensionEntry[];
    readonly subjectAltName: SubjectAltNameInfo | null;
    readonly extKeyUsage: readonly string[] | null;
    readonly basicConstraints: { readonly ca: boolean; readonly pathLenConstraint?: number } | null;
    readonly keyUsage: { readonly critical: boolean; readonly flags: readonly KeyUsageFlag[] } | null;
    readonly certificatePolicies: readonly string[] | null;
    readonly authorityInfoAccess: { readonly ocsp: readonly string[]; readonly caIssuers: readonly string[] } | null;
    readonly hasAuthorityKeyIdentifier: boolean;
    readonly hasCrlDistributionPoints: boolean;
    readonly hasSctList: boolean;
}

/** Normalized view of a certificate; every check reads only this. */
export interface CertContext {
    /** 1, 2 or 3 */
    readonly version: number;
    /** Content octets of the serialNumber INTEGER (two's complement, as encoded). */
    readonly serialNumber: Uint8Array;
    readonly notBefore: Date;
    readonly notAfter: Date;
    readonly subjectCommonNames: readonly string[];
    readonly subjectIsEmpty: boolean;
    /** issuer and subject are byte-for-byte identical */
    readonly isSelfIssued: boolean;
    readonly signatureAlgorithm: AlgorithmInfo;
    /** tbsCertificate.signature is byte-for-byte identical to Certificate.signatureAlgorithm */
    readonly signatureAlgorithmsMatch: boolean;
    readonly publicKey: PublicKeyInfo;
    readonly extensions: CertExtensions;
}

export interface CheckEnv {
    readonly now: Date;
    /** Optional hostname or IP address the certificate is expected to serve. */
    readonly hostname?: string;
}

export type CheckOutcome =
    | { readonly status: 'pass' }
    | { readonly status: 'na' }
    | { readonly status: 'issue'; readonly severity: Severity; readonly message: string };

export interface CheckDefinition {
    readonly id: string;
    readonly title: string;
    readonly citation: string;
    readonly profiles: readonly Profile[];
    readonly run: (cert: CertContext, env: CheckEnv) => CheckOutcome;
}

export type CheckResult = Pick<CheckDefinition, 'id' | 'title' | 'citation'> & CheckOutcome;

export interface LintReport {
    readonly profile: Profile;
    readonly detectedProfile: Profile;
    /** CA certificates are out of scope; when true, no checks were run. */
    readonly isCaCertificate: boolean;
    readonly results: readonly CheckResult[];
}

export interface LintOptions {
    readonly profile?: Profile | 'auto';
    readonly hostname?: string;
    readonly now?: Date;
}
