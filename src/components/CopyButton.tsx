import { AlertCircle, Check, Copy } from 'lucide-react';
import { capitalized, OUTCOME_SHOWN_MS } from './outcomes';
import { useShownOutcome } from './useShownOutcome';

interface CopyButtonProps {
    readonly text: string;
    /** What is copied, in lowercase, e.g. "private key": names the button and the messages. */
    readonly label: string;
    /** Defaults to navigator.clipboard, which is missing outside a secure context. */
    readonly clipboard?: Pick<Clipboard, 'writeText'> | null;
}

/**
 * Copies text to the clipboard and says whether it worked. Chrome refuses the write when the popup is not focused,
 * so a failure is shown instead of being swallowed, and both outcomes are announced to screen readers.
 */
export default function CopyButton({ text, label, clipboard = navigator.clipboard }: CopyButtonProps) {
    const [outcome, show] = useShownOutcome(OUTCOME_SHOWN_MS);
    const state = outcome ?? 'idle';

    const copy = async () => {
        try {
            if (!clipboard) throw new Error('The clipboard is not available here.');
            await clipboard.writeText(text);
            show('done');
        } catch (e: unknown) {
            console.warn('Cert Tool: could not copy to the clipboard', e);
            show('failed');
        }
    };

    const status = {
        idle: '',
        done: `${capitalized(label)} copied to the clipboard.`,
        failed: `Couldn't copy the ${label}. Select the text and copy it yourself.`,
    }[state];

    return (
        <>
            {/* The failure is explained on hover too, since the status below is for screen readers only. */}
            <button type="button" className="btn-secondary btn-small" data-state={state} aria-label={`Copy ${label}`}
                title={state === 'failed' ? status : undefined} onClick={copy}>
                {state === 'done' ? <Check size={14} aria-hidden /> : state === 'failed' ? <AlertCircle size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                <span>{state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
            </button>
            <span role="status" className="visually-hidden">{status}</span>
        </>
    );
}
