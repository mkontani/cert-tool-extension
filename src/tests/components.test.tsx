import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import KeyPairGenerator from '../components/KeyPairGenerator';
import CertInspector from '../components/CertInspector';
import PubKeyDeriver from '../components/PubKeyDeriver';

// Mock clipboard API
Object.assign(navigator, {
    clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
    },
});

const P256_PRIVATE_KEY_PEM = [
    '-----BEGIN PRIVATE KEY-----',
    'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgkVhVZa5Vd7k951uO',
    'ek3dw90QxMcaYregfRy76E7Av/WhRANCAATjhUmhCOo9SoyWrf98WQJ385TFrTmV',
    'NV5Vc09vb+TWlj5mjh6ys8KY/C52wvKSD3DBmhiRXWLetdGR7rR3Awvm',
    '-----END PRIVATE KEY-----'
].join('\n');

const RSA_CERT_PEM = [
    '-----BEGIN CERTIFICATE-----',
    'MIIBDDCBt6ADAgECAgEBMA0GCSqGSIb3DQEBBQUAMA8xDTALBgNVBAMTBHRlc3Qw',
    'HhcNMjYwMTA1MTgzMzIwWhcNMjcwMTA1MTgzMzIwWjAPMQ0wCwYDVQQDEwR0ZXN0',
    'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMHE3wp+q8Y04mscHhCWM0OdvDHxPLMW',
    'Q93JK5kAl6LoIg8+VgLx+x3qC924HZEY4vHWn7zTMprONegtkBrIXOMCAwEAATAN',
    'BgkqhkiG9w0BAQUFAANBACOwiiAuflA0+9jY07qBzMSr6opETHMwJtcObSwH3tY/',
    'Si08dwChGw5PW8fqPOXOHNjm95BPLi9qP42F15x7rpw=',
    '-----END CERTIFICATE-----'
].join('\n');

describe('KeyPairGenerator Component', () => {
    it('should allow generating RSA keys', async () => {
        render(<KeyPairGenerator />);
        const select = screen.getByLabelText(/Algorithm/i) as HTMLSelectElement;
        fireEvent.change(select, { target: { value: 'RSA' } });
        const generateBtn = screen.getByRole('button', { name: /Generate/i });
        fireEvent.click(generateBtn);
        await waitFor(() => {
            expect(screen.getByTestId('keypair-results')).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('should allow generating ECDSA keys', async () => {
        render(<KeyPairGenerator />);
        const select = screen.getByLabelText(/Algorithm/i) as HTMLSelectElement;
        fireEvent.change(select, { target: { value: 'ECDSA' } });
        const generateBtn = screen.getByRole('button', { name: /Generate/i });
        fireEvent.click(generateBtn);
        await waitFor(() => {
            const results = screen.queryByTestId('keypair-results');
            expect(results).toBeInTheDocument();
        }, { timeout: 10000 });
    });
});

describe('CertInspector Component', () => {
    it('should parse an RSA certificate and display info', async () => {
        render(<CertInspector />);
        const textarea = screen.getByLabelText(/Input \(Certificate or CSR\)/i) as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: RSA_CERT_PEM } });
        const parseBtn = screen.getByRole('button', { name: /Parse/i });
        fireEvent.click(parseBtn);

        const results = await screen.findByTestId('inspector-results', {}, { timeout: 10000 });
        expect(results).toBeInTheDocument();

        // Deepest element matcher helper
        const deepestWithText = (text: string) => (_content: string, element: Element | null) => {
            if (!element) return false;
            const hasText = (node: Element) => node.textContent?.includes(text);
            return hasText(element) && Array.from(element.children).every(child => !hasText(child));
        };

        expect(within(results).getByText(deepestWithText('X.509 Certificate'))).toBeInTheDocument();

        const commonNames = within(results).getAllByText(deepestWithText('commonName=test'));
        expect(commonNames.length).toBeGreaterThanOrEqual(1);

        const rsaMatches = within(results).getAllByText(deepestWithText('RSA'));
        expect(rsaMatches.length).toBeGreaterThanOrEqual(1);
    });
});

describe('PubKeyDeriver Component', () => {
    it('should extract public key from a private key', async () => {
        render(<PubKeyDeriver />);
        const textarea = screen.getByLabelText(/Input \(Private Key, CSR, or Certificate\)/i) as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: P256_PRIVATE_KEY_PEM } });
        const deriveBtn = screen.getByRole('button', { name: /Extract Public Key/i });
        fireEvent.click(deriveBtn);

        const results = await screen.findByTestId('deriver-results', {}, { timeout: 10000 });
        expect(results).toBeInTheDocument();

        const boxes = within(results).getAllByRole('textbox') as HTMLTextAreaElement[];
        expect(boxes.some(b => b.readOnly && b.value.includes('-----BEGIN PUBLIC KEY-----'))).toBe(true);
    });
});
