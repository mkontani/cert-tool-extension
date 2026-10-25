import { describe, it, expect } from 'vitest';
import { sanPresent, sanPublicNames, sanCriticality, cnInSan } from '../../lint/checks/names';
import { makeCert, makeEnv, makeSan } from './certFactory';
import type { CertContext } from '../../lint/types';

const expectError = (outcome: ReturnType<typeof sanPresent.run>) =>
    expect(outcome).toMatchObject({ status: 'issue', severity: 'error' });

describe('sanPresent', () => {
    it('passes with DNS names', () => {
        expect(sanPresent.run(makeCert(), makeEnv()).status).toBe('pass');
    });

    it('passes with only IP addresses', () => {
        const cert = makeCert({ extensions: { subjectAltName: makeSan([], ['192.0.2.1']) } });
        expect(sanPresent.run(cert, makeEnv()).status).toBe('pass');
    });

    it('is an error without a SAN extension', () => {
        expectError(sanPresent.run(makeCert({ extensions: { subjectAltName: null } }), makeEnv()));
    });

    it('is an error when the SAN has neither DNS names nor IPs', () => {
        const san = { critical: false, dnsNames: [], ipAddresses: [], otherNameTypes: ['rfc822Name'] };
        expectError(sanPresent.run(makeCert({ extensions: { subjectAltName: san } }), makeEnv()));
    });
});

describe('sanPublicNames', () => {
    const run = (san: CertContext['extensions']['subjectAltName'], notBefore = '2026-04-01T00:00:00Z') =>
        sanPublicNames.run(makeCert({ notBefore: new Date(notBefore), extensions: { subjectAltName: san } }), makeEnv());

    it('passes with public names and addresses', () => {
        expect(run(makeSan(['www.example.com', '*.example.com'], ['93.184.216.34'])).status).toBe('pass');
    });

    it.each([
        ['an internal name', makeSan(['app.corp'])],
        ['a single-label name', makeSan(['localhost'])],
        ['a wildcard internal name', makeSan(['*.internal.example'])],
        ['a reserved IP', makeSan([], ['10.0.0.5'])],
        ['a reserved IPv6', makeSan([], ['fe80::1'])],
        ['an underscore', makeSan(['_x.example.com'])],
        ['a reserved LDH label', makeSan(['ab--cd.example.com'])],
        ['a non-DNS/IP name type', { critical: false, dnsNames: ['www.example.com'], ipAddresses: [], otherNameTypes: ['rfc822Name'] }],
    ])('is an error for %s', (_label, san) => {
        expectError(run(san));
    });

    it('rejects reverse-zone names for certificates issued on or after 2026-03-15', () => {
        expectError(run(makeSan(['1.2.0.192.in-addr.arpa']), '2026-03-15T00:00:00Z'));
    });

    it('allows reverse-zone names in certificates issued before 2026-03-15', () => {
        expect(run(makeSan(['1.2.0.192.in-addr.arpa']), '2026-03-14T23:59:59Z').status).toBe('pass');
    });

    it('is not applicable without a SAN', () => {
        expect(run(null).status).toBe('na');
    });
});

describe('sanCriticality', () => {
    const run = (subjectIsEmpty: boolean, critical: boolean) =>
        sanCriticality.run(
            makeCert({ subjectIsEmpty, extensions: { subjectAltName: { ...makeSan(['www.example.com'])!, critical } } }),
            makeEnv(),
        );

    it.each([
        [false, false],
        [true, true],
    ])('passes when subjectIsEmpty=%s and critical=%s', (empty, critical) => {
        expect(run(empty, critical).status).toBe('pass');
    });

    it.each([
        [false, true],
        [true, false],
    ])('is an error when subjectIsEmpty=%s and critical=%s', (empty, critical) => {
        expectError(run(empty, critical));
    });

    it('is not applicable without a SAN', () => {
        expect(sanCriticality.run(makeCert({ extensions: { subjectAltName: null } }), makeEnv()).status).toBe('na');
    });
});

describe('cnInSan', () => {
    const run = (subjectCommonNames: string[], san = makeSan(['www.example.com'], ['192.0.2.1', '2001:db8::1'])) =>
        cnInSan.run(makeCert({ subjectCommonNames, extensions: { subjectAltName: san } }), makeEnv());

    it.each([[[]], [['www.example.com']], [['192.0.2.1']], [['2001:db8::1']]])('passes for CN %j', cns => {
        expect(run(cns).status).toBe('pass');
    });

    it.each([
        ['a CN missing from the SAN', ['foo.example.com']],
        ['a CN that differs in case', ['WWW.EXAMPLE.COM']],
        ['an IPv6 CN not in RFC 5952 form', ['2001:DB8::1']],
        ['more than one CN', ['www.example.com', 'www.example.com']],
    ])('is an error for %s', (_label, cns) => {
        expectError(run(cns));
    });

    it('is an error for a CN when there is no SAN', () => {
        expectError(run(['www.example.com'], null));
    });
});
