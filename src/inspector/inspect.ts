import forge from 'node-forge';
import { describePublicKey, signatureAlgorithmName } from './algorithms';
import { describeExtension } from './extensions';
import { commonNameOf, describeName } from './format';
import type { PemKind } from './pem';
import type { ExtensionInfo, InspectionResult } from './types';

const OID_EXTENSION_REQUEST = '1.2.840.113549.1.9.14';

/** Re-encodes a parsed forge node so the schema-based decoders can read it. */
const derBytes = (node: forge.asn1.Asn1) => Uint8Array.from(forge.asn1.toDer(node).getBytes(), c => c.charCodeAt(0));

const parseDate = (node: any): string => {
    if (node.type === forge.asn1.Type.UTCTIME) return (forge.asn1 as any).utcTimeToDate(node.value).toUTCString();
    if (node.type === forge.asn1.Type.GENERALIZEDTIME) return (forge.asn1 as any).generalizedTimeToDate(node.value).toUTCString();
    return 'Unknown';
};

function inspectCsr(asn1: any): InspectionResult {
    const cri = asn1.value[0];
    const subjectDer = derBytes(cri.value[1]);
    const attributesNode = cri.value[3];

    const extensions: ExtensionInfo[] = [];
    if (attributesNode && attributesNode.value) {
        for (const attr of attributesNode.value) {
            if (forge.asn1.derToOid(attr.value[0].value) !== OID_EXTENSION_REQUEST) continue;
            for (const ext of attr.value[1].value[0].value) extensions.push(describeExtension(derBytes(ext)));
        }
    }

    const subject = describeName(subjectDer);
    return {
        type: 'Certificate Signing Request (CSR)',
        label: commonNameOf(subjectDer) || subject || '(no subject)',
        subject,
        pubKeyAlgo: describePublicKey(derBytes(cri.value[2])),
        signatureAlgo: signatureAlgorithmName(forge.asn1.derToOid(asn1.value[1].value[0].value)),
        extensions,
    };
}

function inspectCertificate(asn1: any): InspectionResult {
    const tbs = asn1.value[0];
    const offset = tbs.value[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && tbs.value[0].type === 0 ? 1 : 0;
    const validity = tbs.value[offset + 3];
    const subjectDer = derBytes(tbs.value[offset + 4]);

    const extensions: ExtensionInfo[] = [];
    for (const node of tbs.value.slice(offset + 6)) {
        if (node.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || node.type !== 3) continue;
        for (const ext of node.value[0].value) extensions.push(describeExtension(derBytes(ext)));
    }

    const subject = describeName(subjectDer);
    return {
        type: 'X.509 Certificate',
        label: commonNameOf(subjectDer) || subject || '(no subject)',
        subject,
        issuer: describeName(derBytes(tbs.value[offset + 2])),
        serial: (forge.util as any).bytesToHex(tbs.value[offset].value),
        notBefore: parseDate(validity.value[0]),
        notAfter: parseDate(validity.value[1]),
        pubKeyAlgo: describePublicKey(derBytes(tbs.value[offset + 5])),
        signatureAlgo: signatureAlgorithmName(forge.asn1.derToOid(asn1.value[1].value[0].value)),
        extensions,
    };
}

/** Decodes one DER-encoded certificate or CSR for display. Throws when its structure cannot be walked. */
export function inspect(der: Uint8Array, kind: PemKind): InspectionResult {
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(der));
    return kind === 'csr' ? inspectCsr(asn1) : inspectCertificate(asn1);
}
