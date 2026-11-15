import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import KeyMatcher from '../components/KeyMatcher';
import type { KeyMatch } from '../keys/keyMatch';
import { CA_CERT } from './lint/fixtures';
import { CA_CERT_PUBLIC, EC_CERT, EC_CSR, EC_PKCS8, EC_PUBLIC, EC_PUBLIC_COMPRESSED, RSA_PKCS8, RSA_PUBLIC } from './keyFixtures';

/** pin-sha256 of a PUBLIC KEY block, worked out apart from the code under test. */
const pinOf = (pem: string) => createHash('sha256').update(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64')).digest('base64');

const first = () => screen.getByLabelText('First PEM');
const second = () => screen.getByLabelText('Second PEM');
const checkButton = () => screen.getByRole('button', { name: 'Check Match' });
/** The verdict as a screen reader hears it, without the pins. */
const announcement = () => screen.getByTestId('match-announcement');
/** The verdict on screen, with what it rests on. */
const result = () => screen.getByRole('region', { name: 'Match result' });
const findResult = () => screen.findByRole('region', { name: 'Match result' });
const queryResult = () => screen.queryByRole('region', { name: 'Match result' });
const sides = () => within(result()).getAllByRole('listitem');

const SAME: KeyMatch = {
    same: true,
    basis: 'rsa',
    first: { holder: 'private key', key: 'RSA (2048 bits)', pin: 'pin', otherBlocks: 0 },
    second: { holder: 'certificate', subject: 'match.example', key: 'RSA (2048 bits)', pin: 'pin', otherBlocks: 0 },
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

/** Nothing is shown or announced. */
function expectNoVerdict() {
    expect(announcement()).toBeEmptyDOMElement();
    expect(queryResult()).not.toBeInTheDocument();
}

describe('KeyMatcher', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('says when a private key and a certificate are for the same key pair, and what each one holds', async () => {
        await check(EC_PKCS8, EC_CERT);
        expect(within(await findResult()).getByText('Match')).toBeInTheDocument();
        expect(result()).toHaveTextContent('The private key and the certificate are for the same key pair.');
        const [firstSide, secondSide] = sides();
        expect(firstSide).toHaveTextContent('First PEM: private key, ECDSA (P-256)');
        expect(secondSide).toHaveTextContent('Second PEM: certificate for match.example, ECDSA (P-256)');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows what the verdict rests on: what was compared, and the pin of each key', async () => {
        await check(EC_PKCS8, EC_CERT);
        await findResult();
        expect(result()).toHaveTextContent('Compared the curve and the point of each key.');
        expect(result()).not.toHaveTextContent('The pins differ');
        expect(result()).toHaveTextContent('A public key pin (pin-sha256, RFC 7469) is the base64 SHA-256 of the public key; the Inspector shows the same pin for a certificate or CSR.');
        for (const side of sides()) {
            expect(within(side).getByText(pinOf(EC_PUBLIC))).toBeInTheDocument();
        }
        expect(within(sides()[0]).getByRole('button', { name: 'Copy public key pin of the first PEM' })).toBeInTheDocument();
        expect(within(sides()[1]).getByRole('button', { name: 'Copy public key pin of the second PEM' })).toBeInTheDocument();
    });

    it('copies a pin', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        await check(RSA_PKCS8, EC_CERT);
        await findResult();
        await act(async () => { fireEvent.click(within(sides()[1]).getByRole('button', { name: 'Copy public key pin of the second PEM' })); });
        expect(writeText).toHaveBeenCalledWith(pinOf(EC_PUBLIC));
        expect(within(sides()[1]).getByRole('status')).toHaveTextContent('Public key pin of the second PEM copied to the clipboard.');
    });

    it('announces the verdict without reading the pins out', async () => {
        await check(EC_PKCS8, EC_CERT);
        await findResult();
        expect(announcement()).toHaveTextContent('Match: The private key and the certificate are for the same key pair.');
        expect(announcement()).toHaveAttribute('role', 'status');
        expect(announcement()).not.toHaveTextContent(pinOf(EC_PUBLIC));
    });

    it('says when they are not, with the two pins that differ', async () => {
        await check(RSA_PKCS8, CA_CERT);
        expect(within(await findResult()).getByText('No match')).toBeInTheDocument();
        expect(announcement()).toHaveTextContent('No match: The private key and the certificate are for different key pairs.');
        expect(result()).toHaveTextContent('Compared the RSA modulus and public exponent of each key.');
        expect(within(sides()[0]).getByText(pinOf(RSA_PUBLIC))).toBeInTheDocument();
        expect(within(sides()[1]).getByText(pinOf(CA_CERT_PUBLIC))).toBeInTheDocument();
    });

    it('explains why the pins differ when the same key is encoded two ways', async () => {
        await check(EC_PUBLIC_COMPRESSED, EC_CERT);
        expect(within(await findResult()).getByText('Match')).toBeInTheDocument();
        expect(result()).toHaveTextContent('The pins differ only because the two PEMs write the same key differently.');
    });

    it('says which blocks of a PEM were not compared', async () => {
        await check(`${EC_CERT}\n${CA_CERT}`, EC_PKCS8);
        await findResult();
        const [firstSide, secondSide] = sides();
        expect(firstSide).toHaveTextContent('First PEM: certificate for match.example, ECDSA (P-256); 1 other block in it was not compared');
        expect(secondSide).toHaveTextContent('Second PEM: private key, ECDSA (P-256)');
    });

    it('compares a CSR and a certificate too', async () => {
        await check(EC_CSR, EC_CERT);
        expect(within(await findResult()).getByText('Match')).toBeInTheDocument();
        expect(result()).toHaveTextContent('The CSR and the certificate are for the same key pair.');
    });

    it('says which PEM it cannot read, and gives no verdict', async () => {
        await check(EC_PKCS8, 'hello');
        expect(await screen.findByRole('alert')).toHaveTextContent('Second PEM: Paste a private key, certificate, CSR or public key in PEM');
        expectNoVerdict();
    });

    it('does nothing while both are empty', async () => {
        await check('  ', '');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expectNoVerdict();
    });

    it('takes the verdict down once either PEM is edited, so it never speaks for other input', async () => {
        await check(EC_PKCS8, EC_CERT);
        await findResult();
        type(second(), CA_CERT);
        expectNoVerdict();
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
        expectNoVerdict();
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
        expectNoVerdict();
        expect(checkButton()).toBeDisabled();
        await act(async () => { ends[1].resolve({ ...SAME, same: false }); });
        expect(within(result()).getByText('No match')).toBeInTheDocument();
        expect(checkButton()).toBeEnabled();
    });
});
