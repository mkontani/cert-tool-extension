import { describe, it, expect } from 'vitest';
import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { Extension } from '@peculiar/asn1-x509';
import { describePublicKey } from '../../inspector/algorithms';
import { describeExtension } from '../../inspector/extensions';
import { describeName } from '../../inspector/format';

const extension = (extnID: string, value: number[]) =>
    new Uint8Array(AsnConvert.serialize(new Extension({ extnID, critical: false, extnValue: new OctetString(new Uint8Array(value)) })));

/** SignedCertificateTimestampList holding one v1 SCT with the given 8-byte timestamp. */
function sctList(timestamp: number[]): number[] {
    const sct = [0x00, ...new Array(32).fill(0), ...timestamp, 0x00, 0x00, 0x04, 0x03, 0x00, 0x00];
    const list = [0x00, sct.length, ...sct];
    return [0x04, list.length + 2, 0x00, list.length, ...list];
}

describe('fields that cannot be decoded', () => {
    it('shows an undecodable name as hex instead of failing', () => {
        // commonName as a BMPString with an odd number of bytes
        const name = [0x30, 0x0e, 0x31, 0x0c, 0x30, 0x0a, 0x06, 0x03, 0x55, 0x04, 0x03, 0x1e, 0x03, 0x00, 0x41, 0x00];
        expect(describeName(new Uint8Array(name))).toBe('(Undecodable) (Hex) 30:0E:31:0C:30:0A:06:03:55:04:03:1E:03:00:41:00');
    });

    it('shows an undecodable public key as hex instead of failing', () => {
        expect(describePublicKey(new Uint8Array([0x30, 0x00]))).toBe('(Undecodable) (Hex) 30:00');
    });

    it('shows an extension whose wrapper cannot be decoded as hex', () => {
        expect(describeExtension(new Uint8Array([0x30, 0x03, 0x01, 0x01, 0xff]))).toEqual({
            name: '(undecodable extension)',
            critical: false,
            value: '(Undecodable) (Hex) 30:03:01:01:FF',
        });
    });

    it('marks a known extension whose value cannot be decoded', () => {
        expect(describeExtension(extension('2.5.29.35', [1, 2, 3])).value).toBe('(Undecodable) (Hex) 01:02:03');
    });

    it('rejects an empty SCT', () => {
        const value = [0x04, 0x04, 0x00, 0x02, 0x00, 0x00];
        expect(describeExtension(extension('1.3.6.1.4.1.11129.2.4.2', value)).value).toBe('(Undecodable) (Hex) 04:04:00:02:00:00');
    });

    it('rejects an SCT too short for its extensions and signature', () => {
        const sct = [0x00, ...new Array(32).fill(0), ...new Array(8).fill(0)];
        const value = [0x04, sct.length + 4, 0x00, sct.length + 2, 0x00, sct.length, ...sct];
        expect(describeExtension(extension('1.3.6.1.4.1.11129.2.4.2', value)).value).toMatch(/^\(Undecodable\) /);
    });

    it('prints an SCT timestamp outside the Date range as milliseconds', () => {
        const value = sctList(new Array(8).fill(0xff));
        expect(describeExtension(extension('1.3.6.1.4.1.11129.2.4.2', value)).entries).toEqual([
            { type: 'SCT', value: 'timestamp 18446744073709551615 ms · log AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
        ]);
    });

    it('marks an empty TLS feature list', () => {
        expect(describeExtension(extension('1.3.6.1.5.5.7.1.24', [0x30, 0x00])).value).toBe('(empty)');
    });

    it('rejects a negative or oversized TLS feature', () => {
        expect(describeExtension(extension('1.3.6.1.5.5.7.1.24', [0x30, 0x03, 0x02, 0x01, 0xff])).value).toMatch(/^\(Undecodable\) /);
        const big = [0x30, 0x05, 0x02, 0x03, 0x01, 0x00, 0x05];
        expect(describeExtension(extension('1.3.6.1.5.5.7.1.24', big)).value).toMatch(/^\(Undecodable\) /);
    });
});
