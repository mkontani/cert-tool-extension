import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CopyButton from '../components/CopyButton';

const button = () => screen.getByRole('button', { name: 'Copy private key' });

async function click() {
    await act(async () => { fireEvent.click(button()); });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('CopyButton', () => {
    it('copies the text and says so, also to screen readers', async () => {
        const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
        render(<CopyButton text="-----BEGIN PRIVATE KEY-----" label="private key" clipboard={clipboard} />);
        await click();
        expect(clipboard.writeText).toHaveBeenCalledWith('-----BEGIN PRIVATE KEY-----');
        expect(button()).toHaveTextContent('Copied');
        expect(screen.getByRole('status')).toHaveTextContent('Private key copied to the clipboard.');
    });

    it('says when the clipboard refused, and what to do instead', async () => {
        const clipboard = { writeText: vi.fn(() => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'))) };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        render(<CopyButton text="key" label="private key" clipboard={clipboard} />);
        await click();
        expect(button()).toHaveTextContent('Copy failed');
        expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy the private key. Select the text and copy it yourself.");
        expect(warn).toHaveBeenCalledWith('Cert Tool: could not copy to the clipboard', expect.any(DOMException));
        warn.mockRestore();
    });

    it('says so when there is no clipboard to write to', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        render(<CopyButton text="key" label="private key" clipboard={null} />);
        await click();
        expect(button()).toHaveTextContent('Copy failed');
        warn.mockRestore();
    });

    it('shows Copied for the full time again when clicked again', async () => {
        vi.useFakeTimers();
        const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
        render(<CopyButton text="key" label="private key" clipboard={clipboard} />);
        await click();
        act(() => { vi.advanceTimersByTime(1900); });
        await click();
        act(() => { vi.advanceTimersByTime(500); });
        expect(button()).toHaveTextContent('Copied');
        act(() => { vi.advanceTimersByTime(1500); });
        expect(button()).toHaveTextContent(/^Copy$/);
    });

    it('keeps a failure on screen longer, and explains it on hover', async () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        render(<CopyButton text="key" label="private key" clipboard={null} />);
        await click();
        expect(button()).toHaveAttribute('title', "Couldn't copy the private key. Select the text and copy it yourself.");
        act(() => { vi.advanceTimersByTime(3900); });
        expect(button()).toHaveTextContent('Copy failed');
        act(() => { vi.advanceTimersByTime(100); });
        expect(button()).toHaveTextContent(/^Copy$/);
        expect(button()).not.toHaveAttribute('title');
        warn.mockRestore();
    });

    it('goes back to Copy after a moment', async () => {
        vi.useFakeTimers();
        const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
        render(<CopyButton text="key" label="private key" clipboard={clipboard} />);
        await click();
        expect(button()).toHaveTextContent('Copied');
        act(() => { vi.advanceTimersByTime(2000); });
        expect(button()).toHaveTextContent(/^Copy$/);
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
});
