import { describe, it, expect } from 'vitest';
import { ecdsaSignatureToDer } from '../../keys/signing';

const bytes = (...parts: (number | number[])[]) => Uint8Array.from(parts.flat());

describe('ecdsaSignatureToDer', () => {
    it('drops the leading zeros of r and adds one before an s whose high bit is set', () => {
        const raw = bytes(new Array(31).fill(0), 0x01, new Array(32).fill(0xff));
        expect(ecdsaSignatureToDer(raw)).toEqual(bytes(0x30, 0x26, 0x02, 0x01, 0x01, 0x02, 0x21, 0x00, new Array(32).fill(0xff)));
    });

    it('encodes a zero integer as one zero byte', () => {
        expect(ecdsaSignatureToDer(bytes(0, 0, 0x7f, 0x00))).toEqual(bytes(0x30, 0x07, 0x02, 0x01, 0x00, 0x02, 0x02, 0x7f, 0x00));
    });

    it('uses the long length form for a P-521 signature', () => {
        const der = ecdsaSignatureToDer(bytes(0x01, new Array(65).fill(0xaa), 0x01, new Array(65).fill(0xbb)));
        expect(Array.from(der.slice(0, 5))).toEqual([0x30, 0x81, 0x88, 0x02, 0x42]);
    });
});
