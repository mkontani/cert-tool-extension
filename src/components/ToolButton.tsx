import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';

interface ToolButtonProps {
    readonly icon: ReactNode;
    readonly label: string;
    readonly busyLabel: string;
    readonly busy: boolean;
    /** What the button does; shown in a tooltip on hover or keyboard focus, and read out as the button's description. */
    readonly hint: string;
    readonly error: string | null;
    readonly onClick: () => void;
}

/**
 * Escape hides a showing tooltip without moving the pointer or focus (WCAG 1.4.13).
 * Handling the key keeps the popup open; when no tooltip is showing, Escape is left alone and closes the popup as usual.
 */
function useEscapeToDismiss(tip: React.RefObject<HTMLElement | null>): readonly [boolean, () => void] {
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !tip.current || getComputedStyle(tip.current).visibility !== 'visible') return;
            event.preventDefault();
            setDismissed(true);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [tip]);
    return [dismissed, () => setDismissed(false)];
}

/**
 * A full-width action button for the Inspector's page tools, with its explanation in a tooltip.
 * The info icon only invites hovering: it is not a control, so clicking it cannot start the action by mistake.
 */
export default function ToolButton({ icon, label, busyLabel, busy, hint, error, onClick }: ToolButtonProps) {
    const hintId = useId();
    const tipRef = useRef<HTMLParagraphElement>(null);
    const [dismissed, undismiss] = useEscapeToDismiss(tipRef);
    return (
        <div>
            {/* The tooltip is placed against this box, so an error below it does not push the tooltip down. */}
            <div className="tool-anchor" data-dismissed={dismissed || undefined} onMouseLeave={undismiss} onBlur={undismiss}>
                <div className="tool-row">
                    <button className="btn-secondary tool-button" onClick={onClick} disabled={busy} aria-describedby={hintId}
                        style={{ cursor: busy ? 'progress' : 'pointer' }}>
                        {icon}
                        {busy ? busyLabel : label}
                    </button>
                    <span className="tool-info" aria-hidden="true"><Info size={16} /></span>
                </div>
                <p ref={tipRef} role="tooltip" id={hintId} className="tool-tip">{hint}</p>
            </div>
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
