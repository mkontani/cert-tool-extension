import { useMemo, useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { lintCertificate } from '../lint/lint';
import { CertParseError } from '../lint/parse';
import type { LintReport, Profile } from '../lint/types';
import LintResults from './LintResults';

type ProfileChoice = Profile | 'auto';

interface Submission {
    readonly pem: string;
    /** Time of the Lint click; validity checks are evaluated against it. */
    readonly at: Date;
}

type LintOutcome = { readonly report: LintReport } | { readonly error: string };

function runLint(submission: Submission, profile: ProfileChoice, hostname: string): LintOutcome {
    try {
        return { report: lintCertificate(submission.pem, { profile, hostname, now: submission.at }) };
    } catch (e: unknown) {
        if (e instanceof CertParseError) return { error: e.message };
        return { error: `Unexpected error while linting: ${e instanceof Error ? e.message : String(e)}` };
    }
}

export default function CertLinter() {
    const [inputPem, setInputPem] = useState('');
    const [hostname, setHostname] = useState('');
    const [profile, setProfile] = useState<ProfileChoice>('auto');
    const [submission, setSubmission] = useState<Submission | null>(null);

    // Profile and hostname apply live to the last submitted certificate.
    const outcome = useMemo(
        () => (submission ? runLint(submission, profile, hostname) : null),
        [submission, profile, hostname],
    );

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <ShieldCheck size={24} color="#22c55e" />
                <h2 style={{ margin: 0 }}>Certificate Linter</h2>
            </div>
            <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="linter-input">Certificate (PEM)</label>
                <textarea
                    id="linter-input"
                    value={inputPem}
                    onChange={e => {
                        setInputPem(e.target.value);
                        setSubmission(null); // results belong to the text that was linted
                    }}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 3 }}>
                    <label htmlFor="linter-hostname">Hostname (optional)</label>
                    <input
                        id="linter-hostname"
                        value={hostname}
                        onChange={e => setHostname(e.target.value)}
                        placeholder="www.example.com"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                <div style={{ flex: 2 }}>
                    <label htmlFor="linter-profile">Profile</label>
                    <select id="linter-profile" value={profile} onChange={e => setProfile(e.target.value as ProfileChoice)}>
                        <option value="auto">Auto-detect</option>
                        <option value="public">Public CA (CA/B BR)</option>
                        <option value="private">Private CA</option>
                    </select>
                </div>
            </div>
            <button
                className="btn"
                onClick={() => setSubmission({ pem: inputPem, at: new Date() })}
                style={{ width: '100%', marginBottom: '1.5rem' }}
            >
                Lint
            </button>
            {outcome && 'error' in outcome && (
                <div
                    role="alert"
                    style={{
                        padding: '1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '8px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}
                >
                    <AlertCircle size={18} /> {outcome.error}
                </div>
            )}
            <div aria-live="polite">
                {outcome && 'report' in outcome && <LintResults report={outcome.report} autoDetected={profile === 'auto'} />}
            </div>
        </div>
    );
}
