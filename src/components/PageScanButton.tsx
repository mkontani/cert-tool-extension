import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { MSG_SCAN_PAGE } from '../page/messages';
import { describeScanError, runInTab, type InjectApi } from '../page/runInTab';
import ToolButton from './ToolButton';

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

const HINT = 'Finds certificates and CSRs on the current page and marks them with badges you can hover. You can also right-click a selected PEM and pick “Inspect certificate with Cert Tool”.';

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
        <ToolButton icon={<ScanSearch size={16} aria-hidden="true" />} label="Scan this page" busyLabel="Scanning…"
            busy={busy} hint={HINT} error={error} onClick={scan} />
    );
}
