import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageScanButton, { type ScanApi } from '../components/PageScanButton';
import { MSG_SCAN_PAGE } from '../page/messages';
import { CONTENT_SCRIPT_FILE } from '../page/runInTab';

function fakeApi(options: { tabs?: { id?: number }[]; inject?: () => Promise<unknown>; reply?: unknown } = {}) {
    const api = {
        tabs: {
            query: vi.fn(() => Promise.resolve(options.tabs ?? [{ id: 9 }])),
            sendMessage: vi.fn(() => Promise.resolve(options.reply ?? { found: 1 })),
        },
        scripting: { executeScript: vi.fn(options.inject ?? (() => Promise.resolve([]))) },
    };
    return { api, typed: api as unknown as ScanApi };
}

// The only button; its label changes while scanning.
const button = () => screen.getByRole('button');

describe('PageScanButton', () => {
    it('is hidden outside the extension, e.g. on the GitHub Pages demo', () => {
        const { container } = render(<PageScanButton api={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('is hidden when no chrome API is available and none is passed', () => {
        const { container } = render(<PageScanButton />);
        expect(container).toBeEmptyDOMElement();
    });

    it('scans the active tab, then closes the popup so the page is visible', async () => {
        const { api, typed } = fakeApi();
        const onDone = vi.fn();
        render(<PageScanButton api={typed} onDone={onDone} />);
        expect(button()).toHaveAccessibleName('Scan this page');
        fireEvent.click(button());
        await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
        expect(api.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
        expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 9, frameIds: [0] }, files: [CONTENT_SCRIPT_FILE] });
        expect(api.tabs.sendMessage).toHaveBeenCalledWith(9, { type: MSG_SCAN_PAGE }, { frameId: 0 });
    });

    it('disables itself while scanning', async () => {
        let finish: (value: unknown) => void = () => { };
        const { typed } = fakeApi({ inject: () => new Promise(resolve => { finish = resolve; }) });
        render(<PageScanButton api={typed} onDone={() => { }} />);
        fireEvent.click(button());
        await waitFor(() => expect(button()).toBeDisabled());
        expect(button()).toHaveTextContent('Scanning…');
        finish([]);
        await waitFor(() => expect(button()).not.toBeDisabled());
    });

    it('explains pages that extensions may not read, and stays open', async () => {
        const { typed } = fakeApi({ inject: () => Promise.reject(new Error('Cannot access a chrome:// URL')) });
        const onDone = vi.fn();
        render(<PageScanButton api={typed} onDone={onDone} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent("Cert Tool can't read this page.");
        expect(onDone).not.toHaveBeenCalled();
    });

    it('reports a missing active tab', async () => {
        const { typed } = fakeApi({ tabs: [] });
        render(<PageScanButton api={typed} onDone={() => { }} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't scan this page: No active tab.");
    });

    it('clears an earlier error on the next try', async () => {
        const { api, typed } = fakeApi({ reply: { error: 'boom' } });
        render(<PageScanButton api={typed} onDone={() => { }} />);
        fireEvent.click(button());
        expect(await screen.findByRole('alert')).toHaveTextContent('boom');
        api.tabs.sendMessage.mockResolvedValueOnce({ found: 0 });
        fireEvent.click(button());
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
});
