import type { PageScan } from '../page/messages';
import { renderCard } from './card';
import { h, isShown } from './dom';
import { badgePosition, cardPlacement, visiblePart, type Viewport } from './geometry';
import { OVERLAY_CSS } from './styles';
import { badgeSummary } from './summary';

/** Marks the overlay host, so a host left behind by an earlier copy of the content script can be found and replaced. */
export const OVERLAY_ATTRIBUTE = 'data-cert-tool-overlay';
/** How long a hover card lingers after the pointer leaves, so it can be reached. */
export const CLOSE_DELAY_MS = 250;
export const TOAST_MS = 4000;

/** Inline and !important, which page stylesheets cannot override; `all: initial` also stops inherited styles. */
const HOST_STYLE = [
    'all: initial', 'display: block', 'position: fixed', 'top: 0', 'left: 0', 'width: 0', 'height: 0', 'z-index: 2147483647',
].map(rule => `${rule} !important`).join('; ');

/** A page element and the certificates found in it. */
export interface BadgeTarget {
    readonly element: HTMLElement;
    readonly scan: PageScan;
}

/** Where a card is shown: a fixed rectangle or one recomputed on scroll. */
export type Anchor = DOMRect | (() => DOMRect);

export interface Overlay {
    readonly host: HTMLElement;
    readonly root: ShadowRoot;
    /** Replaces the badges with one per target. */
    showBadges(targets: readonly BadgeTarget[]): void;
    /** Shows a pinned card, e.g. for the user's selection. */
    showCardAt(anchor: Anchor, scan: PageScan): void;
    toast(message: string): void;
    /** Removes badges, card and toast, keeping the host for the next scan. */
    clear(): void;
    destroy(): void;
}

interface Badge {
    readonly target: BadgeTarget;
    readonly button: HTMLButtonElement;
    /** Ancestors that clip the block when it scrolls (overflow other than visible). */
    readonly clips: readonly Element[];
}

interface OpenCard {
    readonly el: HTMLElement;
    readonly anchor: () => DOMRect;
    readonly badge: Badge | undefined;
    readonly pinned: boolean;
}

