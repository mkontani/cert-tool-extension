import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import KeyPairGenerator from '../components/KeyPairGenerator';
import CertInspector from '../components/CertInspector';
import PubKeyDeriver from '../components/PubKeyDeriver';
import { MAX_PEM_BLOCKS } from '../inspector/pem';
import { CA_CERT, ED25519_LEAF, PRIVATE_EC_LEAF } from './lint/fixtures';
import { EMPTY_SAN_CERT, KITCHEN_SINK_CERT, MIXED_SAN_CERT, RSA_PSS_CERT, SAN_CSR } from './inspectorFixtures';
import { CA_CERT_PUBLIC, EC_PKCS8, EC_PUBLIC, EC_SEC1, ENCRYPTED_PKCS8, RSA_PKCS1, RSA_PUBLIC, SAN_CSR_PUBLIC } from './keyFixtures';
import { LEAF_B64 } from './siteFixtures';
import { chainToPem } from '../site/display';

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

describe('Save buttons', () => {
    it('saves each generated key, and says so when the file cannot be saved rather than download it without asking', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
        render(<KeyPairGenerator />);
        fireEvent.change(screen.getByLabelText(/Algorithm/i), { target: { value: 'ECDSA' } });
        fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
        await screen.findByTestId('keypair-results', {}, { timeout: 10000 });
        expect(screen.getByRole('button', { name: 'Save public key' })).toBeInTheDocument();
        // jsdom has neither a save dialog nor Chrome's downloads.
        fireEvent.click(screen.getByRole('button', { name: 'Save private key' }));
        expect(await screen.findByText('Save failed')).toBeInTheDocument();
        expect(click).not.toHaveBeenCalled();
        click.mockRestore();
        warn.mockRestore();
    });

    it('saves a derived public key', async () => {
        render(<PubKeyDeriver />);
        fireEvent.change(screen.getByLabelText(/Input \(Private Key, CSR, or Certificate\)/i), { target: { value: RSA_PUBLIC } });
        fireEvent.click(screen.getByRole('button', { name: /Extract Public Key/i }));
        await screen.findByTestId('deriver-results');
        expect(screen.getByRole('button', { name: 'Save public key' })).toBeInTheDocument();
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

    const fieldValue = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

    it('decodes UTF-8 subject and issuer names', () => {
        render(<CertInspector />);
        fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: KITCHEN_SINK_CERT } });
        fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
        const expected = 'countryName=JP, organizationName=株式会社テスト, commonName=ks.example.jp';
        expect(fieldValue('Subject:')).toBe(expected);
        expect(fieldValue('Issuer:')).toBe(expected);
    });

    it('names the key and signature algorithms', () => {
        render(<CertInspector />);
        fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: RSA_PSS_CERT } });
        fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
        expect(fieldValue('Public Key:')).toBe('RSA-PSS (2048 bits)');
        expect(fieldValue('Signature:')).toBe('RSASSA-PSS');
    });

    it('shows the fingerprints and the public key pin, each with its own copy button', () => {
        render(<CertInspector />);
        fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: chainToPem([LEAF_B64]) } });
        fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
        const results = screen.getByTestId('inspector-results');
        const row = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;
        expect(within(row('SHA-256 Fingerprint:')).getByText('22:69:40:02:2E:EE:18:D0:F3:7A:08:A4:43:A0:B0:EB:C6:D2:04:0A:CA:86:54:31:47:6B:4C:65:8C:7F:BE:FF')).toBeInTheDocument();
        expect(within(row('SHA-1 Fingerprint:')).getByText('A0:03:C5:E3:C4:3C:E2:17:AB:5F:0F:E3:25:6D:38:34:59:6C:3E:F1')).toBeInTheDocument();
        expect(within(row('Public Key Pin:')).getByText('R5gLengN8aXPU7JH3bjlDONl7osb9k5lJS/jhcKlIKc=')).toBeInTheDocument();
        expect(within(results).getByRole('button', { name: 'Copy SHA-256 fingerprint' })).toBeInTheDocument();
        expect(within(results).getByRole('button', { name: 'Copy SHA-1 fingerprint' })).toBeInTheDocument();
        expect(within(results).getByRole('button', { name: 'Copy public key pin' })).toBeInTheDocument();
        // Hex may wrap after each of its 31 colons, never inside a byte; the base64 pin has no such breaks.
        expect(row('SHA-256 Fingerprint:').querySelectorAll('code wbr')).toHaveLength(31);
        expect(row('Public Key Pin:').querySelectorAll('code wbr')).toHaveLength(0);
    });

    it('pins the public key of a CSR but lists no fingerprint for it', () => {
        render(<CertInspector />);
        fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: SAN_CSR } });
        fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
        expect(screen.getByText('Public Key Pin:')).toBeInTheDocument();
        expect(screen.queryByText('SHA-256 Fingerprint:')).toBeNull();
    });

    describe('pasted chains', () => {
        const inspect = (text: string) => {
            render(<CertInspector />);
            fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: text } });
            fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
        };
        const certificateButtons = () =>
            within(screen.getByRole('group', { name: 'Certificates in the input' })).getAllByRole('button');
        const buttonNames = () => certificateButtons().map(button => button.getAttribute('aria-label'));
        const pressed = () => certificateButtons().map(button => button.getAttribute('aria-pressed'));

        it('offers one button per certificate, named after its common name', () => {
            inspect(`${PRIVATE_EC_LEAF}\n${CA_CERT}\n`);
            expect(buttonNames()).toEqual(['1: app.corp', '2: Lint Test Root CA']);
            expect(pressed()).toEqual(['true', 'false']);
            expect(fieldValue('Subject:')).toBe('organizationName=Example Corp, commonName=app.corp');
        });

        it('links a chain pasted leaf first to its issuer', () => {
            inspect(`${PRIVATE_EC_LEAF}\n${CA_CERT}\n`);
            const group = screen.getByRole('group', { name: 'Certificates in the input' });
            expect(within(group).getAllByText('issued by')).toHaveLength(1);
            expect(group).not.toHaveTextContent('out of order');
        });

        it('points at an issuer listed out of order', () => {
            inspect(`${CA_CERT}\n${PRIVATE_EC_LEAF}\n`);
            const group = screen.getByRole('group', { name: 'Certificates in the input' });
            expect(within(group).queryByText('issued by')).toBeNull();
            expect(group).toHaveTextContent('Issued by #1 Lint Test Root CA, listed out of order');
        });

        it('names an issuer missing from the input', () => {
            inspect(`${PRIVATE_EC_LEAF}\n${SAN_CSR}\n`);
            expect(screen.getByRole('group', { name: 'Certificates in the input' })).toHaveTextContent('Issued by Lint Test Root CA, not in the input');
        });

        it('switches to the selected certificate', () => {
            inspect(`${PRIVATE_EC_LEAF}\n${CA_CERT}\n`);
            fireEvent.click(screen.getByRole('button', { name: '2: Lint Test Root CA' }));
            expect(fieldValue('Subject:')).toBe('countryName=JP, organizationName=Lint Test, commonName=Lint Test Root CA');
            expect(pressed()).toEqual(['false', 'true']);
        });

        it('starts again from the first certificate when new input is parsed', () => {
            inspect(`${PRIVATE_EC_LEAF}\n${CA_CERT}\n`);
            fireEvent.click(screen.getByRole('button', { name: '2: Lint Test Root CA' }));
            fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: `${CA_CERT}\n${PRIVATE_EC_LEAF}\n` } });
            fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
            expect(fieldValue('Subject:')).toBe('countryName=JP, organizationName=Lint Test, commonName=Lint Test Root CA');
        });

        it('keeps the readable certificates when one cannot be parsed', () => {
            inspect(`${PRIVATE_EC_LEAF}\n-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n`);
            expect(buttonNames()).toEqual(['1: app.corp', '2: (unreadable)']);
            fireEvent.click(screen.getByRole('button', { name: '2: (unreadable)' }));
            expect(screen.getByRole('alert')).toHaveTextContent(/^Failed to parse:/);
            expect(screen.queryByTestId('inspector-results')).not.toBeInTheDocument();
        });

        it('keeps the certificates before a truncated one', () => {
            inspect(`${PRIVATE_EC_LEAF}\n-----BEGIN CERTIFICATE-----\nMIIB`);
            expect(buttonNames()).toEqual(['1: app.corp', '2: (unreadable)']);
            fireEvent.click(screen.getByRole('button', { name: '2: (unreadable)' }));
            expect(screen.getByRole('alert')).toHaveTextContent('Failed to parse: The CERTIFICATE block #2 has no matching END line.');
        });

        it('lists CSRs alongside certificates', () => {
            inspect(`${CA_CERT}\n${SAN_CSR}\n`);
            expect(buttonNames()).toEqual(['1: Lint Test Root CA', '2: csr.example (CSR)']);
            fireEvent.click(screen.getByRole('button', { name: '2: csr.example (CSR)' }));
            expect(screen.getByRole('heading', { name: 'Certificate Signing Request (CSR)' })).toBeInTheDocument();
        });

        it(`says when only the first ${MAX_PEM_BLOCKS} blocks are listed`, () => {
            inspect(`${CA_CERT}\n`.repeat(MAX_PEM_BLOCKS + 1));
            expect(certificateButtons()).toHaveLength(MAX_PEM_BLOCKS);
            expect(screen.getByText(`Only the first ${MAX_PEM_BLOCKS} blocks are listed.`)).toBeInTheDocument();
        });

        it('shows no selector for a single certificate', () => {
            inspect(PRIVATE_EC_LEAF);
            expect(screen.queryByRole('group', { name: 'Certificates in the input' })).not.toBeInTheDocument();
        });
    });

    describe('subjectAltName', () => {
        const inspect = (pem: string) => {
            render(<CertInspector />);
            fireEvent.change(screen.getByLabelText(/Input \(Certificate or CSR\)/i), { target: { value: pem } });
            fireEvent.click(screen.getByRole('button', { name: /Parse/i }));
        };

        const sanRows = () =>
            within(screen.getByRole('list', { name: 'subjectAltName entries' }))
                .getAllByRole('listitem')
                .map(row => Array.from(row.children).map(cell => cell.textContent));

        it('lists each entry on its own row with its type', () => {
            inspect(PRIVATE_EC_LEAF);
            expect(sanRows()).toEqual([
                ['DNS', 'app.corp'],
                ['DNS', '*.internal.example'],
                ['IP', '10.0.0.5'],
                ['IP', '2001:db8::1'],
            ]);
        });

        it('shows the number of entries', () => {
            inspect(PRIVATE_EC_LEAF);
            expect(screen.getByText('4 entries')).toBeInTheDocument();
        });

        it('uses the singular for a single entry', () => {
            inspect(ED25519_LEAF);
            expect(screen.getByText('1 entry')).toBeInTheDocument();
        });

        it('shows only the name containing control characters as hex', () => {
            const der = Buffer.from(PRIVATE_EC_LEAF.replace(/-----[^-]+-----|\s/g, ''), 'base64');
            const at = der.lastIndexOf('app.corp'); // the SAN comes after the subject CN
            expect(at).toBeGreaterThan(-1);
            const corrupted = Buffer.concat([der.subarray(0, at), Buffer.from([0x01]), der.subarray(at + 1)]);
            inspect(`-----BEGIN CERTIFICATE-----\n${corrupted.toString('base64')}\n-----END CERTIFICATE-----`);

            expect(sanRows().slice(0, 2)).toEqual([
                ['DNS', '(Hex) 01:70:70:2E:63:6F:72:70'],
                ['DNS', '*.internal.example'],
            ]);
        });

        it('labels email, URI, registeredID and otherName entries', () => {
            inspect(MIXED_SAN_CERT);
            expect(sanRows()).toEqual([
                ['DNS', 'mixed.example'],
                ['Email', 'admin@example.com'],
                ['URI', 'https://example.com/id'],
                ['RID', '1.2.3.4'],
                ['otherName', 'UPN: user@example.com'],
            ]);
        });

        it('lists the names requested in a CSR', () => {
            inspect(SAN_CSR);
            expect(sanRows()).toEqual([
                ['DNS', 'csr.example'],
                ['DNS', 'www.csr.example'],
                ['IP', '192.0.2.10'],
            ]);
        });

        it('marks an extension without names as empty', () => {
            inspect(EMPTY_SAN_CERT);
            expect(screen.queryByRole('list', { name: 'subjectAltName entries' })).not.toBeInTheDocument();
            expect(screen.getByText('(empty)')).toBeInTheDocument();
        });
    });
});

