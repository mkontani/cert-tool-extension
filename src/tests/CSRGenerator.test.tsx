import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CSRGenerator from '../components/CSRGenerator';
import { inspect } from '../inspector/inspect';
import { findPemBlocks } from '../inspector/pem';
import { ED25519_PKCS8, ENCRYPTED_PKCS8, RSA_PKCS1 } from './keyFixtures';

function generate(privateKey: string, sans: string) {
    render(<CSRGenerator />);
    fireEvent.change(screen.getByPlaceholderText('e.g. example.com'), { target: { value: 'app.example' } });
    fireEvent.change(screen.getByPlaceholderText('www.example.com, 10.0.0.1'), { target: { value: sans } });
    fireEvent.change(screen.getByPlaceholderText('-----BEGIN PRIVATE KEY-----...'), { target: { value: privateKey } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate CSR' }));
}

async function generatedCsr() {
    const output = (await screen.findByDisplayValue(/BEGIN CERTIFICATE REQUEST/)) as HTMLTextAreaElement;
    const [block] = findPemBlocks(output.value).blocks;
    if (!block || 'error' in block) throw new Error('no CSR');
    return inspect(block.der, block.kind);
}

describe('CSRGenerator', () => {
    it('signs a CSR from a PKCS#1 RSA key with SHA-256, requesting its SANs', async () => {
        generate(RSA_PKCS1, 'app.example, 2001:db8::1');
        const csr = await generatedCsr();
        expect(csr.subject).toBe('commonName=app.example');
        expect(csr.signatureAlgo).toBe('sha256WithRSAEncryption');
        expect(csr.extensions[0].entries).toEqual([{ type: 'DNS', value: 'app.example' }, { type: 'IP', value: '2001:db8::1' }]);
    });

    it('requests the SANs when signing with an Ed25519 key', async () => {
        generate(ED25519_PKCS8, 'app.example');
        const csr = await generatedCsr();
        expect(csr.signatureAlgo).toBe('Ed25519');
        expect(csr.extensions[0].entries).toEqual([{ type: 'DNS', value: 'app.example' }]);
    });

    it('says which SAN cannot be requested', async () => {
        generate(ED25519_PKCS8, 'app.example, 1.2.3');
        expect(await screen.findByText('"1.2.3" is not a valid IP address.')).toBeInTheDocument();
        expect(screen.queryByDisplayValue(/BEGIN CERTIFICATE REQUEST/)).toBeNull();
    });

    it('explains how to use an encrypted key', async () => {
        generate(ENCRYPTED_PKCS8, '');
        expect(await screen.findByText(/This private key is encrypted\. Remove its passphrase first/)).toBeInTheDocument();
    });
});
