import { useState } from 'react';
import { CircleCheck, CircleMinus, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { summarize } from '../lint/lint';
import type { CheckResult, LintReport, Profile, Severity } from '../lint/types';

const PROFILE_LABELS: Record<Profile, string> = {
    public: 'Public CA',
    private: 'Private CA',
};

interface Tone {
    readonly icon: LucideIcon;
    readonly color: string;
    readonly background: string;
}

const TONES: Record<Severity | 'pass' | 'na', Tone> = {
    error: { icon: CircleX, color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)' },
    warn: { icon: TriangleAlert, color: '#fcd34d', background: 'rgba(245, 158, 11, 0.15)' },
    info: { icon: Info, color: '#93c5fd', background: 'rgba(59, 130, 246, 0.15)' },
    pass: { icon: CircleCheck, color: '#86efac', background: 'rgba(34, 197, 94, 0.1)' },
    na: { icon: CircleMinus, color: '#94a3b8', background: 'rgba(148, 163, 184, 0.1)' },
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

const toneKey = (result: CheckResult) => (result.status === 'issue' ? result.severity : result.status);

function ResultItem({ result }: { readonly result: CheckResult }) {
    const tone = TONES[toneKey(result)];
    const Icon = tone.icon;
    return (
        <li
            data-severity={toneKey(result)}
            style={{
                display: 'flex', gap: '0.6rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem',
                background: tone.background, borderRadius: '8px', listStyle: 'none',
            }}
        >
            <Icon size={18} color={tone.color} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden />
            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{result.title}</div>
                {result.status === 'issue' && (
                    <div style={{ fontSize: '0.8rem', opacity: 0.9, wordBreak: 'break-word' }}>{result.message}</div>
                )}
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.15rem' }}>{result.citation}</div>
            </div>
        </li>
    );
}

interface SummaryChipProps {
    readonly kind: keyof typeof TONES;
    readonly label: string;
    readonly count: number;
}

function SummaryChip({ kind, label, count }: SummaryChipProps) {
    const tone = TONES[kind];
    return (
        <div
            data-testid={`summary-${kind}`}
            style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: tone.background, textAlign: 'center' }}
        >
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: tone.color }}>{count}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{label}</div>
        </div>
    );
}

interface LintResultsProps {
    readonly report: LintReport;
    readonly autoDetected: boolean;
}

export default function LintResults({ report, autoDetected }: LintResultsProps) {
    const [showPassed, setShowPassed] = useState(false);

    if (report.isCaCertificate) {
        return (
            <div role="status" style={{ padding: '1rem', borderRadius: '8px', background: TONES.info.background, color: TONES.info.color }}>
                This is a CA certificate. The linter checks server (end-entity) certificates only.
            </div>
        );
    }

    const summary = summarize(report);
    const issues = report.results
        .filter((r): r is Extract<CheckResult, { status: 'issue' }> => r.status === 'issue')
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const others = report.results.filter(r => r.status !== 'issue');

    return (
        <div data-testid="lint-results">
            <div data-testid="lint-profile" style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Profile: <strong style={{ color: 'var(--text-color)' }}>{PROFILE_LABELS[report.profile]}</strong>
                {autoDetected && ' (auto-detected)'}
            </div>
            {autoDetected && report.detectedProfile === 'private' && (
                <p data-testid="lint-profile-hint" style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '-0.5rem 0 0.75rem' }}>
                    No CA/B Forum policy OID was found, so only rules enforced by browsers and operating systems were
                    applied. If this certificate is from a public CA, select &quot;Public CA&quot; to check the Baseline Requirements.
                </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <SummaryChip kind="error" label="Errors" count={summary.error} />
                <SummaryChip kind="warn" label="Warnings" count={summary.warn} />
                <SummaryChip kind="info" label="Info" count={summary.info} />
                <SummaryChip kind="pass" label="Passed" count={summary.pass} />
            </div>
            {issues.length === 0 ? (
                <p style={{ color: TONES.pass.color, margin: '0 0 1rem' }}>No issues found.</p>
            ) : (
                <ul data-testid="lint-issues" style={{ padding: 0, margin: '0 0 1rem' }}>
                    {issues.map(r => <ResultItem key={r.id} result={r} />)}
                </ul>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                    type="checkbox"
                    checked={showPassed}
                    onChange={e => setShowPassed(e.target.checked)}
                    style={{ width: 'auto' }}
                />
                Show passed and N/A checks ({others.length})
            </label>
            {showPassed && (
                <ul style={{ padding: 0, marginTop: '0.75rem' }}>
                    {others.map(r => <ResultItem key={r.id} result={r} />)}
                </ul>
            )}
        </div>
    );
}
