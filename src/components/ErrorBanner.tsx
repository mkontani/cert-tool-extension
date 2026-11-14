import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

/** An error shown in a tool's panel, announced to screen readers as soon as it appears. */
export default function ErrorBanner({ children }: { readonly children: ReactNode }) {
    return (
        <div role="alert" className="error-banner">
            <AlertCircle size={18} aria-hidden style={{ flex: 'none' }} /> {children}
        </div>
    );
}
