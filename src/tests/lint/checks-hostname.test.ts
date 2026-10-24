import { describe, it, expect } from 'vitest';
import { hostnameMatch, dnsNameSyntax } from '../../lint/checks/hostname';
import { makeCert, makeEnv, makeSan } from './certFactory';

const runHost = (hostname: string | undefined, san = makeSan(['www.example.com', 'example.com'])) =>
    hostnameMatch.run(makeCert({ extensions: { subjectAltName: san } }), makeEnv({ hostname }));

describe('hostnameMatch', () => {
    it.each([undefined, '', '   '])('is not applicable without a hostname (%j)', hostname => {
        expect(runHost(hostname).status).toBe('na');
    });

    it.each(['www.example.com', 'WWW.Example.COM', 'example.com.', 'https://www.example.com:8443/path'])(
        'matches %s against an exact SAN entry',
        hostname => {
            expect(runHost(hostname).status).toBe('pass');
        },
    );

    it('is an error when no SAN entry covers the hostname', () => {
        expect(runHost('api.example.com')).toMatchObject({ status: 'issue', severity: 'error' });
    });

    describe('wildcards cover exactly one leftmost label', () => {
        const san = makeSan(['*.example.org']);
        it('matches a single label', () => {
            expect(runHost('a.example.org', san).status).toBe('pass');
        });
        it.each(['example.org', 'a.b.example.org'])('does not match %s', hostname => {
            expect(runHost(hostname, san)).toMatchObject({ status: 'issue', severity: 'error' });
        });
    });

    describe('IP addresses', () => {
        const san = makeSan(['www.example.com'], ['192.0.2.10', '2001:db8::1']);
        it.each(['192.0.2.10', '2001:DB8:0::1', '[2001:db8::1]'])('matches %s by address', hostname => {
            expect(runHost(hostname, san).status).toBe('pass');
        });
        it('is an error for an address not in the SAN', () => {
            expect(runHost('192.0.2.11', san)).toMatchObject({ status: 'issue', severity: 'error' });
        });
    });

    it('matches an internationalized hostname against its A-label', () => {
        expect(runHost('bücher.example', makeSan(['xn--bcher-kva.example'])).status).toBe('pass');
    });

    it('is an error when the certificate has no SAN (the CN is ignored by clients)', () => {
        expect(runHost('www.example.com', null)).toMatchObject({ status: 'issue', severity: 'error' });
    });

    it('is an error for input that is not a hostname', () => {
        expect(runHost('exa mple')).toMatchObject({ status: 'issue', severity: 'error' });
    });

    it('rejects a wildcard as input even when the SAN has the same wildcard', () => {
        expect(runHost('*.example.com', makeSan(['*.example.com']))).toMatchObject({ status: 'issue', severity: 'error' });
    });

    it('matches shorthand IPv4 input against an IP SAN', () => {
        expect(runHost('127.1', makeSan([], ['127.0.0.1'])).status).toBe('pass');
    });

    it('does not treat a SAN entry with a trailing dot as matching', () => {
        expect(runHost('example.com', makeSan(['example.com.']))).toMatchObject({ status: 'issue', severity: 'error' });
    });
});

describe('dnsNameSyntax', () => {
    const run = (dnsNames: string[]) =>
        dnsNameSyntax.run(makeCert({ extensions: { subjectAltName: makeSan(dnsNames) } }), makeEnv());

    it.each([[['www.example.com']], [['*.example.com', 'example.com']]])('passes %j', names => {
        expect(run(names).status).toBe('pass');
    });

    it.each([
        'foo*.example.com',
        '*foo.example.com',
        'www.*.example.com',
        '*.*.example.com',
        '*.com',
        '*',
        '*.example..com',
        'a..example.com',
        'example.com.',
        'exa mple.com',
    ])('is an error for %s', name => {
        expect(run([name])).toMatchObject({ status: 'issue', severity: 'error' });
    });

    it('warns for an underscore, which many clients tolerate', () => {
        expect(run(['_x.example.com'])).toMatchObject({ status: 'issue', severity: 'warn' });
    });

    it('is not applicable without a SAN', () => {
        expect(dnsNameSyntax.run(makeCert({ extensions: { subjectAltName: null } }), makeEnv()).status).toBe('na');
    });
});
