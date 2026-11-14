import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CSRGenerator from '../components/CSRGenerator';
import KeyPairGenerator from '../components/KeyPairGenerator';
import PubKeyDeriver from '../components/PubKeyDeriver';
import { EC_PKCS8 } from './keyFixtures';

Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

const valueOf = (element: HTMLElement) => (element as HTMLTextAreaElement).value;

/** Every field must be reachable by its visible label, which is also what a screen reader announces. */
describe('form labels', () => {
    it('name every field of the CSR form', async () => {
        render(<CSRGenerator />);
        for (const label of ['Common Name', 'Organization', 'OU', 'Country (2 chars)', 'State', 'Locality', 'Email']) {
            expect(screen.getByLabelText(label)).toBeInstanceOf(HTMLInputElement);
        }
        fireEvent.change(screen.getByLabelText('SANs (separated by commas, spaces or new lines)'), { target: { value: 'app.example' } });
        fireEvent.change(screen.getByLabelText('Private Key (PEM) *'), { target: { value: EC_PKCS8 } });
        fireEvent.click(screen.getByRole('button', { name: 'Generate CSR' }));
        expect(valueOf(await screen.findByLabelText('CSR (PEM)'))).toContain('BEGIN CERTIFICATE REQUEST');
    });

    it('name the key size, the curve, and the generated keys', async () => {
        render(<KeyPairGenerator />);
        expect(screen.getByLabelText('Key Size (bits)')).toBeInstanceOf(HTMLSelectElement);
        fireEvent.change(screen.getByLabelText('Algorithm'), { target: { value: 'ECDSA' } });
        expect(screen.getByLabelText('Curve')).toBeInstanceOf(HTMLSelectElement);
        fireEvent.click(screen.getByRole('button', { name: /Generate Key Pair/i }));
        expect(valueOf(await screen.findByLabelText('Private Key', {}, { timeout: 10000 }))).toContain('BEGIN PRIVATE KEY');
        expect(valueOf(screen.getByLabelText('Public Key'))).toContain('BEGIN PUBLIC KEY');
    });

    it('name the derived public key', async () => {
        render(<PubKeyDeriver />);
        fireEvent.change(screen.getByLabelText(/Input \(Private Key, CSR, or Certificate\)/), { target: { value: EC_PKCS8 } });
        fireEvent.click(screen.getByRole('button', { name: /Extract Public Key/ }));
        expect(valueOf(await screen.findByLabelText(/^Derived Public Key/))).toContain('BEGIN PUBLIC KEY');
    });
});