function renderBadge(doc: Document, scan: PageScan): HTMLButtonElement {
    const summary = badgeSummary(scan);
    const button = h(doc, 'button', `badge tone-${summary.tone}`,
        h(doc, 'span', 'dot'),
        h(doc, 'span', 'label', summary.label),
        summary.detail ? h(doc, 'span', 'detail', summary.detail) : undefined,
        summary.more > 0 ? h(doc, 'span', 'more', `+${summary.more}`) : undefined);
    button.type = 'button';
    button.setAttribute('aria-label', `Cert Tool: ${summary.description}. Show details`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    return button;
}

/** <html> and <body> are left out: their overflow usually scrolls the viewport rather than clipping. */
function clippingAncestors(el: Element, view: Window): Element[] {
    const doc = el.ownerDocument;
    const clips: Element[] = [];
    for (let a = el.parentElement; a && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
        const { overflowX, overflowY } = view.getComputedStyle(a);
        if (overflowX !== 'visible' || overflowY !== 'visible') clips.push(a);
    }
    return clips;
}

function createHost(doc: Document): HTMLElement {
    for (const stale of doc.documentElement.querySelectorAll(`:scope > [${OVERLAY_ATTRIBUTE}]`)) stale.remove();
    // A plain div: a custom element name could be defined by the page, which would then run its own code on the host.
    const host = doc.createElement('div');
    host.setAttribute(OVERLAY_ATTRIBUTE, '');
    host.setAttribute('style', HOST_STYLE);
    return host;
}

/**
 * The extension's on-page UI: badges on blocks of certificates, the details card, and status toasts.
 * Lives in a closed shadow root on a host outside <body>, positioned over the page rather than inserted into it,
 * so the page's own DOM (often owned by a framework) is never modified.
 */
export function createOverlay(doc: Document): Overlay {
    const view = doc.defaultView ?? window;
    const host = createHost(doc);
    const root = host.attachShadow({ mode: 'closed' });
    const layer = h(doc, 'div', 'layer');
    root.append(h(doc, 'style', undefined, OVERLAY_CSS), layer);
    doc.documentElement.append(host);

    let badges: readonly Badge[] = [];
    let card: OpenCard | undefined;
    let toastEl: HTMLElement | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    // Badges follow their blocks through scrolling (listeners below), size changes, and page changes such as
    // images loading above a block or a single-page app replacing it.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => requestLayout());
    const mutationObserver = new MutationObserver(() => requestLayout());

    const viewport = (): Viewport => ({ width: doc.documentElement.clientWidth || view.innerWidth, height: view.innerHeight });

    function cancelClose() {
        clearTimeout(closeTimer);
        closeTimer = undefined;
    }

    function closeCard() {
        cancelClose();
        if (!card) return;
        card.el.remove();
        card.badge?.button.setAttribute('aria-expanded', 'false');
        card = undefined;
    }

    function scheduleClose() {
        cancelClose();
        closeTimer = setTimeout(closeCard, CLOSE_DELAY_MS);
    }

    function positionCard({ el, anchor }: OpenCard) {
        const { left, top, bottom, maxHeight } = cardPlacement(anchor(), el.offsetWidth, viewport());
        el.style.left = `${left}px`;
        el.style.top = top === undefined ? '' : `${top}px`;
        el.style.bottom = bottom === undefined ? '' : `${bottom}px`;
        el.style.maxHeight = `${maxHeight}px`;
    }

    function openCard(scan: PageScan, anchor: () => DOMRect, badge: Badge | undefined, pinned: boolean) {
        closeCard();
        const el = renderCard(doc, scan, { onClose: closeCard });
        el.addEventListener('mouseenter', cancelClose);
        el.addEventListener('mouseleave', () => { if (!card?.pinned) scheduleClose(); });
        layer.append(el);
        badge?.button.setAttribute('aria-expanded', 'true');
        card = { el, anchor, badge, pinned };
        positionCard(card);
        if (pinned) el.focus({ preventScroll: true });
    }

    function layoutBadges() {
        const vp = viewport();
        for (const { target, button, clips } of badges) {
            const { element } = target;
            const visible = element.isConnected && isShown(element)
                ? visiblePart(element.getBoundingClientRect(), clips.map(c => c.getBoundingClientRect()), vp)
                : undefined;
            button.hidden = !visible;
            if (!visible) continue;
            const { top, left } = badgePosition(visible);
            button.style.top = `${top}px`;
            button.style.left = `${left}px`;
        }
    }

    function layout() {
        layoutBadges();
        if (!card) return;
        if (card.badge?.button.hidden) closeCard();
        else positionCard(card);
    }

    function requestLayout() {
        if (frame !== undefined) return;
        const run = () => {
            frame = undefined;
            layout();
        };
        frame = typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame(run) : view.setTimeout(run, 16);
    }

    function cancelLayout() {
        if (frame === undefined) return;
        if (typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(frame);
        else view.clearTimeout(frame);
        frame = undefined;
    }

    function addBadge(target: BadgeTarget): Badge {
        const badge: Badge = { target, button: renderBadge(doc, target.scan), clips: clippingAncestors(target.element, view) };
        const { button } = badge;
        const anchor = () => button.getBoundingClientRect();
        button.addEventListener('mouseenter', () => {
            cancelClose();
            if (card?.badge === badge || card?.pinned) return;
            openCard(target.scan, anchor, badge, false);
        });
        button.addEventListener('mouseleave', () => { if (!card?.pinned) scheduleClose(); });
        button.addEventListener('click', () => {
            if (card?.badge !== badge) openCard(target.scan, anchor, badge, true);
            else if (card.pinned) closeCard();
            else {
                card = { ...card, pinned: true };
                card.el.focus({ preventScroll: true });
            }
        });
        layer.append(button);
        resizeObserver?.observe(target.element);
        return badge;
    }

    function removeBadges() {
        closeCard();
        for (const { button } of badges) button.remove();
        badges = [];
        resizeObserver?.disconnect();
        mutationObserver.disconnect();
        cancelLayout();
    }

    function removeToast() {
        clearTimeout(toastTimer);
        toastEl?.remove();
        toastEl = undefined;
    }

    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && card) closeCard(); };
    const onMouseDown = (e: MouseEvent) => { if (card?.pinned && !e.composedPath().includes(host)) closeCard(); };
    const listenerOptions = { capture: true, passive: true } as const;
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('mousedown', onMouseDown, true);
    view.addEventListener('scroll', requestLayout, listenerOptions);
    view.addEventListener('resize', requestLayout, listenerOptions);

    function clear() {
        removeBadges();
        removeToast();
    }

    return {
        host,
        root,
        showBadges(targets) {
            removeBadges();
            badges = targets.map(addBadge);
            if (badges.length > 0) {
                resizeObserver?.observe(doc.documentElement);
                mutationObserver.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
            }
            layoutBadges();
        },
        showCardAt(anchor, scan) {
            openCard(scan, typeof anchor === 'function' ? anchor : () => anchor, undefined, true);
        },
        toast(message) {
            removeToast();
            const el = h(doc, 'div', 'toast', message);
            el.setAttribute('role', 'status');
            layer.append(el);
            toastEl = el;
            toastTimer = setTimeout(removeToast, TOAST_MS);
        },
        clear,
        destroy() {
            clear();
            doc.removeEventListener('keydown', onKeyDown, true);
            doc.removeEventListener('mousedown', onMouseDown, true);
            view.removeEventListener('scroll', requestLayout, listenerOptions);
            view.removeEventListener('resize', requestLayout, listenerOptions);
            host.remove();
        },
    };
}
