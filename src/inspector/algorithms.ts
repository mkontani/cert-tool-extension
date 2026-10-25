import { AsnConvert } from '@peculiar/asn1-schema';
import { SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
import * as asn1js from 'asn1js';
import { OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION } from '../lint/checks/common';
import { rsaModulusBits } from '../lint/parse';
import { nameFor, undecodable } from './format';

const OID_RSASSA_PSS = '1.2.840.113549.1.1.10';

const KEY_ALGORITHMS: Readonly<Record<string, string>> = {
    '1.3.101.110': 'X25519',
    '1.3.101.111': 'X448',
    '1.3.101.112': 'Ed25519',
    '1.3.101.113': 'Ed448',
    '1.2.840.10040.4.1': 'DSA',
    '2.16.840.1.101.3.4.3.17': 'ML-DSA-44',
    '2.16.840.1.101.3.4.3.18': 'ML-DSA-65',
    '2.16.840.1.101.3.4.3.19': 'ML-DSA-87',
};

const CURVES: Readonly<Record<string, string>> = {
    '1.2.840.10045.3.1.7': 'P-256',
    '1.3.132.0.34': 'P-384',
    '1.3.132.0.35': 'P-521',
    '1.3.132.0.10': 'secp256k1',
    '1.3.36.3.3.2.8.1.1.7': 'brainpoolP256r1',
    '1.3.36.3.3.2.8.1.1.11': 'brainpoolP384r1',
    '1.3.36.3.3.2.8.1.1.13': 'brainpoolP512r1',
    '1.2.156.10197.1.301': 'SM2',
};

/** RSA names as node-forge spells them and ECDSA names as the Inspector already showed them, so existing output does not change. */
const SIGNATURE_ALGORITHMS: Readonly<Record<string, string>> = {
    '1.2.840.113549.1.1.2': 'md2WithRSAEncryption',
    '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
    '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
    '1.2.840.113549.1.1.10': 'RSASSA-PSS',
    '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
    '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
    '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
    '1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
    '1.3.14.3.2.29': 'sha1WithRSASignature',
    '2.16.840.1.101.3.4.3.13': 'sha3-224WithRSAEncryption',
    '2.16.840.1.101.3.4.3.14': 'sha3-256WithRSAEncryption',
    '2.16.840.1.101.3.4.3.15': 'sha3-384WithRSAEncryption',
    '2.16.840.1.101.3.4.3.16': 'sha3-512WithRSAEncryption',
    '1.2.840.10045.4.1': 'ecdsa-with-sha1',
    '1.2.840.10045.4.3.1': 'ecdsa-with-sha224',
    '1.2.840.10045.4.3.2': 'ecdsa-with-sha256',
    '1.2.840.10045.4.3.3': 'ecdsa-with-sha384',
    '1.2.840.10045.4.3.4': 'ecdsa-with-sha512',
    '2.16.840.1.101.3.4.3.9': 'ecdsa-with-sha3-224',
    '2.16.840.1.101.3.4.3.10': 'ecdsa-with-sha3-256',
    '2.16.840.1.101.3.4.3.11': 'ecdsa-with-sha3-384',
    '2.16.840.1.101.3.4.3.12': 'ecdsa-with-sha3-512',
    '1.2.156.10197.1.501': 'SM2-with-SM3',
    '1.2.840.10040.4.3': 'dsa-with-sha1',
    '2.16.840.1.101.3.4.3.2': 'dsa-with-sha256',
    '1.3.101.112': 'Ed25519',
    '1.3.101.113': 'Ed448',
    '2.16.840.1.101.3.4.3.17': 'ML-DSA-44',
    '2.16.840.1.101.3.4.3.18': 'ML-DSA-65',
    '2.16.840.1.101.3.4.3.19': 'ML-DSA-87',
};

export const signatureAlgorithmName = (oid: string): string => nameFor(SIGNATURE_ALGORITHMS, oid) ?? oid;

function curveOf(parameters: ArrayBuffer | null | undefined): string {
    const parsed = parameters ? asn1js.fromBER(parameters) : undefined;
    if (!parsed || parsed.offset === -1 || !(parsed.result instanceof asn1js.ObjectIdentifier)) return 'explicit parameters';
    const oid = parsed.result.valueBlock.toString();
    return nameFor(CURVES, oid) ?? oid;
}

/** Renders a DER-encoded SubjectPublicKeyInfo, e.g. "RSA (2048 bits)" or "ECDSA (P-256)". */
export function describePublicKey(spkiDer: Uint8Array): string {
    let spki: SubjectPublicKeyInfo;
    try {
        spki = AsnConvert.parse(spkiDer, SubjectPublicKeyInfo);
    } catch {
        return undecodable(spkiDer);
    }
    const { algorithm, parameters } = spki.algorithm;
    if (algorithm === OID_RSA_ENCRYPTION || algorithm === OID_RSASSA_PSS) {
        const label = algorithm === OID_RSASSA_PSS ? 'RSA-PSS' : 'RSA';
        const bits = rsaModulusBits(new Uint8Array(spki.subjectPublicKey));
        return bits === undefined ? `${label} (malformed key)` : `${label} (${bits} bits)`;
    }
    if (algorithm === OID_EC_PUBLIC_KEY) return `ECDSA (${curveOf(parameters)})`;
    return nameFor(KEY_ALGORITHMS, algorithm) ?? `Unknown (${algorithm})`;
}
