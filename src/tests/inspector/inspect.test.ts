import { describe, it, expect } from 'vitest';
import { inspect } from '../../inspector/inspect';
import { findPemBlocks } from '../../inspector/pem';
import { INTERMEDIATE_B64, LEAF_B64 } from '../siteFixtures';
import { SAN_CSR } from '../inspectorFixtures';

const der = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

describe('inspect', () => {
    it("names a certificate's issuer by its common name", () => {
        const result = inspect(der(INTERMEDIATE_B64), 'certificate');
        expect(result.issuer).toBe('organizationName=Example Trust, commonName=Example Root CA');
        expect(result.issuerLabel).toBe('Example Root CA');
    });

    it('fingerprints a certificate and pins its public key, as openssl computes them', () => {
        // openssl x509 -fingerprint -sha256 / -sha1, and: openssl x509 -pubkey | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
        const result = inspect(der(LEAF_B64), 'certificate');
        expect(result.fingerprints).toEqual({
            sha256: '22:69:40:02:2E:EE:18:D0:F3:7A:08:A4:43:A0:B0:EB:C6:D2:04:0A:CA:86:54:31:47:6B:4C:65:8C:7F:BE:FF',
            sha1: 'A0:03:C5:E3:C4:3C:E2:17:AB:5F:0F:E3:25:6D:38:34:59:6C:3E:F1',
        });
        expect(result.spkiSha256).toBe('R5gLengN8aXPU7JH3bjlDONl7osb9k5lJS/jhcKlIKc=');
    });

    it('pins the public key of a CSR, but gives the request itself no fingerprint', () => {
        const [block] = findPemBlocks(SAN_CSR).blocks;
        if ('error' in block) throw new Error(block.error);
        const result = inspect(block.der, block.kind);
        expect(result.spkiSha256).toBe('EphrIUlLEca9SaxtiMp8/vw2x4tgr14pbRQG6vFKheQ=');
        expect(result.fingerprints).toBeUndefined();
    });

    it('gives a CSR no issuer', () => {
        const [block] = findPemBlocks(SAN_CSR).blocks;
        if ('error' in block) throw new Error(block.error);
        const result = inspect(block.der, block.kind);
        expect(result.issuer).toBeUndefined();
        expect(result.issuerLabel).toBeUndefined();
    });
});
