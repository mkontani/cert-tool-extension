import { useState } from 'react';
import { Lock } from 'lucide-react';
import { isSiteCertsReply, MSG_FETCH_SITE_CERTS, NOT_HTTPS, type SiteCertificates, type SiteCertsReply } from '../site/messages';
import ToolButton from './ToolButton';

export interface SiteCertApi {
    readonly tabs: Pick<typeof chrome.tabs, 'query'>;
    readonly runtime: Pick<typeof chrome.runtime, 'sendMessage'>;
}

interface SiteCertButtonProps {
    /** The chrome API; null outside the extension. Defaults to the global chrome object when it can message the background worker. */
    readonly api?: SiteCertApi | null;
    readonly onLoad: (site: SiteCertificates) => void;
}

function extensionApi(): SiteCertApi | null {
    if (typeof chrome === 'undefined') return null;
    // Web pages can see a partial chrome object (e.g. the GitHub Pages demo), but never chrome.tabs.
    const maybe = chrome as Partial<Pick<typeof chrome, 'runtime' | 'tabs'>>;
    return maybe.tabs && maybe.runtime?.sendMessage ? chrome : null;
}

/** True for a tab URL that cannot have a certificate (http:, file:, chrome: ...); false when it is HTTPS or unknown. */
const isKnownNotHttps = (url: string | undefined): boolean => url !== undefined && !url.startsWith('https://');

const HINT = 'Shows the chain Chrome verified for the site in the current tab, from the leaf to the root. To read it, the tab sends the site a HEAD request without cookies, or Cert Tool sends it itself when another extension’s frame on the page blocks the tab. Chrome briefly shows a “started debugging this browser” bar.';

const failureMessage = (message: string) => `Couldn't read this site's certificate: ${message}`;
const failed = (message: string): SiteCertsReply => ({ ok: false, error: failureMessage(message) });

async function readActiveTabSite(api: SiteCertApi): Promise<SiteCertsReply> {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return failed('No active tab.');
    // Spares the debugger bar for pages that cannot have a certificate. The background worker checks again.
    if (isKnownNotHttps(tab.url)) return { ok: false, error: NOT_HTTPS };
    const reply: unknown = await api.runtime.sendMessage({ type: MSG_FETCH_SITE_CERTS, tabId: tab.id });
    // The background worker's errors are already written for the user.
    return isSiteCertsReply(reply) ? reply : failed("Cert Tool's background worker gave no usable answer.");
}

/** Shows the certificate chain Chrome verified for the page in the current tab. Rendered only inside the extension. */
export default function SiteCertButton({ api = extensionApi(), onLoad }: SiteCertButtonProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!api) return null;

    const read = async () => {
        setBusy(true);
        setError(null);
        try {
            const outcome = await readActiveTabSite(api);
            if (outcome.ok) onLoad(outcome.site);
            else setError(outcome.error);
        } catch (e: unknown) {
            setError(failureMessage(e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ToolButton icon={<Lock size={16} aria-hidden="true" />} label="Show this site's certificate" busyLabel="Reading…"
            busy={busy} hint={HINT} error={error} onClick={read} />
    );
}
