import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PublicKeyTools from '../components/PublicKeyTools';

const tab = (name: string) => screen.getByRole('tab', { name });
const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });

describe('PublicKeyTools', () => {
    it('offers Derive and Match as sub-tabs, and opens on Derive', () => {
        render(<PublicKeyTools />);
        expect(screen.getByRole('tablist', { name: 'Public key tools' })).toBeInTheDocument();
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Derive', 'Match']);
        expect(tab('Derive')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Derive' })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Public Key Derivation' })).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Key Match' })).toBeNull();
    });

    it('shows Key Match in place of the derivation when Match is clicked', () => {
        render(<PublicKeyTools />);
        fireEvent.click(tab('Match'));
        expect(tab('Match')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Match' })).toHaveAttribute('aria-labelledby', tab('Match').id);
        expect(screen.getByRole('heading', { name: 'Key Match' })).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Public Key Derivation' })).toBeNull();
    });

    it('moves between the sub-tabs with the arrow keys, Home and End, and takes focus with it', () => {
        render(<PublicKeyTools />);
        tab('Derive').focus();
        press('ArrowRight');
        expect(tab('Match')).toHaveFocus();
        expect(tab('Match')).toHaveAttribute('aria-selected', 'true');
        press('ArrowRight');
        expect(tab('Derive')).toHaveFocus();
        press('End');
        expect(tab('Match')).toHaveAttribute('aria-selected', 'true');
        press('Home');
        expect(tab('Derive')).toHaveAttribute('aria-selected', 'true');
        expect(tab('Match')).toHaveAttribute('tabindex', '-1');
    });

    it('keeps what was typed in one sub-tab while the other is open', () => {
        render(<PublicKeyTools />);
        fireEvent.change(screen.getByLabelText(/^Input \(Private Key/), { target: { value: 'a key' } });
        fireEvent.click(tab('Match'));
        fireEvent.change(screen.getByLabelText('First PEM'), { target: { value: 'a certificate' } });
        fireEvent.click(tab('Derive'));
        expect(screen.getByLabelText(/^Input \(Private Key/)).toHaveValue('a key');
        fireEvent.click(tab('Match'));
        expect(screen.getByLabelText('First PEM')).toHaveValue('a certificate');
    });
});
