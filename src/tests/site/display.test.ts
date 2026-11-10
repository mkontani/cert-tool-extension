import { describe, it, expect } from 'vitest';
import { findPemBlocks } from '../../inspector/pem';
import { chainRole, chainToPem, describeConnection } from '../../site/display';
import { SITE_CHAIN } from '../siteFixtures';

describe('chainRole', () => {
    it('calls the first certificate the leaf, even when it is self-signed', () => {
        expect(chainRole(0, 3, false)).toBe('Leaf');
        expect(chainRole(0, 1, true)).toBe('Leaf');
    });

    it('calls the last certificate the root when it issued itself', () => {
        expect(chainRole(2, 3, true)).toBe('Root');
    });

    it('calls everything else an intermediate, including a self-issued one mid-chain or a last one that is not self-issued', () => {
        expect(chainRole(1, 3, false)).toBe('Intermediate');
        expect(chainRole(1, 3, true)).toBe('Intermediate');
        expect(chainRole(1, 2, false)).toBe('Intermediate');
    });
});

describe('chainToPem', () => {
    it('writes one CERTIFICATE block per certificate, with 64-character lines', () => {
        const pem = chainToPem(SITE_CHAIN);
        expect(pem.match(/-----BEGIN CERTIFICATE-----/g)).toHaveLength(3);
        expect(pem.split('\n').every(line => line.length <= 64)).toBe(true);
        expect(pem.endsWith('-----END CERTIFICATE-----\n')).toBe(true);
    });

    it('round-trips through the PEM reader the Inspector uses', () => {
        const { blocks } = findPemBlocks(chainToPem(SITE_CHAIN));
        const der = blocks.map(block => ('der' in block ? btoa(String.fromCharCode(...block.der)) : block.error));
        expect(der).toEqual([...SITE_CHAIN]);
    });
});

describe('describeConnection', () => {
    it('names the protocol, key exchange group and cipher of a TLS 1.3 connection', () => {
        expect(describeConnection({ protocol: 'TLS 1.3', keyExchange: '', keyExchangeGroup: 'X25519MLKEM768', cipher: 'AES_128_GCM' }))
            .toBe('TLS 1.3 · X25519MLKEM768 · AES_128_GCM');
    });

    it('names the key exchange, its group and the MAC of an older connection', () => {
        expect(describeConnection({ protocol: 'TLS 1.2', keyExchange: 'ECDHE_RSA', keyExchangeGroup: 'X25519', cipher: 'AES_256_CBC', mac: 'HMAC-SHA1' }))
            .toBe('TLS 1.2 · ECDHE_RSA with X25519 · AES_256_CBC with HMAC-SHA1');
    });

    it('skips parts Chrome left empty', () => {
        expect(describeConnection({ protocol: 'QUIC', keyExchange: '', cipher: 'AES_128_GCM' })).toBe('QUIC · AES_128_GCM');
    });
});
