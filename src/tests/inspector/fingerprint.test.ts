import { describe, it, expect } from 'vitest';
import { fingerprintsOf, spkiPinOf } from '../../inspector/fingerprint';

const ABC = new TextEncoder().encode('abc');

describe('fingerprintsOf', () => {
    it('hashes the bytes with SHA-256 and SHA-1, written as colon-separated uppercase hex (FIPS 180-4 test vectors)', () => {
        expect(fingerprintsOf(ABC)).toEqual({
            sha256: 'BA:78:16:BF:8F:01:CF:EA:41:41:40:DE:5D:AE:22:23:B0:03:61:A3:96:17:7A:9C:B4:10:FF:61:F2:00:15:AD',
            sha1: 'A9:99:3E:36:47:06:81:6A:BA:3E:25:71:78:50:C2:6C:9C:D0:D8:9D',
        });
    });
});

describe('spkiPinOf', () => {
    it('gives the SHA-256 in base64, the form of pin-sha256', () => {
        expect(spkiPinOf(ABC)).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
    });
});
