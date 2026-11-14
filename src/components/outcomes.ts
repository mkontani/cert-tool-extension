/** How a copy or save went, while its button shows it. */
export type ButtonOutcome = 'done' | 'failed';

/** How long a button shows how it went before it reads as before again; a failure stays longer, since it asks for action. */
export const OUTCOME_SHOWN_MS: Readonly<Record<ButtonOutcome, number>> = { done: 2000, failed: 4000 };

/** "private key" → "Private key". */
export const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
