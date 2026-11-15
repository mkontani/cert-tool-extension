import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

const tab = (name: string) => screen.getByRole('tab', { name });
const TAB_NAMES = ['Gen KeyPair', 'Gen CSR', 'Public Key', 'Inspector', 'Lint'];

describe('App tabs', () => {
    it('lists the tools as tabs and opens on the Inspector', () => {
        render(<App />);
        expect(screen.getByRole('tablist', { name: 'Tools' })).toBeInTheDocument();
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(TAB_NAMES);
        expect(tab('Inspector')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Inspector' })).toBeVisible();
        expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    });

    it('shows the panel of the tab that is clicked', () => {
        render(<App />);
        fireEvent.click(tab('Lint'));
        expect(tab('Lint')).toHaveAttribute('aria-selected', 'true');
        expect(tab('Inspector')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByRole('tabpanel', { name: 'Lint' })).toHaveAttribute('aria-labelledby', tab('Lint').id);
        expect(screen.getByRole('heading', { name: 'Certificate Linter' })).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Certificate Inspector' })).toBeNull();
    });

    it('leaves the arrow keys of the Public Key sub-tabs to them, without changing the tool', () => {
        render(<App />);
        fireEvent.click(tab('Public Key'));
        tab('Derive').focus();
        fireEvent.keyDown(tab('Derive'), { key: 'ArrowRight' });
        expect(tab('Match')).toHaveFocus();
        expect(tab('Public Key')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('heading', { name: 'Key Match' })).toBeVisible();
    });

    it('keeps what was typed in a tab while another tab is open', () => {
        render(<App />);
        const input = screen.getByLabelText('Input (Certificate or CSR)');
        fireEvent.change(input, { target: { value: 'pasted text' } });
        fireEvent.click(tab('Gen CSR'));
        fireEvent.click(tab('Inspector'));
        expect(screen.getByLabelText('Input (Certificate or CSR)')).toHaveValue('pasted text');
    });

    it('moves between tabs with the arrow keys, Home and End, and takes focus with it', () => {
        render(<App />);
        const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });
        tab('Inspector').focus();
        press('ArrowRight');
        expect(tab('Lint')).toHaveFocus();
        expect(tab('Lint')).toHaveAttribute('aria-selected', 'true');
        press('ArrowRight');
        expect(tab('Gen KeyPair')).toHaveFocus();
        press('ArrowLeft');
        expect(tab('Lint')).toHaveFocus();
        press('Home');
        expect(tab('Gen KeyPair')).toHaveAttribute('aria-selected', 'true');
        press('End');
        expect(tab('Lint')).toHaveAttribute('aria-selected', 'true');
    });

    it('leaves arrow keys with Alt, Ctrl or Cmd to the browser', () => {
        render(<App />);
        tab('Inspector').focus();
        for (const modifier of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
            const event = fireEvent.keyDown(tab('Inspector'), { key: 'ArrowLeft', ...modifier });
            expect(event).toBe(true); // Not prevented.
        }
        expect(tab('Inspector')).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps a generated key pair while another tab is open', async () => {
        render(<App />);
        fireEvent.click(tab('Gen KeyPair'));
        fireEvent.change(screen.getByLabelText(/Algorithm/i), { target: { value: 'ECDSA' } });
        fireEvent.click(screen.getByRole('button', { name: /Generate Key Pair/i }));
        await screen.findByTestId('keypair-results', {}, { timeout: 10000 });
        fireEvent.click(tab('Lint'));
        fireEvent.click(tab('Gen KeyPair'));
        expect(screen.getByTestId('keypair-results')).toBeVisible();
    });

    it('lets Tab reach only the selected tab, so the next Tab goes into its panel', () => {
        render(<App />);
        expect(screen.getAllByRole('tab').map(t => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0', '-1']);
    });
});
