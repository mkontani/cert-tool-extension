import { describe, it, expect } from 'vitest';
import { derivePublicKey } from '../../keys/publicKey';
import { CA_CERT, ED25519_LEAF, LEGACY_V1_SHA1 } from '../lint/fixtures';
import { SAN_CSR } from '../inspectorFixtures';
import {
    CA_CERT_PUBLIC,
    EC_PKCS8,
    EC_PUBLIC,
    ED25519_CERT_PUBLIC,
    RSA_PUBLIC,
    RSA_PUBLIC_PKCS1,
    SAN_CSR_PUBLIC,
    V1_CERT_PUBLIC,
} from '../keyFixtures';

const NOT_FOUND = 'Paste a private key, certificate, CSR or public key in PEM, from its -----BEGIN line to its -----END line.';

/** The same PEM block under another label, e.g. to hand a CSR's bytes in as a certificate. */
const relabel = (pem: string, from: string, to: string) => pem.replaceAll(`-----BEGIN ${from}-----`, `-----BEGIN ${to}-----`).replaceAll(`-----END ${from}-----`, `-----END ${to}-----`);
/** A PEM block of the given bytes. */
const pemOf = (label: string, bytes: Uint8Array) => `-----BEGIN ${label}-----\n${Buffer.from(bytes).toString('base64')}\n-----END ${label}-----`;
const derOf = (pem: string) => new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'));

describe('derivePublicKey', () => {
    it.each([
        ['a certificate', CA_CERT, CA_CERT_PUBLIC, 'Certificate'],
        ['a v1 certificate, which has no version field', LEGACY_V1_SHA1, V1_CERT_PUBLIC, 'Certificate'],
        ['an Ed25519 certificate', ED25519_LEAF, ED25519_CERT_PUBLIC, 'Certificate'],
        ['a certificate under the legacy X509 CERTIFICATE label', relabel(CA_CERT, 'CERTIFICATE', 'X509 CERTIFICATE'), CA_CERT_PUBLIC, 'Certificate'],
        ['a CSR', SAN_CSR, SAN_CSR_PUBLIC, 'CSR'],
        ['a CSR under the legacy NEW CERTIFICATE REQUEST label', relabel(SAN_CSR, 'CERTIFICATE REQUEST', 'NEW CERTIFICATE REQUEST'), SAN_CSR_PUBLIC, 'CSR'],
        ['a PUBLIC KEY block, without the text around it', `Key for app.corp:\n${RSA_PUBLIC}\n(rotated yearly)`, RSA_PUBLIC, 'Public Key'],
        ['a PUBLIC KEY block on one line', pemOf('PUBLIC KEY', derOf(RSA_PUBLIC)), RSA_PUBLIC, 'Public Key'],
        ['a PKCS#1 RSA PUBLIC KEY block', RSA_PUBLIC_PKCS1, RSA_PUBLIC, 'RSA Public Key (PKCS#1)'],
        ['the first block of several', `${SAN_CSR}\n${CA_CERT}\n${RSA_PUBLIC}`, SAN_CSR_PUBLIC, 'CSR'],
        ['the block after one that was cut off', `-----BEGIN PUBLIC KEY-----\nMIIB\n${RSA_PUBLIC}`, RSA_PUBLIC, 'Public Key'],
    ])('reads the public key of %s as openssl does', async (_, text, expected, source) => {
        expect(await derivePublicKey(text)).toEqual({ pem: `${expected}\n`, source });
    });

    it('reads a private key, even when a certificate comes first', async () => {
        expect(await derivePublicKey(`${CA_CERT}\n${EC_PKCS8}`)).toEqual({ pem: `${EC_PUBLIC}\n`, source: 'Private Key (ECDSA P-256)' });
    });

    it.each([
        ['text that only mentions a private key', `# The PRIVATE KEY is kept elsewhere.\n${CA_CERT}`],
        ['a private key block that was cut off', `${CA_CERT}\n-----BEGIN PRIVATE KEY-----\nMIIE`],
    ])('reads the certificate when there is %s', async (_, text) => {
        expect(await derivePublicKey(text)).toEqual({ pem: `${CA_CERT_PUBLIC}\n`, source: 'Certificate' });
    });

    it('reports a broken block rather than skip to the next one', async () => {
        await expect(derivePublicKey(`-----BEGIN PUBLIC KEY-----\n#!\n-----END PUBLIC KEY-----\n${CA_CERT}`)).rejects.toThrow('The PUBLIC KEY block is not valid base64.');
    });

    it.each([
        ['text without a PEM block', 'hello', NOT_FOUND],
        ['a block cut off before its END line', '-----BEGIN CERTIFICATE-----\nMIIB', NOT_FOUND],
        ['a private key cut off before its END line', '-----BEGIN PRIVATE KEY-----\nMIIE', NOT_FOUND],
        ['a CERTIFICATE block with data after the certificate', pemOf('CERTIFICATE', new Uint8Array([...derOf(CA_CERT), 0x05, 0x00])), 'The CERTIFICATE block is not a valid certificate.'],
        ['a block of another kind', '-----BEGIN PKCS7-----\nMAA=\n-----END PKCS7-----', NOT_FOUND],
        ['a block that is not base64', '-----BEGIN PUBLIC KEY-----\n#!\n-----END PUBLIC KEY-----', 'The PUBLIC KEY block is not valid base64.'],
        ['a CERTIFICATE block that holds a CSR', relabel(SAN_CSR, 'CERTIFICATE REQUEST', 'CERTIFICATE'), 'The CERTIFICATE block is not a valid certificate.'],
        ['an empty CERTIFICATE block', '-----BEGIN CERTIFICATE-----\nMAA=\n-----END CERTIFICATE-----', 'The CERTIFICATE block is not a valid certificate.'],
        ['a CERTIFICATE REQUEST block that holds a certificate', relabel(CA_CERT, 'CERTIFICATE', 'CERTIFICATE REQUEST'), 'The CERTIFICATE REQUEST block is not a valid CSR.'],
        ['a CERTIFICATE REQUEST block that holds a v1 certificate', relabel(LEGACY_V1_SHA1, 'CERTIFICATE', 'CERTIFICATE REQUEST'), 'The CERTIFICATE REQUEST block is not a valid CSR.'],
        ['a PUBLIC KEY block that holds a certificate', relabel(CA_CERT, 'CERTIFICATE', 'PUBLIC KEY'), 'The PUBLIC KEY block is not a valid public key.'],
        ['a PUBLIC KEY block with data after the key', pemOf('PUBLIC KEY', new Uint8Array([...derOf(RSA_PUBLIC), 0x05, 0x00])), 'The PUBLIC KEY block is not a valid public key.'],
        ['an RSA PUBLIC KEY block that holds an SPKI', relabel(RSA_PUBLIC, 'PUBLIC KEY', 'RSA PUBLIC KEY'), 'The RSA PUBLIC KEY block is not a valid PKCS#1 public key.'],
    ])('explains %s', async (_, text, message) => {
        await expect(derivePublicKey(text)).rejects.toThrow(message);
    });
});
