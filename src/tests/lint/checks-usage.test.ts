import { describe, it, expect } from 'vitest';
import { ekuServerAuth, notCa, brKeyUsage, brEkuForbidden, clientAuthEku } from '../../lint/checks/usage';
import { ALG, OID, makeCert, makeEnv } from './certFactory';
import type { KeyUsageFlag, CheckOutcome } from '../../lint/types';

const expectIssue = (outcome: CheckOutcome, severity: 'error' | 'warn') =>
    expect(outcome).toMatchObject({ status: 'issue', severity });

describe('ekuServerAuth', () => {
    const run = (eku: string[] | null) => ekuServerAuth.run(makeCert({ extensions: { extKeyUsage: eku } }), makeEnv());

    it.each([[[OID.serverAuth]], [[OID.serverAuth, OID.clientAuth]]])('passes for %j', eku => {
        expect(run(eku).status).toBe('pass');
    });

    it('is an error without the EKU extension', () => {
        expectIssue(run(null), 'error');
    });

    it('is an error when serverAuth is missing', () => {
        expectIssue(run([OID.clientAuth]), 'error');
    });
});

describe('notCa', () => {
    it.each([[{ ca: false }], [null]])('passes for basicConstraints %j', bc => {
        expect(notCa.run(makeCert({ extensions: { basicConstraints: bc } }), makeEnv()).status).toBe('pass');
    });

    it('is an error for CA:TRUE', () => {
        expectIssue(notCa.run(makeCert({ extensions: { basicConstraints: { ca: true } } }), makeEnv()), 'error');
    });

    it('is an error for a pathLenConstraint on a non-CA certificate', () => {
        const cert = makeCert({ extensions: { basicConstraints: { ca: false, pathLenConstraint: 0 } } });
        expectIssue(notCa.run(cert, makeEnv()), 'error');
    });
});

describe('brKeyUsage', () => {
    const rsa = (flags: KeyUsageFlag[], critical = true) =>
        brKeyUsage.run(makeCert({ extensions: { keyUsage: { critical, flags } } }), makeEnv());
    const ec = (flags: KeyUsageFlag[]) =>
        brKeyUsage.run(
            makeCert({ publicKey: { algorithm: ALG.p256Key }, extensions: { keyUsage: { critical: true, flags } } }),
            makeEnv(),
        );

    it.each([[['digitalSignature', 'keyEncipherment']], [['digitalSignature']]] as KeyUsageFlag[][][])(
        'passes RSA %j',
        flags => {
            expect(rsa(flags).status).toBe('pass');
        },
    );

    it.each([
        ['keyEncipherment only (digitalSignature SHOULD be set)', ['keyEncipherment']],
        ['dataEncipherment (NOT RECOMMENDED)', ['digitalSignature', 'dataEncipherment']],
    ] as [string, KeyUsageFlag[]][])('warns for RSA %s', (_label, flags) => {
        expectIssue(rsa(flags), 'warn');
    });

    it.each([
        ['keyCertSign', ['digitalSignature', 'keyCertSign']],
        ['keyAgreement', ['digitalSignature', 'keyAgreement']],
        ['no bits', []],
    ] as [string, KeyUsageFlag[]][])('is an error for RSA with %s', (_label, flags) => {
        expectIssue(rsa(flags), 'error');
    });

    it('passes ECDSA digitalSignature', () => {
        expect(ec(['digitalSignature']).status).toBe('pass');
    });

    it('warns for ECDSA keyAgreement (NOT RECOMMENDED)', () => {
        expectIssue(ec(['digitalSignature', 'keyAgreement']), 'warn');
    });

    it.each([
        ['missing digitalSignature', ['keyAgreement']],
        ['keyEncipherment', ['digitalSignature', 'keyEncipherment']],
    ] as [string, KeyUsageFlag[]][])('is an error for ECDSA %s', (_label, flags) => {
        expectIssue(ec(flags), 'error');
    });

    it('warns when keyUsage is absent', () => {
        expectIssue(brKeyUsage.run(makeCert({ extensions: { keyUsage: null } }), makeEnv()), 'warn');
    });

    it('warns when keyUsage is not critical', () => {
        expectIssue(rsa(['digitalSignature'], false), 'warn');
    });

    it('is not applicable to other key types', () => {
        const cert = makeCert({ publicKey: { algorithm: { oid: '1.3.101.112', derHex: '300506032b6570' } } });
        expect(brKeyUsage.run(cert, makeEnv()).status).toBe('na');
    });
});

describe('brEkuForbidden', () => {
    const run = (eku: string[] | null) => brEkuForbidden.run(makeCert({ extensions: { extKeyUsage: eku } }), makeEnv());

    it.each([[[OID.serverAuth]], [[OID.serverAuth, OID.clientAuth]]])('passes %j', eku => {
        expect(run(eku).status).toBe('pass');
    });

    it.each([[OID.codeSigning], [OID.anyExtendedKeyUsage]])('is an error for %s', oid => {
        expectIssue(run([OID.serverAuth, oid]), 'error');
    });

    it('warns for an unlisted purpose', () => {
        expectIssue(run([OID.serverAuth, '1.3.6.1.4.1.311.10.3.3']), 'warn');
    });

    it('is not applicable without EKU', () => {
        expect(run(null).status).toBe('na');
    });
});

describe('clientAuthEku', () => {
    const run = (notBefore: string, eku: string[] | null = [OID.serverAuth, OID.clientAuth]) =>
        clientAuthEku.run(makeCert({ notBefore: new Date(notBefore), extensions: { extKeyUsage: eku } }), makeEnv());

    it('passes for serverAuth only', () => {
        expect(run('2027-04-01T00:00:00Z', [OID.serverAuth]).status).toBe('pass');
    });

    it('warns for clientAuth issued before 2027-03-15', () => {
        expectIssue(run('2027-03-14T23:59:59Z'), 'warn');
    });

    it('is an error for clientAuth issued on or after 2027-03-15', () => {
        expectIssue(run('2027-03-15T00:00:00Z'), 'error');
    });

    it('is not applicable without EKU', () => {
        expect(run('2027-04-01T00:00:00Z', null).status).toBe('na');
    });
});
