import { AlertCircle, Check, Download } from 'lucide-react';
import { capitalized, OUTCOME_SHOWN_MS } from './outcomes';
import { saveTextFile, type SaveOutcome, type SaveRequest } from './saveFile';
import { useShownOutcome } from './useShownOutcome';

interface SaveButtonProps {
    readonly text: string;
    /** What is saved, in lowercase, e.g. "private key": names the button, the file type and the messages. */
    readonly label: string;
    /** The name the save dialog suggests, e.g. "private.key". */
    readonly filename: string;
    /** The extensions the save dialog offers, e.g. [".key"]. */
    readonly extensions: readonly string[];
    readonly save?: (request: SaveRequest) => Promise<SaveOutcome>;
}

/**
 * Saves text to a file the user picks, and says whether it worked, also to screen readers.
 * A canceled save says nothing, and neither does one Chrome's downloads took, since Chrome shows how that went.
 */
export default function SaveButton({ text, label, filename, extensions, save = saveTextFile }: SaveButtonProps) {
    const [outcome, show] = useShownOutcome(OUTCOME_SHOWN_MS);
    const state = outcome ?? 'idle';

    const saveFile = async () => {
        try {
            const saved = await save({ text, filename, description: capitalized(label), extensions });
            if (saved === 'saved') show('done');
        } catch (e: unknown) {
            console.warn('Cert Tool: could not save the file', e);
            show('failed');
        }
    };

    const status = {
        idle: '',
        done: `${capitalized(label)} saved.`,
        failed: `Couldn't save the ${label}. Copy it instead.`,
    }[state];

    return (
        <>
            {/* The failure is explained on hover too, since the status below is for screen readers only. */}
            <button type="button" className="btn-secondary btn-small" data-state={state} aria-label={`Save ${label}`}
                title={state === 'failed' ? status : undefined} onClick={saveFile}>
                {state === 'done' ? <Check size={14} aria-hidden /> : state === 'failed' ? <AlertCircle size={14} aria-hidden /> : <Download size={14} aria-hidden />}
                <span>{state === 'done' ? 'Saved' : state === 'failed' ? 'Save failed' : 'Save'}</span>
            </button>
            <span role="status" className="visually-hidden">{status}</span>
        </>
    );
}
