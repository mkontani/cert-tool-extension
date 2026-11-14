import { describe, it, expect } from 'vitest';
import { inspect } from '../../inspector/inspect';
import { findPemBlocks } from '../../inspector/pem';
import { INTERMEDIATE_B64 } from '../siteFixtures';
import { SAN_CSR } from '../inspectorFixtures';

const der = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

describe('inspect', () => {
    it("names a certificate's issuer by its common name", () => {
        const result = inspect(der(INTERMEDIATE_B64), 'certificate');
        expect(result.issuer).toBe('organizationName=Example Trust, commonName=Example Root CA');
        expect(result.issuerLabel).toBe('Example Root CA');
    });

    it('gives a CSR no issuer', () => {
        const [block] = findPemBlocks(SAN_CSR).blocks;
        if ('error' in block) throw new Error(block.error);
        const result = inspect(block.der, block.kind);
        expect(result.issuer).toBeUndefined();
        expect(result.issuerLabel).toBeUndefined();
    });
});
