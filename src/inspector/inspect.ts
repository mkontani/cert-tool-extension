import forge from 'node-forge';
import { describePublicKey, signatureAlgorithmName } from './algorithms';
import { describeExtension } from './extensions';
import { fingerprintsOf, spkiPinOf } from './fingerprint';
import { commonNameOf, describeName } from './format';
import type { PemKind } from './pem';
import type { ExtensionInfo, InspectionResult } from './types';

const OID_EXTENSION_REQUEST = '1.2.840.113549.1.9.14';

type Asn1Node = forge.asn1.Asn1;

const MALFORMED = 'Unexpected ASN.1 structure.';

/** The children of a constructed node. Throws for a missing node, or a primitive one, whose value is its bytes. */
function childrenOf(node: Asn1Node | undefined): Asn1Node[] {
    if (node === undefined || typeof node.value === 'string') throw new Error(MALFORMED);
    return node.value;
}

/** One child of a constructed node. Throws when it is not there. */
function childOf(node: Asn1Node | undefined, index: number): Asn1Node {
    const child = childrenOf(node)[index];
    if (child === undefined) throw new Error(MALFORMED);
    return child;
}

/** The bytes of a primitive node. Throws for a missing node, or a constructed one. */
function bytesOf(node: Asn1Node | undefined): string {
    if (node === undefined || typeof node.value !== 'string') throw new Error(MALFORMED);
    return node.value;
}

const isContextTag = (node: Asn1Node, tagNumber: number): boolean => node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node.type === tagNumber;

/** Re-encodes a parsed forge node so the schema-based decoders can read it. */
const derBytes = (node: Asn1Node): Uint8Array => Uint8Array.from(forge.asn1.toDer(node).getBytes(), c => c.charCodeAt(0));

/** The OID that starts an AlgorithmIdentifier or an attribute. */
const oidOf = (node: Asn1Node): string => forge.asn1.derToOid(bytesOf(childOf(node, 0)));

function parseDate(node: Asn1Node): string {
    if (node.type === forge.asn1.Type.UTCTIME) return forge.asn1.utcTimeToDate(bytesOf(node)).toUTCString();
    if (node.type === forge.asn1.Type.GENERALIZEDTIME) return forge.asn1.generalizedTimeToDate(bytesOf(node)).toUTCString();
    return 'Unknown';
}

/** The extensions an attribute of a CSR requests (RFC 2985 §5.4.2): none, unless it is an extensionRequest. */
const requestedExtensions = (attribute: Asn1Node): Asn1Node[] =>
    oidOf(attribute) === OID_EXTENSION_REQUEST ? childrenOf(childOf(childOf(attribute, 1), 0)) : [];

/** CertificationRequest (RFC 2986 §4): version, subject, public key, and attributes, which may hold requested extensions. */
function inspectCsr(asn1: Asn1Node): InspectionResult {
    const cri = childOf(asn1, 0);
    const subjectDer = derBytes(childOf(cri, 1));
    const spki = derBytes(childOf(cri, 2));
    const attributes = childrenOf(cri)[3];
    const extensions: ExtensionInfo[] = (attributes === undefined ? [] : childrenOf(attributes))
        .flatMap(requestedExtensions)
        .map(ext => describeExtension(derBytes(ext)));

    const subject = describeName(subjectDer);
    return {
        type: 'Certificate Signing Request (CSR)',
        label: commonNameOf(subjectDer) || subject || '(no subject)',
        subject,
        pubKeyAlgo: describePublicKey(spki),
        spkiSha256: spkiPinOf(spki),
        signatureAlgo: signatureAlgorithmName(oidOf(childOf(asn1, 1))),
        extensions,
    };
}

/** Certificate (RFC 5280 §4.1): the TBS fields, after the version that v1 certificates leave out, and the extensions in [3]. */
function inspectCertificate(asn1: Asn1Node, der: Uint8Array): InspectionResult {
    const tbs = childOf(asn1, 0);
    const offset = isContextTag(childOf(tbs, 0), 0) ? 1 : 0;
    const field = (index: number) => childOf(tbs, offset + index);
    const validity = field(3);
    const issuerDer = derBytes(field(2));
    const subjectDer = derBytes(field(4));
    const spki = derBytes(field(5));
    const extensions: ExtensionInfo[] = childrenOf(tbs)
        .slice(offset + 6)
        .filter(node => isContextTag(node, 3))
        .flatMap(node => childrenOf(childOf(node, 0)))
        .map(ext => describeExtension(derBytes(ext)));

    const subject = describeName(subjectDer);
    const issuer = describeName(issuerDer);
    return {
        type: 'X.509 Certificate',
        label: commonNameOf(subjectDer) || subject || '(no subject)',
        subject,
        issuer,
        issuerLabel: commonNameOf(issuerDer) || issuer || '(no issuer)',
        serial: forge.util.bytesToHex(bytesOf(field(0))),
        notBefore: parseDate(childOf(validity, 0)),
        notAfter: parseDate(childOf(validity, 1)),
        pubKeyAlgo: describePublicKey(spki),
        fingerprints: fingerprintsOf(der),
        spkiSha256: spkiPinOf(spki),
        signatureAlgo: signatureAlgorithmName(oidOf(childOf(asn1, 1))),
        extensions,
    };
}

/** Decodes one DER-encoded certificate or CSR for display. Throws when its structure cannot be walked. */
export function inspect(der: Uint8Array, kind: PemKind): InspectionResult {
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(der));
    return kind === 'csr' ? inspectCsr(asn1) : inspectCertificate(asn1, der);
}
