import { AlertTriangle, Lock } from 'lucide-react';
import { describeConnection } from '../site/display';
import type { SiteCertificates } from '../site/messages';

interface SiteSummaryProps {
    readonly site: SiteCertificates;
    /** Whether the chain ends at a self-issued root; Chrome leaves the root out for some sites. */
    readonly endsAtRoot: boolean;
}

/** The host of an https:// origin, e.g. "www.example.com". */
const hostOf = (origin: string): string => origin.slice('https://'.length);

function TrustNote({ site, endsAtRoot }: SiteSummaryProps) {
    if (!site.trusted) {
        return (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fcd34d', marginTop: '0.4rem' }}>
                <AlertTriangle size={14} aria-hidden="true" style={{ flex: 'none' }} />
                Chrome did not accept this certificate. You may have clicked past a security warning for this site.
            </div>
        );
    }
    return (
        <div style={{ color: '#94a3b8', marginTop: '0.4rem' }}>
            {endsAtRoot
                ? 'Verified by Chrome, from the leaf up to a root it trusts.'
                : 'Verified by Chrome. Its chain for this site stops below the root, so the root certificate is not listed.'}
        </div>
    );
}

/** What the chain below belongs to: the site, how its connection is secured, and whether Chrome accepted the certificate. */
export default function SiteSummary({ site, endsAtRoot }: SiteSummaryProps) {
    const host = hostOf(site.origin);
    return (
        <section aria-label={`Certificate of ${host}`} style={{
            marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px',
            background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.25)', fontSize: '0.85rem',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'white', wordBreak: 'break-all' }}>
                <Lock size={16} color="#06b6d4" aria-hidden="true" style={{ flex: 'none' }} /> {host}
            </div>
            <div style={{ color: '#cbd5e1', marginTop: '0.25rem' }}>{describeConnection(site.connection)}</div>
            {site.via === 'cert-tool' && (
                <div style={{ color: '#94a3b8', marginTop: '0.25rem' }}>
                    Read over Cert Tool's own connection to the site, since another extension's frame on this page keeps Cert Tool out of the tab.
                </div>
            )}
            <TrustNote site={site} endsAtRoot={endsAtRoot} />
        </section>
    );
}
