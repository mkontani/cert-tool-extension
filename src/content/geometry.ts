/** Placement maths for the overlay, in viewport coordinates (as getBoundingClientRect returns them). */
import { BADGE_HEIGHT } from './styles';

export interface Rect {
    readonly top: number;
    readonly left: number;
    readonly bottom: number;
    readonly right: number;
}

export interface Viewport {
    readonly width: number;
    readonly height: number;
}

/** Space between a badge or card and what it points at. */
export const GAP = 6;
/** Space kept between the card and the viewport edges. */
export const MARGIN = 8;
/** Opens the card below its anchor whenever at least this much room is there. */
const MIN_ROOM_BELOW = 240;
/** Less room than this on a side, and the card does not open there. */
const MIN_CARD_HEIGHT = 120;

function intersect(a: Rect, b: Rect): Rect | undefined {
    const r = { top: Math.max(a.top, b.top), left: Math.max(a.left, b.left), bottom: Math.min(a.bottom, b.bottom), right: Math.min(a.right, b.right) };
    return r.top < r.bottom && r.left < r.right ? r : undefined;
}

/** The part of a block the user can see: inside the viewport and every scroller around it; undefined when none. */
export function visiblePart(target: Rect, clips: readonly Rect[], viewport: Viewport): Rect | undefined {
    const screen = { top: 0, left: 0, bottom: viewport.height, right: viewport.width };
    return [...clips, screen].reduce<Rect | undefined>((visible, clip) => visible && intersect(visible, clip), target);
}

/**
 * Bottom-right of the visible part of a block: clear of copy buttons, which usually sit top-right,
 * and still on screen while a tall block scrolls past. The badge is shifted left by its own width in CSS.
 */
export function badgePosition(visible: Rect): { readonly top: number; readonly left: number } {
    return { top: Math.max(visible.bottom - BADGE_HEIGHT - GAP, visible.top + GAP), left: visible.right - GAP };
}

export interface CardPlacement {
    readonly left: number;
    readonly top?: number;
    readonly bottom?: number;
    readonly maxHeight: number;
}

/**
 * Right-aligns the card with its anchor and opens it below, or above when there is more room there.
 * Always on screen: with no room on either side (e.g. a selection taller than the viewport) it covers the viewport.
 */
export function cardPlacement(anchor: Rect, width: number, viewport: Viewport): CardPlacement {
    const { width: vw, height: vh } = viewport;
    const left = Math.max(MARGIN, Math.min(anchor.right - width, vw - width - MARGIN));
    const roomBelow = vh - anchor.bottom - GAP - MARGIN;
    const roomAbove = anchor.top - GAP - MARGIN;
    if (roomBelow >= MIN_ROOM_BELOW || (roomBelow >= roomAbove && roomBelow >= MIN_CARD_HEIGHT)) {
        const top = Math.max(MARGIN, anchor.bottom + GAP);
        return { left, top, maxHeight: vh - top - MARGIN };
    }
    if (roomAbove >= MIN_CARD_HEIGHT) {
        const bottom = Math.max(MARGIN, vh - anchor.top + GAP);
        return { left, bottom, maxHeight: vh - bottom - MARGIN };
    }
    return { left, top: MARGIN, maxHeight: vh - 2 * MARGIN };
}
