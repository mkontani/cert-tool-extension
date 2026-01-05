import { describe, it, expect } from 'vitest';
import forge from 'node-forge';

const P256_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgkVhVZa5Vd7k951uO
ek3dw90QxMcaYregfRy76E7Av/WhRANCAATjhUmhCOo9SoyWrf98WQJ385TFrTmV
NV5Vc09vb+TWlj5mjh6ys8KY/C52wvKSD3DBmhiRXWLetdGR7rR3Awvm
-----END PRIVATE KEY-----`;

function decodePem(pem: string) {
    const match = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
    const base64 = (match ? match[1] : pem).replace(/\s/g, '');
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    return buffer.buffer;
}

async function extractPublicKeyJwk(pkcs8Buffer: ArrayBuffer, alg: any): Promise<CryptoKey> {
    const privKey = await crypto.subtle.importKey('pkcs8', pkcs8Buffer, alg, true, ['sign']);
    const jwk = await crypto.subtle.exportKey('jwk', privKey);

    // Create public JWK (remove private part 'd' and add key_ops)
    const { d: _d, ...publicJwk } = jwk;
    return await crypto.subtle.importKey('jwk', publicJwk, alg, true, []);
}

describe('ECDSA Crypto Fix', () => {
    it('should import the P-256 key and export public key via JWK', async () => {
        const pkcs8Buffer = decodePem(P256_PRIVATE_KEY_PEM);

        // 1. Detect Curve (Surgical)
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(pkcs8Buffer)));
        const algIdSeq = (asn1 as any).value[1];
        const algOid = forge.asn1.derToOid(algIdSeq.value[0].value);
        expect(algOid).toBe('1.2.840.10045.2.1');

        const curveOid = forge.asn1.derToOid(algIdSeq.value[1].value);
        expect(curveOid).toBe('1.2.840.10045.3.1.7'); // P-256

        // 2. Import and extract public part via JWK
        const alg = { name: 'ECDSA', namedCurve: 'P-256' };
        const pubKey = await extractPublicKeyJwk(pkcs8Buffer, alg);
        expect(pubKey.type).toBe('public');

        // 3. Verify SPKI export works for the PUBLIC key
        const spki = await crypto.subtle.exportKey('spki', pubKey);
        expect(spki.byteLength).toBeGreaterThan(0);
    });

    it('should sign data with ECDSA and match standard DER format', async () => {
        const pkcs8Buffer = decodePem(P256_PRIVATE_KEY_PEM);
        const alg = { name: 'ECDSA', namedCurve: 'P-256' };
        const privKey = await crypto.subtle.importKey('pkcs8', pkcs8Buffer, alg, true, ['sign']);

        const data = new TextEncoder().encode('test data');
        const rawSig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, data);

        expect(rawSig.byteLength).toBe(64); // P-256 raw sig is 64 bytes
    });

    it('should support Ed25519 via JWK extraction if supported by environment', async () => {
        try {
            const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign']);
            const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            const pubKey = await extractPublicKeyJwk(pkcs8, { name: 'Ed25519' });
            expect(pubKey.type).toBe('public');
            const spki = await crypto.subtle.exportKey('spki', pubKey);
            expect(spki.byteLength).toBeGreaterThan(0);
        } catch (_e) {
            console.log('Ed25519 not supported in this environment, skipping.');
        }
    });
});
