import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import KeyMatcher from '../components/KeyMatcher';
import type { KeyMatch } from '../keys/keyMatch';
import { CA_CERT } from './lint/fixtures';
import { EC_CERT, EC_CSR, EC_PKCS8, RSA_PKCS8 } from './keyFixtures';

const first = () => screen.getByLabelText('First PEM');
const second = () => screen.getByLabelText('Second PEM');
const checkButton = () => screen.getByRole('button', { name: 'Check Match' });
const verdict = () => screen.getByRole('status');

const SAME: KeyMatch = {
    same: true,
    first: { holder: 'private key', key: 'RSA (2048 bits)', otherBlocks: 0 },
    second: { holder: 'certificate', key: 'RSA (2048 bits)', otherBlocks: 0 },
};

/** A comparison that ends when the test says so. */
function pending() {
    const ends: { resolve: (match: KeyMatch) => void; reject: (error: Error) => void }[] = [];
    const compare = () => new Promise<KeyMatch>((resolve, reject) => { ends.push({ resolve, reject }); });
    return { compare, ends };
}

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

async function check(a: string, b: string) {
    render(<KeyMatcher />);
    type(first(), a);
    type(second(), b);
    await act(async () => { fireEvent.click(checkButton()); });
}

describe('KeyMatcher', () => {
    it('says when a private key and a certificate are for the same key pair, and what each one holds', async () => {
        await check(EC_PKCS8, EC_CERT);
        expect(await within(verdict()).findByText('Match')).toBeInTheDocument();
        expect(verdict()).toHaveTextContent('The private key and the certificate are for the same key pair.');
        const sides = within(verdict()).getAllByRole('listitem').map(item => item.textContent);
        expect(sides).toEqual(['First PEM: private key, ECDSA (P-256)', 'Second PEM: certificate, ECDSA (P-256)']);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says when they are not', async () => {
        await check(RSA_PKCS8, CA_CERT);
        expect(await within(verdict()).findByText('No match')).toBeInTheDocument();
        expect(verdict()).toHaveTextContent('The private key and the certificate are for different key pairs.');
    });

    it('says which blocks of a PEM were not compared', async () => {
        await check(`${EC_CERT}\n${CA_CERT}`, EC_PKCS8);
        await within(verdict()).findByText('Match');
        const sides = within(verdict()).getAllByRole('listitem').map(item => item.textContent);
        expect(sides).toEqual(['First PEM: certificate, ECDSA (P-256); 1 other block in it was not compared', 'Second PEM: private key, ECDSA (P-256)']);
    });

    it('compares a CSR and a certificate too', async () => {
        await check(EC_CSR, EC_CERT);
        expect(await within(verdict()).findByText('Match')).toBeInTheDocument();
        expect(verdict()).toHaveTextContent('The CSR and the certificate are for the same key pair.');
    });

    it('says which PEM it cannot read, and gives no verdict', async () => {
        await check(EC_PKCS8, 'hello');
        expect(await screen.findByRole('alert')).toHaveTextContent('Second PEM: Paste a private key, certificate, CSR or public key in PEM');
        expect(verdict()).toBeEmptyDOMElement();
    });

    it('does nothing while both are empty', async () => {
        await check('  ', '');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(verdict()).toBeEmptyDOMElement();
    });

    it('takes the verdict down once either PEM is edited, so it never speaks for other input', async () => {
        await check(EC_PKCS8, EC_CERT);
        await within(verdict()).findByText('Match');
        type(second(), CA_CERT);
        expect(verdict()).toBeEmptyDOMElement();
    });

    it.each([
        ['verdict', (end: ReturnType<typeof pending>['ends'][number]) => end.resolve(SAME)],
        ['error', (end: ReturnType<typeof pending>['ends'][number]) => end.reject(new Error('Second PEM: no.'))],
    ])('drops a %s on input that was edited while it was being checked', async (_, finish) => {
        const { compare, ends } = pending();
        render(<KeyMatcher compare={compare} />);
        type(first(), EC_PKCS8);
        type(second(), EC_CERT);
        fireEvent.click(checkButton());
        expect(checkButton()).toBeDisabled();
        type(second(), CA_CERT);
        expect(checkButton()).toBeEnabled();
        await act(async () => { finish(ends[0]); });
        expect(verdict()).toBeEmptyDOMElement();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(checkButton()).toBeEnabled();
    });

    it('shows only the verdict of the latest check', async () => {
        const { compare, ends } = pending();
        render(<KeyMatcher compare={compare} />);
        type(first(), EC_PKCS8);
        type(second(), EC_CERT);
        fireEvent.click(checkButton());
        type(second(), RSA_PKCS8);
        fireEvent.click(checkButton());
        await act(async () => { ends[0].resolve(SAME); });
        expect(verdict()).toBeEmptyDOMElement();
        expect(checkButton()).toBeDisabled();
        await act(async () => { ends[1].resolve({ ...SAME, same: false }); });
        expect(within(verdict()).getByText('No match')).toBeInTheDocument();
        expect(checkButton()).toBeEnabled();
    });
});
