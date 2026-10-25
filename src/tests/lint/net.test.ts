import { describe, it, expect } from 'vitest';
import {
    parseIp,
    formatIp,
    isReservedIp,
    isInternalName,
    isReverseZoneName,
    dnsNameSyntaxError,
    hasReservedLdhLabel,
} from '../../lint/net';

const v6 = (...groups: number[]) => new Uint8Array(groups.flatMap(g => [g >> 8, g & 0xff]));

describe('parseIp', () => {
    it.each([
        ['192.0.2.1', [192, 0, 2, 1]],
        ['0.0.0.0', [0, 0, 0, 0]],
    ])('parses IPv4 %s', (text, bytes) => {
        expect(parseIp(text)).toEqual(new Uint8Array(bytes));
    });

    it.each([
        ['2001:db8::1', v6(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1)],
        ['::', v6(0, 0, 0, 0, 0, 0, 0, 0)],
        ['::1', v6(0, 0, 0, 0, 0, 0, 0, 1)],
        ['FE80::A:B', v6(0xfe80, 0, 0, 0, 0, 0, 0xa, 0xb)],
        ['::ffff:192.0.2.1', v6(0, 0, 0, 0, 0, 0xffff, 0xc000, 0x0201)],
        ['1:2:3:4:5:6:7:8', v6(1, 2, 3, 4, 5, 6, 7, 8)],
    ])('parses IPv6 %s', (text, bytes) => {
        expect(parseIp(text)).toEqual(bytes);
    });

    it.each(['example.com', '256.1.1.1', '1.2.3', '01.2.3.4', '1::2::3', '1:2:3:4:5:6:7:8:9', '12345::', ''])(
        'rejects %j',
        text => {
            expect(parseIp(text)).toBeNull();
        },
    );
});

describe('formatIp (RFC 5952)', () => {
    it.each([
        [new Uint8Array([10, 0, 0, 5]), '10.0.0.5'],
        [v6(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1), '2001:db8::1'],
        [v6(0x2001, 0xdb8, 0, 1, 1, 1, 1, 1), '2001:db8:0:1:1:1:1:1'],
        [v6(0x2001, 0, 0, 1, 0, 0, 0, 1), '2001:0:0:1::1'],
        [v6(0x2001, 0xdb8, 0, 0, 1, 0, 0, 1), '2001:db8::1:0:0:1'],
        [v6(0, 0, 0, 0, 0, 0, 0, 0), '::'],
        [v6(0xfe80, 0, 0, 0, 0, 0, 0, 0), 'fe80::'],
    ])('formats %s as %s', (bytes, text) => {
        expect(formatIp(bytes)).toBe(text);
    });
});

describe('isReservedIp', () => {
    it.each([
        '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '127.0.0.1',
        '169.254.1.1', '192.0.2.1', '198.51.100.7', '203.0.113.9', '240.0.0.1', '255.255.255.255',
        '::1', '::', 'fe80::1', 'fd00::1', '2001:db8::1', '2001:1ff::1', '::ffff:8.8.8.8',
    ])('%s is reserved', ip => {
        expect(isReservedIp(parseIp(ip)!)).toBe(true);
    });

    it.each(['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700::1111', '2001:4860:4860::8888', '2001:200::1'])(
        '%s is public',
        ip => {
            expect(isReservedIp(parseIp(ip)!)).toBe(false);
        },
    );
});

describe('isInternalName', () => {
    it.each(['localhost', 'app.corp', 'printer.local', 'host.internal', 'nas.lan', '*.internal.example'])(
        '%s is internal',
        name => {
            expect(isInternalName(name)).toBe(true);
        },
    );

    it.each(['www.example.com', '*.example.com', 'example.co.jp', 'EXAMPLE.COM', 'xn--n3h.xn--p1ai'])(
        '%s is not internal',
        name => {
            expect(isInternalName(name)).toBe(false);
        },
    );
});

describe('isReverseZoneName', () => {
    it.each(['1.2.0.192.in-addr.arpa', 'in-addr.arpa', 'x.ip6.arpa', 'X.IP6.ARPA'])('%s is a reverse zone name', name => {
        expect(isReverseZoneName(name)).toBe(true);
    });

    it.each(['home.arpa', 'example.com', 'in-addr.arpa.example.com'])('%s is not', name => {
        expect(isReverseZoneName(name)).toBe(false);
    });
});

describe('dnsNameSyntaxError', () => {
    it.each(['www.example.com', '*.example.com', 'xn--bcher-kva.example', 'a-b.example.com', 'EXAMPLE.com', '_dmarc.example.com', '1.2.3.4'])(
        'accepts %s',
        name => {
            expect(dnsNameSyntaxError(name)).toBeNull();
        },
    );

    it.each([
        ['an empty label', 'a..example.com'],
        ['a trailing dot', 'example.com.'],
        ['a leading hyphen', '-a.example.com'],
        ['a trailing hyphen', 'a-.example.com'],
        ['a space', 'exa mple.com'],
        ['a non-ASCII character', 'bücher.example'],
        ['a 64-character label', `${'a'.repeat(64)}.example.com`],
        ['more than 253 characters', `${'a'.repeat(60)}.`.repeat(4) + 'example.com'],
        ['an empty name', ''],
        ['a bare wildcard label', '*.'],
    ])('rejects %s', (_label, name) => {
        expect(dnsNameSyntaxError(name)).not.toBeNull();
    });
});

describe('hasReservedLdhLabel', () => {
    it('flags labels with "--" in positions 3-4 other than xn--', () => {
        expect(hasReservedLdhLabel('ab--cd.example.com')).toBe(true);
    });

    it.each(['xn--bcher-kva.example', 'a--b.example.com', 'www.example.com'])('accepts %s', name => {
        expect(hasReservedLdhLabel(name)).toBe(false);
    });
});
