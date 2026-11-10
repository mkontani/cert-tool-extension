import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SiteCertButton, { type SiteCertApi } from '../components/SiteCertButton';
import { MSG_FETCH_SITE_CERTS, NOT_HTTPS } from '../site/messages';
import { SITE_CHAIN, SITE_ORIGIN } from './siteFixtures';

const site = { origin: SITE_ORIGIN, chain: [...SITE_CHAIN], connection: { protocol: 'TLS 1.3', keyExchange: '', cipher: 'AES_128_GCM' }, trusted: true };

function fakeApi(options: { tabs?: { id?: number; url?: string }[]; reply?: () => Promise<unknown> } = {}) {
    const api = {
        tabs: { query: vi.fn(() => Promise.resolve(options.tabs ?? [{ id: 4, url: 'https://www.example.com/path?q=1' }])) },
        runtime: { sendMessage: vi.fn(options.reply ?? (() => Promise.resolve({ ok: true, site }))) },
    };
    return { api, typed: api as unknown as SiteCertApi };
}

const button = () => screen.getByRole('button');

describe('SiteCertButton', () => {
    it('is hidden outside the extension, e.g. on the GitHub Pages demo', () => {
        const { container } = render(<SiteCertButton api={null} onLoad={() => { }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('is hidden when no chrome API is available and none is passed', () => {
        const { container } = render(<SiteCertButton onLoad={() => { }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('explains in a tooltip what reading the certificate involves', () => {
        render(<SiteCertButton api={fakeApi().typed} onLoad={() => { }} />);
        expect(button()).toHaveAccessibleDescription(/HEAD request without cookies.*started debugging this browser/);
    });

    it("asks the background worker for the active tab's chain", async () => {
        const { api, typed } = fakeApi();
        const onLoad = vi.fn();
        render(<SiteCertButton api={typed} onLoad={onLoad} />);
        expect(button()).toHaveAccessibleName("Show this site's certificate");
        fireEvent.click(button());
        await waitFor(() => expect(onLoad).toHaveBeenCalledOnce());
        expect(api.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
        expect(api.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG_FETCH_SITE_CERTS, tabId: 4 });
        expect(onLoad).toHaveBeenCalledWith(site);
    });

    it('does not attach the debugger to a page that has no certificate', async () => {
        const { api, typed } = fakeApi({ tabs: [{ id: 4, url: 'http://www.example.com/' }] });
        render(<SiteCertButton api={typed} onLoad={() => { }} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent(NOT_HTTPS);
        expect(api.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('still asks when the tab URL is unknown', async () => {
        const { typed } = fakeApi({ tabs: [{ id: 4 }] });
        const onLoad = vi.fn();
        render(<SiteCertButton api={typed} onLoad={onLoad} />);
        fireEvent.click(button());
        await waitFor(() => expect(onLoad).toHaveBeenCalledWith(site));
    });

    it("shows the background worker's explanation", async () => {
        const { typed } = fakeApi({ reply: () => Promise.resolve({ ok: false, error: 'Cert Tool is already reading this tab.' }) });
        const onLoad = vi.fn();
        render(<SiteCertButton api={typed} onLoad={onLoad} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent(/^Cert Tool is already reading this tab\.$/);
        expect(onLoad).not.toHaveBeenCalled();
    });

    it.each([
        ['a malformed reply', () => Promise.resolve({ ok: true }), "Couldn't read this site's certificate: Cert Tool's background worker gave no usable answer."],
        ['a failed message', () => Promise.reject(new Error('Could not establish connection.')), "Couldn't read this site's certificate: Could not establish connection."],
    ])('reports %s', async (_name, reply, message) => {
        const { typed } = fakeApi({ reply });
        render(<SiteCertButton api={typed} onLoad={() => { }} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });

    it('reports a missing active tab', async () => {
        const { typed } = fakeApi({ tabs: [] });
        render(<SiteCertButton api={typed} onLoad={() => { }} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read this site's certificate: No active tab.");
    });

    it('disables itself while reading, and clears an earlier error', async () => {
        let finish: (value: unknown) => void = () => { };
        const { api, typed } = fakeApi({ reply: () => Promise.resolve({ ok: false, error: 'boom' }) });
        render(<SiteCertButton api={typed} onLoad={() => { }} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent('boom');
        api.runtime.sendMessage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        fireEvent.click(button());
        await waitFor(() => expect(button()).toBeDisabled());
        expect(button()).toHaveTextContent('Reading…');
        expect(screen.queryByRole('alert')).toBeNull();
        finish({ ok: true, site });
        await waitFor(() => expect(button()).not.toBeDisabled());
    });
});
