import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import CertLinter from '../components/CertLinter';
import { CA_CERT, PRIVATE_EC_LEAF, PUBLIC_RSA_LEAF, SELF_SIGNED_DEFAULT } from './lint/fixtures';

function lint(pem: string, hostname?: string) {
    fireEvent.change(screen.getByLabelText(/Certificate \(PEM\)/i), { target: { value: pem } });
    if (hostname !== undefined) {
        fireEvent.change(screen.getByLabelText(/Hostname/i), { target: { value: hostname } });
    }
    fireEvent.click(screen.getByRole('button', { name: /^Lint$/ }));
}

const issueSeverities = () =>
    within(screen.getByTestId('lint-issues'))
        .getAllByRole('listitem')
        .map(item => item.dataset.severity);

describe('CertLinter', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('reports no issues for a conformant public certificate', () => {
        render(<CertLinter />);
        lint(PUBLIC_RSA_LEAF);
        expect(screen.getByText(/No issues found/i)).toBeInTheDocument();
        expect(screen.getByTestId('lint-profile')).toHaveTextContent('Public CA (auto-detected)');
        expect(screen.getByTestId('summary-pass')).toHaveTextContent('28');
    });

    it('lists issues with errors before info', () => {
        render(<CertLinter />);
        lint(SELF_SIGNED_DEFAULT);
        expect(screen.getByTestId('summary-error')).toHaveTextContent('3');
        expect(screen.getByTestId('summary-info')).toHaveTextContent('1');
        expect(issueSeverities()).toEqual(['error', 'error', 'error', 'info']);
        expect(screen.getByText('extKeyUsage includes serverAuth')).toBeInTheDocument();
    });

    it('re-evaluates when the profile is changed', () => {
        render(<CertLinter />);
        lint(PRIVATE_EC_LEAF);
        expect(screen.getByTestId('lint-profile')).toHaveTextContent('Private CA (auto-detected)');
        expect(screen.getByText(/No issues found/i)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/Profile/i), { target: { value: 'public' } });
        expect(screen.getByTestId('lint-profile')).toHaveTextContent('Public CA');
        expect(screen.getByTestId('summary-error')).toHaveTextContent('4');
    });

    it('clears the results when the certificate text is edited', () => {
        render(<CertLinter />);
        lint(PUBLIC_RSA_LEAF);
        expect(screen.getByTestId('lint-results')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/Certificate \(PEM\)/i), { target: { value: SELF_SIGNED_DEFAULT } });
        expect(screen.queryByTestId('lint-results')).not.toBeInTheDocument();
    });

    it('explains why the private profile was auto-detected', () => {
        render(<CertLinter />);
        lint(PRIVATE_EC_LEAF);
        expect(screen.getByTestId('lint-profile-hint')).toHaveTextContent(/policy OID/);
    });

    it('does not show the auto-detection hint for a public certificate', () => {
        render(<CertLinter />);
        lint(PUBLIC_RSA_LEAF);
        expect(screen.queryByTestId('lint-profile-hint')).not.toBeInTheDocument();
    });

    it('checks the hostname', () => {
        render(<CertLinter />);
        lint(PUBLIC_RSA_LEAF, 'api.example.com');
        expect(issueSeverities()).toEqual(['error']);
        expect(screen.getByText('Hostname is covered by the subjectAltName')).toBeInTheDocument();
    });

    it('shows passed checks on request', () => {
        render(<CertLinter />);
        lint(SELF_SIGNED_DEFAULT);
        expect(screen.queryByText('Certificate has not expired')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/Show passed/i));
        expect(screen.getByText('Certificate has not expired')).toBeInTheDocument();
    });

    it('explains that CA certificates are out of scope', () => {
        render(<CertLinter />);
        lint(CA_CERT);
        expect(screen.getByRole('status')).toHaveTextContent(/CA certificate/i);
        expect(screen.queryByTestId('lint-issues')).not.toBeInTheDocument();
    });

    it('shows a parse error for invalid input', () => {
        render(<CertLinter />);
        lint('not a certificate');
        expect(screen.getByRole('alert')).toHaveTextContent(/BEGIN CERTIFICATE/);
    });
});

describe('App navigation', () => {
    it('opens the linter from the Lint tab', () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /Lint/ }));
        expect(screen.getByRole('heading', { name: 'Certificate Linter' })).toBeInTheDocument();
    });
});
