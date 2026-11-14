import { useCallback, useEffect, useState } from 'react';

/**
 * An outcome a button shows for a while, such as "Copied", before it reads as before again.
 * Each outcome shown is a new attempt, so showing one again while it is up keeps it up for the full time again.
 * @param shownMs How long each outcome stays up. It must not change between renders, e.g. a module constant.
 * @returns The outcome on show, or null, and a function that shows one.
 */
export function useShownOutcome<Outcome extends string>(shownMs: Readonly<Record<Outcome, number>>): readonly [Outcome | null, (outcome: Outcome) => void] {
    const [{ outcome, attempt }, setShown] = useState<{ readonly outcome: Outcome | null; readonly attempt: number }>({ outcome: null, attempt: 0 });

    useEffect(() => {
        if (outcome === null) return;
        const timer = setTimeout(() => setShown(current => ({ ...current, outcome: null })), shownMs[outcome]);
        return () => clearTimeout(timer);
    }, [outcome, attempt, shownMs]);

    const show = useCallback((next: Outcome) => setShown(current => ({ outcome: next, attempt: current.attempt + 1 })), []);
    return [outcome, show];
}
