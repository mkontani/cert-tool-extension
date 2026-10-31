import { useState } from 'react';
import { AlertCircle, ScanSearch } from 'lucide-react';
import { MSG_SCAN_PAGE } from '../page/messages';
import { describeScanError, runInTab, type InjectApi } from '../page/runInTab';

export interface ScanApi extends InjectApi {
    readonly tabs: Pick<typeof chrome.tabs, 'query' | 'sendMessage'>;
}

interface PageScanButtonProps {
    /** The chrome API; null outside the extension. Defaults to the global chrome object when it can inject scripts. */
    readonly api?: ScanApi | null;
    /** Called after a successful scan; closes the popup so the badges on the page are visible. */
    readonly onDone?: () => void;
}

function extensionApi(): ScanApi | null {
    if (typeof chrome === 'undefined') return null;
    // Typed as always present, but missing outside an extension page (e.g. the GitHub Pages demo).
    const maybe = chrome as Partial<Pick<typeof chrome, 'scripting' | 'tabs'>>;
    return maybe.scripting && maybe.tabs ? chrome : null;
}

const closePopup = () => window.close();

async function scanActiveTab(api: ScanApi): Promise<void> {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active tab.');
    await runInTab(api, tab.id, 0, { type: MSG_SCAN_PAGE });
}

/** Badges every certificate and CSR on the current page. Rendered only inside the extension. */
export default function PageScanButton({ api = extensionApi(), onDone = closePopup }: PageScanButtonProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!api) return null;

    const scan = async () => {
        setBusy(true);
        setError(null);
        try {
            await scanActiveTab(api);
            onDone();
        } catch (e: unknown) {
            setError(describeScanError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <button className="btn-secondary" onClick={scan} disabled={busy}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px', cursor: busy ? 'progress' : 'pointer' }}>
                <ScanSearch size={16} aria-hidden="true" />
                {busy ? 'Scanning…' : 'Scan this page'}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0.4rem 0 0' }}>
                Finds certificates and CSRs on the current page and marks them with badges you can hover. You can also right-click a selected PEM and pick “Inspect certificate with Cert Tool”.
            </p>
            {error && (
                <div role="alert" style={{
                    marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#fca5a5',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                }}><AlertCircle size={16} style={{ flex: 'none' }} /> {error}</div>
            )}
        </div>
    );
}
