import { describe, it, expect } from 'vitest';
import * as asn1js from 'asn1js';
import { createCsr, type CsrSubject } from '../../keys/csr';
import { inspect } from '../../inspector/inspect';
import { findPemBlocks } from '../../inspector/pem';
import { EC_SEC1, ED25519_PKCS8, P384_PKCS8, P521_PKCS8, RSA_PKCS1, RSA_PKCS8 } from '../keyFixtures';

const SUBJECT: CsrSubject = {
    commonName: 'app.example', organization: 'Example Corp', organizationalUnit: '', country: 'JP', state: '', locality: '', email: '',
};

const SANS = 'app.example, www.app.example, 192.0.2.10, 2001:db8::1';

function csrDer(pem: string): Uint8Array {
    const [block] = findPemBlocks(pem).blocks;
    if (!block || 'error' in block || block.kind !== 'csr') throw new Error('not a CSR');
    return block.der;
}

/** Converts an ECDSA signature from DER to the r || s form WebCrypto verifies. */
function ecdsaRaw(der: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
    const seq = asn1js.fromBER(der).result as asn1js.Sequence;
    const out = new Uint8Array(size * 2);
    seq.valueBlock.value.forEach((part, i) => {
        const bytes = (part as asn1js.Integer).valueBlock.valueHexView;
        const trimmed = bytes[0] === 0 ? bytes.slice(1) : bytes;
        out.set(trimmed, size * (i + 1) - trimmed.length);
    });
    return out;
}

const VERIFY: Record<string, { readonly key: RsaHashedImportParams | EcKeyImportParams | Algorithm; readonly verify: Algorithm | EcdsaParams; readonly size?: number }> = {
    '1.2.840.113549.1.1.11': { key: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
    '1.2.840.10045.4.3.2': { key: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } as EcdsaParams, size: 32 },
    '1.2.840.10045.4.3.3': { key: { name: 'ECDSA', namedCurve: 'P-384' }, verify: { name: 'ECDSA', hash: 'SHA-384' } as EcdsaParams, size: 48 },
    '1.2.840.10045.4.3.4': { key: { name: 'ECDSA', namedCurve: 'P-521' }, verify: { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams, size: 66 },
    '1.3.101.112': { key: { name: 'Ed25519' }, verify: { name: 'Ed25519' } },
};

/** Checks the CSR's signature with the public key in the CSR itself, as a CA does. */
async function verifyCsr(der: Uint8Array): Promise<boolean> {
    const csr = asn1js.fromBER(der).result as asn1js.Sequence;
    const [cri, algorithm, signature] = csr.valueBlock.value as [asn1js.Sequence, asn1js.Sequence, asn1js.BitString];
    const oid = (algorithm.valueBlock.value[0] as asn1js.ObjectIdentifier).valueBlock.toString();
    const scheme = VERIFY[oid];
    const spki = new Uint8Array(cri.valueBlock.value[2].valueBeforeDecodeView);
    const key = await crypto.subtle.importKey('spki', spki, scheme.key, false, ['verify']);
    const sig = new Uint8Array(signature.valueBlock.valueHexView);
    return crypto.subtle.verify(scheme.verify, key, scheme.size ? ecdsaRaw(sig, scheme.size) : sig, new Uint8Array(cri.valueBeforeDecodeView));
}

describe('createCsr', () => {
    it.each([
        ['a PKCS#8 RSA key', RSA_PKCS8, 'sha256WithRSAEncryption', 'RSA (2048 bits)'],
        ['a PKCS#1 RSA key', RSA_PKCS1, 'sha256WithRSAEncryption', 'RSA (2048 bits)'],
        ['a SEC1 P-256 key', EC_SEC1, 'ecdsa-with-sha256', 'ECDSA (P-256)'],
        ['a P-384 key', P384_PKCS8, 'ecdsa-with-sha384', 'ECDSA (P-384)'],
        ['a P-521 key', P521_PKCS8, 'ecdsa-with-sha512', 'ECDSA (P-521)'],
        ['an Ed25519 key', ED25519_PKCS8, 'Ed25519', 'Ed25519'],
    ])('signs a CSR with %s, requesting its SANs', async (_, privateKey, signatureAlgo, pubKeyAlgo) => {
        const pem = await createCsr({ subject: SUBJECT, sans: SANS, privateKey });
        expect(pem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE REQUEST-----\n$/);
        const der = csrDer(pem);
        const result = inspect(der, 'csr');
        expect(result.subject).toBe('commonName=app.example, organizationName=Example Corp, countryName=JP');
        expect(result.signatureAlgo).toBe(signatureAlgo);
        expect(result.pubKeyAlgo).toBe(pubKeyAlgo);
        expect(result.extensions).toHaveLength(1);
        expect(result.extensions[0].name).toBe('subjectAltName');
        expect(result.extensions[0].entries).toEqual([
            { type: 'DNS', value: 'app.example' },
            { type: 'DNS', value: 'www.app.example' },
            { type: 'IP', value: '192.0.2.10' },
            { type: 'IP', value: '2001:db8::1' },
        ]);
        expect(await verifyCsr(der)).toBe(true);
    });

    it('requests no extensions when no SANs are given', async () => {
        const der = csrDer(await createCsr({ subject: SUBJECT, sans: '', privateKey: EC_SEC1 }));
        expect(inspect(der, 'csr').extensions).toEqual([]);
        expect(await verifyCsr(der)).toBe(true);
    });

    it('puts the email address in the subject', async () => {
        const der = csrDer(await createCsr({ subject: { ...SUBJECT, email: 'admin@app.example' }, sans: '', privateKey: ED25519_PKCS8 }));
        expect(inspect(der, 'csr').subject).toBe('commonName=app.example, organizationName=Example Corp, countryName=JP, emailAddress=admin@app.example');
    });

    it('writes non-ASCII and emoji subject values as UTF-8', async () => {
        const der = csrDer(await createCsr({ subject: { ...SUBJECT, organization: '株式会社テスト 🔐' }, sans: '', privateKey: EC_SEC1 }));
        expect(inspect(der, 'csr').subject).toBe('commonName=app.example, organizationName=株式会社テスト 🔐, countryName=JP');
    });

    it.each([
        ['a broken character', { organization: 'Example \ud800' }, 'Organization contains a broken character.'],
        ['a control character', { commonName: 'app\nexample' }, 'Common Name must not contain control characters.'],
        ['more than RFC 5280 allows', { commonName: 'a'.repeat(65) }, 'Common Name must be at most 64 characters.'],
        ['more than RFC 5280 allows', { locality: 'l'.repeat(129) }, 'Locality must be at most 128 characters.'],
        ['an invalid email address', { email: 'admin at app.example' }, 'Email must be a valid email address.'],
    ])('refuses a subject value with %s', async (_, change, message) => {
        await expect(createCsr({ subject: { ...SUBJECT, ...change }, sans: '', privateKey: EC_SEC1 })).rejects.toThrow(message);
    });

    it('refuses a country that is not a two-letter code', async () => {
        await expect(createCsr({ subject: { ...SUBJECT, country: 'J1' }, sans: '', privateKey: EC_SEC1 }))
            .rejects.toThrow('Country must be a two-letter code, such as US or JP.');
    });

    it('refuses an invalid SAN before using the key', async () => {
        await expect(createCsr({ subject: SUBJECT, sans: '1.2.3', privateKey: 'not a key' })).rejects.toThrow('"1.2.3" is not a valid IP address.');
    });
});
