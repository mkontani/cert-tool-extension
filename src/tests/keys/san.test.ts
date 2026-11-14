import { describe, it, expect } from 'vitest';
import { parseSans } from '../../keys/san';

describe('parseSans', () => {
    it('sorts each name into DNS, IP, email or URI', () => {
        const sans = parseSans('www.example.com, *.example.com, 192.0.2.10, 2001:db8::1, admin@example.com, https://example.com/id');
        expect(sans.map(({ kind, value }) => [kind, value])).toEqual([
            ['dns', 'www.example.com'],
            ['dns', '*.example.com'],
            ['ip', '192.0.2.10'],
            ['ip', '2001:db8::1'],
            ['email', 'admin@example.com'],
            ['uri', 'https://example.com/id'],
        ]);
    });

    it('accepts names separated by commas, spaces or new lines, and skips empty ones', () => {
        expect(parseSans(' a.example,,b.example\nc.example  d.example ,').map(san => san.value)).toEqual(['a.example', 'b.example', 'c.example', 'd.example']);
        expect(parseSans('  ')).toEqual([]);
    });

    it('keeps the bytes of an IP address', () => {
        const [v4, v6] = parseSans('10.0.0.1 ::1');
        expect(v4).toMatchObject({ kind: 'ip', bytes: Uint8Array.from([10, 0, 0, 1]) });
        expect(v6).toMatchObject({ kind: 'ip', bytes: Uint8Array.from([...new Array(15).fill(0), 1]) });
    });

    it.each(['1.2.3', '10.0', '256.0.0.1', '2001:db8::12345', 'fe80::1::2'])('refuses %s, which looks like an IP address but is not one', value => {
        expect(() => parseSans(`ok.example, ${value}`)).toThrow(`"${value}" is not a valid IP address.`);
    });

    it('accepts IPv4-mapped IPv6 addresses, plus signs in email addresses and underscores in DNS names', () => {
        expect(parseSans('::ffff:192.0.2.1 ops+tls@example.com _acme-challenge.example.com').map(san => san.kind)).toEqual(['ip', 'email', 'dns']);
    });

    it.each(['mailto:ops@example.com', '<ops@example.com>', 'ops@@example.com'])('refuses %s as an email address', value => {
        expect(() => parseSans(value)).toThrow(`"${value}" is not a valid email address.`);
    });

    it.each([
        ['a trailing dot', 'example.com.'],
        ['a label that starts with a hyphen', '-a.example'],
        ['a label that ends with a hyphen', 'a-.example'],
        ['a label over 63 characters', `${'x'.repeat(64)}.example`],
        ['over 253 characters in all', `${'abcdefghi.'.repeat(25)}example`],
        ['a wildcard that is not a whole leftmost label', 'a*.example'],
    ])('refuses a DNS name with %s', (_, value) => {
        expect(() => parseSans(value)).toThrow(`"${value}" is not a valid DNS name.`);
    });

    it('refuses a name with a port or other characters a DNS name cannot have', () => {
        expect(() => parseSans('host.example:8443')).toThrow('"host.example:8443" is not a valid DNS name or IP address.');
        expect(() => parseSans('bad/name.example')).toThrow('"bad/name.example" is not a valid DNS name.');
    });

    it('asks for punycode instead of non-ASCII names', () => {
        expect(() => parseSans('bücher.example')).toThrow('"bücher.example" is not ASCII. Write internationalized domain names in punycode (xn--…).');
    });
});
