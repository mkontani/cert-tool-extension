export const DAY_MS = 86_400_000;

/** Fewer days left than this, and a certificate is flagged as expiring soon. */
export const EXPIRING_SOON_DAYS = 30;

/**
 * Whether a certificate with this much time left is expiring soon: fewer than EXPIRING_SOON_DAYS whole days.
 * The one rule for the page badges, the Inspector's chain diagram and the linter, so they never disagree at the boundary.
 */
export const isExpiringSoon = (remainingMs: number): boolean => remainingMs < EXPIRING_SOON_DAYS * DAY_MS;
