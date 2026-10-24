import type { CheckDefinition } from '../types';
import { OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION, PASS, issue, lookup } from './common';

const MIN_RSA_BITS = 2048;
const OID_ED25519 = '1.3.101.112';

/** Named curves accepted for TLS server certificates by Chrome, Apple and Mozilla. */
const SUPPORTED_CURVES: Readonly<Record<string, string>> = {
    '1.2.840.10045.3.1.7': 'P-256',
    '1.3.132.0.34': 'P-384',
    '1.3.132.0.35': 'P-521',
};

const WEAK_SIGNATURES: Readonly<Record<string, string>> = {
    '1.2.840.113549.1.1.2': 'md2WithRSAEncryption',
    '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
    '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
    '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
    '1.2.840.10040.4.3': 'dsa-with-sha1',
};

/** BR §7.1.3.1: the only permitted SubjectPublicKeyInfo AlgorithmIdentifier encodings. */
const BR_KEY_ALGORITHMS: Readonly<Record<string, string>> = {
    '300d06092a864886f70d0101010500': 'RSA',
    '301306072a8648ce3d020106082a8648ce3d030107': 'ECDSA P-256',
    '301006072a8648ce3d020106052b81040022': 'ECDSA P-384',
    '301006072a8648ce3d020106052b81040023': 'ECDSA P-521',
};

/** BR §7.1.3.2: the only permitted signature AlgorithmIdentifier encodings. */
const BR_SIGNATURE_ALGORITHMS: Readonly<Record<string, string>> = {
    '300d06092a864886f70d01010b0500': 'RSASSA-PKCS1-v1_5 with SHA-256',
    '300d06092a864886f70d01010c0500': 'RSASSA-PKCS1-v1_5 with SHA-384',
    '300d06092a864886f70d01010d0500': 'RSASSA-PKCS1-v1_5 with SHA-512',
    '304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a203020120':
        'RSASSA-PSS with SHA-256',
    '304106092a864886f70d01010a3034a00f300d06096086480165030402020500a11c301a06092a864886f70d010108300d06096086480165030402020500a203020130':
        'RSASSA-PSS with SHA-384',
    '304106092a864886f70d01010a3034a00f300d06096086480165030402030500a11c301a06092a864886f70d010108300d06096086480165030402030500a203020140':
        'RSASSA-PSS with SHA-512',
    '300a06082a8648ce3d040302': 'ECDSA with SHA-256',
    '300a06082a8648ce3d040303': 'ECDSA with SHA-384',
    '300a06082a8648ce3d040304': 'ECDSA with SHA-512',
};

export const keyStrength: CheckDefinition = {
    id: 'key_strength',
    title: 'Key type and size are accepted by browsers',
    citation: 'BR §6.1.5; Apple; Chrome',
    profiles: ['public', 'private'],
    run: cert => {
        const { algorithm, rsaModulusBits, ecCurveOid } = cert.publicKey;
        if (algorithm.oid === OID_RSA_ENCRYPTION) {
            const bits = rsaModulusBits ?? 0;
            return bits < MIN_RSA_BITS ? issue('error', `RSA key is ${bits} bits; at least ${MIN_RSA_BITS} bits are required.`) : PASS;
        }
        if (algorithm.oid === OID_EC_PUBLIC_KEY) {
            return ecCurveOid !== undefined && lookup(SUPPORTED_CURVES, ecCurveOid)
                ? PASS
                : issue('error', `ECDSA curve ${ecCurveOid ?? '(not a named curve)'} is not supported; use P-256, P-384 or P-521.`);
        }
        if (algorithm.oid === OID_ED25519) {
            return issue('warn', 'Ed25519 keys are not accepted by browsers; only non-browser clients can use this certificate.');
        }
        return issue('error', `Public key algorithm ${algorithm.oid} is not supported for TLS server certificates.`);
    },
};

export const weakSignature: CheckDefinition = {
    id: 'weak_signature',
    title: 'Not signed with SHA-1 or MD5',
    citation: 'BR §7.1.3.2; Apple; Chrome',
    profiles: ['public', 'private'],
    run: cert => {
        const weak = lookup(WEAK_SIGNATURES, cert.signatureAlgorithm.oid);
        return weak ? issue('error', `Signed with ${weak}, which browsers and operating systems reject.`) : PASS;
    },
};

export const brPublicKeyAlgorithm: CheckDefinition = {
    id: 'br_public_key_algorithm',
    title: 'Public key is RSA or ECDSA P-256/P-384/P-521',
    citation: 'BR §6.1.5, §7.1.3.1',
    profiles: ['public'],
    run: cert => {
        const { algorithm, rsaModulusBits } = cert.publicKey;
        const name = lookup(BR_KEY_ALGORITHMS, algorithm.derHex);
        if (!name) return issue('error', `Public key algorithm ${algorithm.oid} (or its encoding) is not permitted.`);
        if (name === 'RSA' && (rsaModulusBits ?? 0) % 8 !== 0) {
            return issue('error', `RSA modulus is ${rsaModulusBits} bits; it MUST be divisible by 8.`);
        }
        return PASS;
    },
};

export const brSignatureAlgorithm: CheckDefinition = {
    id: 'br_signature_algorithm',
    title: 'Signature algorithm is permitted by the BR',
    citation: 'BR §7.1.3.2',
    profiles: ['public'],
    run: cert => {
        if (!cert.signatureAlgorithmsMatch) {
            return issue('error', 'tbsCertificate.signature differs from signatureAlgorithm; they MUST be byte-for-byte identical.');
        }
        const { oid, derHex } = cert.signatureAlgorithm;
        return lookup(BR_SIGNATURE_ALGORITHMS, derHex) ? PASS : issue('error', `Signature algorithm ${oid} (or its encoding) is not permitted.`);
    },
};
