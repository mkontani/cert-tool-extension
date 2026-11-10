import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CertInspector from '../components/CertInspector';
import type { SiteCertApi } from '../components/SiteCertButton';
import { chainToPem } from '../site/display';
import { INTERMEDIATE_B64, LEAF_B64, SITE_CHAIN, SITE_ORIGIN } from './siteFixtures';
import { CA_CERT } from './lint/fixtures';

const connection = { protocol: 'TLS 1.3', keyExchange: '', keyExchangeGroup: 'X25519MLKEM768', cipher: 'AES_128_GCM' };

function fakeApi(site: Record<string, unknown> = {}): SiteCertApi {
    return {
        tabs: { query: vi.fn(() => Promise.resolve([{ id: 4, url: 'https://www.example.com/' }])) },
        runtime: { sendMessage: vi.fn(() => Promise.resolve({ ok: true, site: { origin: SITE_ORIGIN, chain: [...SITE_CHAIN], connection, trusted: true, ...site } })) },
    } as unknown as SiteCertApi;
}

const input = () => screen.getByLabelText(/Input \(Certificate or CSR\)/i) as HTMLTextAreaElement;
const fieldValue = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
const chainButtons = () => within(screen.getByRole('group', { name: 'Certificates in the input' })).getAllByRole('button');

async function showSite(site?: Record<string, unknown>) {
    render(<CertInspector siteApi={fakeApi(site)} />);
    fireEvent.click(screen.getByRole('button', { name: "Show this site's certificate" }));
    return screen.findByRole('region', { name: 'Certificate of www.example.com' });
}

describe("CertInspector with the current site's certificate", () => {
    it('lists the chain from the leaf to the root', async () => {
        await showSite();
        expect(chainButtons().map(b => b.getAttribute('aria-label'))).toEqual([
            '1: www.example.com (leaf)',
            '2: Example Issuing CA (intermediate)',
            '3: Example Root CA (root)',
        ]);
        expect(fieldValue('Subject:')).toBe('commonName=www.example.com');
    });

    it('shows each certificate of the chain', async () => {
        await showSite();
        fireEvent.click(screen.getByRole('button', { name: '3: Example Root CA (root)' }));
        expect(fieldValue('Subject:')).toBe('organizationName=Example Trust, commonName=Example Root CA');
        expect(fieldValue('Issuer:')).toBe('organizationName=Example Trust, commonName=Example Root CA');
    });

    it('puts the chain in the input as PEM, so it can be copied or linted', async () => {
        await showSite();
        expect(input().value).toBe(chainToPem(SITE_CHAIN));
    });

    it('summarizes the connection and says Chrome verified the chain up to a root', async () => {
        const summary = await showSite();
        expect(summary).toHaveTextContent('TLS 1.3 · X25519MLKEM768 · AES_128_GCM');
        expect(summary).toHaveTextContent('Verified by Chrome, from the leaf up to a root it trusts.');
        expect(within(summary).queryByRole('alert')).toBeNull();
    });

    it('says so when Chrome left the root out of the chain', async () => {
        const summary = await showSite({ chain: [LEAF_B64, INTERMEDIATE_B64] });
        expect(summary).toHaveTextContent('Verified by Chrome. Its chain for this site stops below the root');
        expect(chainButtons().map(b => b.getAttribute('aria-label'))).toEqual(['1: www.example.com (leaf)', '2: Example Issuing CA (intermediate)']);
    });

    it('warns when Chrome did not accept the certificate', async () => {
        const summary = await showSite({ trusted: false });
        expect(within(summary).getByRole('alert')).toHaveTextContent('Chrome did not accept this certificate');
        expect(summary).not.toHaveTextContent('Verified by Chrome');
    });

    it('drops the site summary and roles when other input is parsed', async () => {
        await showSite();
        fireEvent.change(input(), { target: { value: `${CA_CERT}\n${CA_CERT}\n` } });
        fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
        expect(screen.queryByRole('region', { name: /^Certificate of/ })).toBeNull();
        expect(chainButtons().map(b => b.getAttribute('aria-label'))).toEqual(['1: Lint Test Root CA', '2: Lint Test Root CA']);
    });

    it('drops the site summary and roles as soon as the input is edited', async () => {
        await showSite();
        fireEvent.change(input(), { target: { value: `${input().value}\n` } });
        expect(screen.queryByRole('region', { name: /^Certificate of/ })).toBeNull();
        expect(chainButtons()[0]).toHaveAttribute('aria-label', '1: www.example.com');
    });

    it('starts from the leaf again after another certificate was selected', async () => {
        await showSite();
        fireEvent.click(screen.getByRole('button', { name: '2: Example Issuing CA (intermediate)' }));
        fireEvent.click(screen.getByRole('button', { name: "Show this site's certificate" }));
        await waitFor(() => expect(chainButtons()[0]).toHaveAttribute('aria-pressed', 'true'));
    });
});