describe('PubKeyDeriver Component', () => {
    const derive = (pem: string) => {
        render(<PubKeyDeriver />);
        fireEvent.change(screen.getByLabelText(/Input \(Private Key, CSR, or Certificate\)/i), { target: { value: pem } });
        fireEvent.click(screen.getByRole('button', { name: /Extract Public Key/i }));
    };

    it.each([
        ['a PKCS#1 RSA key', RSA_PKCS1, RSA_PUBLIC, 'RSA'],
        ['a SEC1 EC key', EC_SEC1, EC_PUBLIC, 'ECDSA P-256'],
        ['a key pasted after a certificate', `${CA_CERT}\n${EC_PKCS8}\n`, EC_PUBLIC, 'ECDSA P-256'],
    ])('extracts the same public key as openssl from %s', async (_, pem, expected, algorithm) => {
        derive(pem);
        const results = await screen.findByTestId('deriver-results');
        expect(results).toHaveTextContent(`(from Private Key (${algorithm}))`);
        expect(within(results).getByRole('textbox')).toHaveValue(`${expected}\n`);
    });

    it.each([
        ['a certificate', CA_CERT, CA_CERT_PUBLIC, 'Certificate'],
        ['a CSR', SAN_CSR, SAN_CSR_PUBLIC, 'CSR'],
        ['a public key with text around it', `Our key:\n${RSA_PUBLIC}\nThanks!`, RSA_PUBLIC, 'Public Key'],
    ])('extracts the same public key as openssl from %s', async (_, pem, expected, source) => {
        derive(pem);
        const results = await screen.findByTestId('deriver-results');
        expect(results).toHaveTextContent(`(from ${source})`);
        expect(within(results).getByRole('textbox')).toHaveValue(`${expected}\n`);
    });

    it('explains input it cannot read', async () => {
        derive('hello');
        expect(await screen.findByRole('alert')).toHaveTextContent('Paste a private key, certificate, CSR or public key in PEM');
        expect(screen.queryByTestId('deriver-results')).not.toBeInTheDocument();
    });

    it('explains how to use an encrypted key', async () => {
        derive(ENCRYPTED_PKCS8);
        expect(await screen.findByRole('alert')).toHaveTextContent(/This private key is encrypted\. Remove its passphrase first/);
    });

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
