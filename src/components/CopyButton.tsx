import { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';

type CopyState = 'idle' | 'copied' | 'failed';

/** How long the button shows how the copy went before it reads "Copy" again; a failure stays longer, since it asks for action. */
const SHOWN_MS: Readonly<Record<Exclude<CopyState, 'idle'>, number>> = { copied: 2000, failed: 4000 };

interface CopyButtonProps {
    readonly text: string;
    /** What is copied, in lowercase, e.g. "private key": names the button and the messages. */
    readonly label: string;
    /** Defaults to navigator.clipboard, which is missing outside a secure context. */
    readonly clipboard?: Pick<Clipboard, 'writeText'> | null;
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Copies text to the clipboard and says whether it worked. Chrome refuses the write when the popup is not focused,
 * so a failure is shown instead of being swallowed, and both outcomes are announced to screen readers.
 */
export default function CopyButton({ text, label, clipboard = navigator.clipboard }: CopyButtonProps) {
    /** Each click is a new attempt, so clicking again while "Copied" shows keeps it up for the full time again. */
    const [{ state, attempt }, setOutcome] = useState<{ readonly state: CopyState; readonly attempt: number }>({ state: 'idle', attempt: 0 });

    useEffect(() => {
        if (state === 'idle') return;
        const timer = setTimeout(() => setOutcome(current => ({ ...current, state: 'idle' })), SHOWN_MS[state]);
        return () => clearTimeout(timer);
    }, [state, attempt]);

    const copy = async () => {
        const finish = (outcome: CopyState) => setOutcome(current => ({ state: outcome, attempt: current.attempt + 1 }));
        try {
            if (!clipboard) throw new Error('The clipboard is not available here.');
            await clipboard.writeText(text);
            finish('copied');
        } catch (e: unknown) {
            console.warn('Cert Tool: could not copy to the clipboard', e);
            finish('failed');
        }
    };

    const status = {
        idle: '',
        copied: `${capitalized(label)} copied to the clipboard.`,
        failed: `Couldn't copy the ${label}. Select the text and copy it yourself.`,
    }[state];

    return (
        <>
            {/* The failure is explained on hover too, since the status below is for screen readers only. */}
            <button type="button" className="btn-secondary btn-small" data-state={state} aria-label={`Copy ${label}`}
                title={state === 'failed' ? status : undefined} onClick={copy}>
                {state === 'copied' ? <Check size={14} aria-hidden /> : state === 'failed' ? <AlertCircle size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                <span>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
            </button>
            <span role="status" className="visually-hidden">{status}</span>
        </>
    );
}
