import * as asn1js from 'asn1js';
import { importPrivateKey, type KeyAlgorithm, type PrivateKey } from './privateKey';

interface SignatureScheme {
    readonly params: Algorithm | EcdsaParams;
    /** The signature algorithm's OID, for the AlgorithmIdentifier. */
    readonly oid: string;
    /** RSA's AlgorithmIdentifier carries NULL parameters (RFC 4055); ECDSA's and Ed25519's carry none (RFC 5758, RFC 8410). */
    readonly nullParameters: boolean;
}

/** The scheme each key signs with: SHA-256 for RSA, and the hash that matches the curve for ECDSA, as CAs expect. */
function schemeFor(algorithm: KeyAlgorithm): SignatureScheme {
    switch (algorithm.name) {
        case 'RSA':
            return { params: { name: 'RSASSA-PKCS1-v1_5' }, oid: '1.2.840.113549.1.1.11', nullParameters: true };
        case 'Ed25519':
            return { params: { name: 'Ed25519' }, oid: '1.3.101.112', nullParameters: false };
        case 'ECDSA': {
            const [hash, oid] = {
                'P-256': ['SHA-256', '1.2.840.10045.4.3.2'],
                'P-384': ['SHA-384', '1.2.840.10045.4.3.3'],
                'P-521': ['SHA-512', '1.2.840.10045.4.3.4'],
            }[algorithm.curve];
            return { params: { name: 'ECDSA', hash }, oid, nullParameters: false };
        }
    }
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** WebCrypto gives an ECDSA signature as r || s (IEEE P1363); X.509 wants SEQUENCE { r INTEGER, s INTEGER } (RFC 3279). */
export function ecdsaSignatureToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
    const half = raw.length / 2;
    const integer = (bytes: Uint8Array) => asn1js.Integer.fromBigInt(BigInt(`0x${toHex(bytes)}`));
    return new Uint8Array(new asn1js.Sequence({ value: [integer(raw.slice(0, half)), integer(raw.slice(half))] }).toBER());
}

export interface Signature {
    /** The AlgorithmIdentifier of the signature algorithm. */
    readonly algorithm: asn1js.Sequence;
    /** The signature as it goes into the BIT STRING. */
    readonly value: Uint8Array<ArrayBuffer>;
}

/** Signs the data with the key, the way a CSR or certificate is signed. */
export async function sign(key: PrivateKey, data: Uint8Array<ArrayBuffer>): Promise<Signature> {
    const scheme = schemeFor(key.algorithm);
    const signature = new Uint8Array(await crypto.subtle.sign(scheme.params, await importPrivateKey(key), data));
    const algorithm = new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: scheme.oid }), ...(scheme.nullParameters ? [new asn1js.Null()] : [])],
    });
    return { algorithm, value: key.algorithm.name === 'ECDSA' ? ecdsaSignatureToDer(signature) : signature };
}
