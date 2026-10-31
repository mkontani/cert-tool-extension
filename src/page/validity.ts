/** Where "now" falls in a certificate's validity period. */
export type ValidityState = 'valid' | 'expiring' | 'expired' | 'not-yet-valid';

export interface Validity {
    readonly state: ValidityState;
    /** Whole days left (valid, expiring), since expiry (expired), or until it starts (not-yet-valid). */
    readonly days: number;
}

/** Fewer days left than this, and the certificate is flagged as expiring. */
export const EXPIRING_SOON_DAYS = 30;

const DAY_MS = 86_400_000;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/**
 * Works out the validity state from the dates the Inspector shows.
 * They come from Date#toUTCString, which Date.parse is required to read back exactly.
 */
export function validityOf(notBefore: string | undefined, notAfter: string | undefined, now: number): Validity | undefined {
    const start = Date.parse(notBefore ?? '');
    const end = Date.parse(notAfter ?? '');
    if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
    if (now < start) return { state: 'not-yet-valid', days: Math.ceil((start - now) / DAY_MS) };
    // RFC 5280: the validity period includes notAfter itself.
    if (now > end) return { state: 'expired', days: Math.floor((now - end) / DAY_MS) };
    const days = Math.floor((end - now) / DAY_MS);
    return { state: days < EXPIRING_SOON_DAYS ? 'expiring' : 'valid', days };
}

/** A sentence for the details card, e.g. "Expires in 23 days". */
export function describeValidity({ state, days }: Validity): string {
    switch (state) {
        case 'valid':
        case 'expiring':
            return days === 0 ? 'Expires in less than a day' : `Expires in ${plural(days, 'day')}`;
        case 'expired':
            return days === 0 ? 'Expired less than a day ago' : `Expired ${plural(days, 'day')} ago`;
        case 'not-yet-valid':
            return `Becomes valid in ${plural(days, 'day')}`;
    }
}

/** A few characters for the on-page badge, e.g. "23d left". */
export function shortValidity({ state, days }: Validity): string {
    switch (state) {
        case 'valid':
        case 'expiring':
            return days === 0 ? '<1d left' : `${days}d left`;
        case 'expired':
            return 'expired';
        case 'not-yet-valid':
            return 'not yet valid';
    }
}
