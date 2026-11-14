import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SaveButton from '../components/SaveButton';
import type { SaveOutcome, SaveRequest } from '../components/saveFile';

const button = () => screen.getByRole('button', { name: 'Save private key' });

async function click() {
    await act(async () => { fireEvent.click(button()); });
}

function renderWith(save: (request: SaveRequest) => Promise<SaveOutcome>) {
    render(<SaveButton text="-----BEGIN PRIVATE KEY-----" label="private key" filename="private.key" extensions={['.key']} save={save} />);
}

afterEach(() => {
    vi.useRealTimers();
});

describe('SaveButton', () => {
    it('saves the text under the file name, and says so, also to screen readers', async () => {
        const save = vi.fn(() => Promise.resolve<SaveOutcome>('saved'));
        renderWith(save);
        await click();
        expect(save).toHaveBeenCalledWith({ text: '-----BEGIN PRIVATE KEY-----', filename: 'private.key', description: 'Private key', extensions: ['.key'] });
        expect(button()).toHaveTextContent('Saved');
        expect(screen.getByRole('status')).toHaveTextContent('Private key saved.');
    });

    it.each<SaveOutcome>(['canceled', 'downloading'])('says nothing when the save was %s', async outcome => {
        renderWith(() => Promise.resolve(outcome));
        await click();
        expect(button()).toHaveTextContent(/^Save$/);
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('says when the file could not be saved, and what to do instead', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        renderWith(() => Promise.reject(new Error('Saving files is not available here.')));
        await click();
        expect(button()).toHaveTextContent('Save failed');
        expect(button()).toHaveAttribute('title', "Couldn't save the private key. Copy it instead.");
        expect(screen.getByRole('status')).toHaveTextContent("Couldn't save the private key. Copy it instead.");
        expect(warn).toHaveBeenCalledWith('Cert Tool: could not save the file', expect.any(Error));
        warn.mockRestore();
    });

    it('goes back to Save after a moment', async () => {
        vi.useFakeTimers();
        renderWith(() => Promise.resolve('saved'));
        await click();
        act(() => { vi.advanceTimersByTime(2000); });
        expect(button()).toHaveTextContent(/^Save$/);
    });

    it('keeps a failure on screen for four seconds', async () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        renderWith(() => Promise.reject(new Error('No.')));
        await click();
        act(() => { vi.advanceTimersByTime(3900); });
        expect(button()).toHaveTextContent('Save failed');
        act(() => { vi.advanceTimersByTime(100); });
        expect(button()).toHaveTextContent(/^Save$/);
        expect(button()).not.toHaveAttribute('title');
        warn.mockRestore();
    });
});
