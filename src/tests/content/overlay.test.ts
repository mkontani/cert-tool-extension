import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLOSE_DELAY_MS, createOverlay, OVERLAY_ATTRIBUTE, TOAST_MS, type Overlay } from '../../content/overlay';
import { BADGE_HEIGHT } from '../../content/styles';
import { certItem, csrItem, scanOf } from './pageFixtures';

let overlay: Overlay;
const el = (id: string) => document.getElementById(id) as HTMLElement;
const badges = () => [...overlay.root.querySelectorAll<HTMLButtonElement>('button.badge')];
const card = () => overlay.root.querySelector('[role="dialog"]');
const hover = (target: Element, type: 'mouseenter' | 'mouseleave') => target.dispatchEvent(new MouseEvent(type));
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
const HOST = `[${OVERLAY_ATTRIBUTE}]`;
/** jsdom has no layout: give an element a fixed box. Its viewport is 1024 × 768. */
const place = (target: Element, x: number, y: number, width: number, height: number) => {
    target.getBoundingClientRect = () => new DOMRect(x, y, width, height);
};
const VH = 768;

const CHAIN = scanOf([certItem({ state: 'valid', days: 90 }), certItem({ state: 'valid', days: 900 }, { label: 'Example CA' })]);

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<pre id="a">a</pre><pre id="b">b</pre>';
    overlay = createOverlay(document);
});

afterEach(() => {
    overlay.destroy();
    vi.useRealTimers();
});

describe('createOverlay', () => {
    it('attaches a single host next to the body, outside the page content', () => {
        const hosts = document.querySelectorAll(HOST);
        expect(hosts).toHaveLength(1);
        expect(hosts[0].parentElement).toBe(document.documentElement);
        expect(document.body.contains(hosts[0])).toBe(false);
        expect(overlay.host).toBe(hosts[0]);
    });

    it('uses a plain div, so the page cannot define the host as its own custom element', () => {
        expect(overlay.host.localName).toBe('div');
    });

    it('replaces a host left behind by an earlier copy of the content script', () => {
        const second = createOverlay(document);
        expect(document.querySelectorAll(HOST)).toHaveLength(1);
        expect(overlay.host.isConnected).toBe(false);
        second.destroy();
    });

    it('keeps its contents in a closed shadow root', () => {
        expect(overlay.host.shadowRoot).toBeNull();
        expect(overlay.root.querySelector('style')).not.toBeNull();
    });

    it('removes the host on destroy', () => {
        overlay.destroy();
        expect(document.querySelector(HOST)).toBeNull();
    });
});

describe('badges', () => {
    it('adds one badge per target with its summary', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }, { element: el('b'), scan: scanOf([csrItem()]) }]);
        const [chain, csr] = badges();
        expect(badges()).toHaveLength(2);
        expect(chain.textContent).toBe('example.com90d left+1');
        expect(chain.classList.contains('tone-ok')).toBe(true);
        expect(chain.getAttribute('aria-label')).toBe('Cert Tool: example.com, expires in 90 days, and 1 more. Show details');
        expect(chain.getAttribute('aria-expanded')).toBe('false');
        expect(csr.textContent).toBe('csr.exampleCSR');
    });

    it('replaces the previous badges', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }, { element: el('b'), scan: CHAIN }]);
        overlay.showBadges([{ element: el('b'), scan: CHAIN }]);
        expect(badges()).toHaveLength(1);
    });

    it('opens the card on hover and closes it shortly after the pointer leaves', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        const [badge] = badges();
        hover(badge, 'mouseenter');
        expect(card()?.querySelectorAll('section')).toHaveLength(2);
        expect(badge.getAttribute('aria-expanded')).toBe('true');
        hover(badge, 'mouseleave');
        expect(card()).not.toBeNull();
        vi.advanceTimersByTime(CLOSE_DELAY_MS);
        expect(card()).toBeNull();
        expect(badge.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps the card open while the pointer moves onto it', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        hover(badges()[0], 'mouseenter');
        hover(badges()[0], 'mouseleave');
        hover(card()!, 'mouseenter');
        vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
        expect(card()).not.toBeNull();
        hover(card()!, 'mouseleave');
        vi.advanceTimersByTime(CLOSE_DELAY_MS);
        expect(card()).toBeNull();
    });

    it('pins the card on click, so it stays after the pointer leaves', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        const [badge] = badges();
        badge.click();
        hover(badge, 'mouseleave');
        vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
        expect(card()).not.toBeNull();
        badge.click();
        expect(card()).toBeNull();
    });

    it('closes a pinned card with Escape, its close button, or a click elsewhere on the page', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        const [badge] = badges();

        badge.click();
        pressEscape();
        expect(card()).toBeNull();

        badge.click();
        (card()!.querySelector('button.close') as HTMLButtonElement).click();
        expect(card()).toBeNull();

        badge.click();
        card()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        expect(card()).not.toBeNull();
        el('b').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        expect(card()).toBeNull();
    });

    it('switches the card when another badge is hovered', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }, { element: el('b'), scan: scanOf([csrItem()]) }]);
        hover(badges()[0], 'mouseenter');
        hover(badges()[1], 'mouseenter');
        expect(overlay.root.querySelectorAll('[role="dialog"]')).toHaveLength(1);
        expect(card()?.querySelector('.title')?.textContent).toBe('csr.example');
    });
});

describe('badge layout', () => {
    it('sits at the bottom-right of its block', () => {
        place(el('a'), 100, 100, 400, 200);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        const [badge] = badges();
        expect(badge.hidden).toBe(false);
        expect(badge.style.top).toBe(`${300 - BADGE_HEIGHT - 6}px`);
        expect(badge.style.left).toBe('494px');
    });

    it('stays inside the viewport while a tall block scrolls past', () => {
        place(el('a'), 100, -500, 400, 2000);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        expect(badges()[0].style.top).toBe(`${VH - BADGE_HEIGHT - 6}px`);
    });

    it('is hidden while its block is out of the viewport', () => {
        place(el('a'), 100, VH + 50, 400, 200);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        expect(badges()[0].hidden).toBe(true);
    });

    it('is hidden when its block has scrolled out of an inner scroller', () => {
        document.body.innerHTML = '<div id="scroller" style="overflow: auto"><pre id="a">a</pre></div>';
        place(el('scroller'), 0, 0, 500, 100);
        place(el('a'), 0, 200, 500, 100);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        expect(badges()[0].hidden).toBe(true);
    });

    it('stays within the visible part of an inner scroller', () => {
        document.body.innerHTML = '<div id="scroller" style="overflow-y: scroll"><pre id="a">a</pre></div>';
        place(el('scroller'), 0, 0, 500, 100);
        place(el('a'), 0, 50, 500, 200);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        expect(badges()[0].hidden).toBe(false);
        expect(badges()[0].style.top).toBe(`${100 - BADGE_HEIGHT - 6}px`);
    });

    it('is hidden when the page hides its block', () => {
        place(el('a'), 100, 100, 400, 200);
        Object.assign(el('a'), { checkVisibility: () => false });
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        expect(badges()[0].hidden).toBe(true);
    });

    it('follows page changes, e.g. the block being removed by a single-page app', async () => {
        place(el('a'), 100, 100, 400, 200);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        el('a').remove();
        await Promise.resolve();
        vi.advanceTimersByTime(50);
        expect(badges()[0].hidden).toBe(true);
    });

    it('follows scrolling and closes the card once its block is out of view', () => {
        place(el('a'), 100, 100, 400, 200);
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        hover(badges()[0], 'mouseenter');
        expect(card()).not.toBeNull();
        place(el('a'), 100, -400, 400, 200);
        window.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(50);
        expect(badges()[0].hidden).toBe(true);
        expect(card()).toBeNull();
    });
});

describe('card position', () => {
    const shownAt = (x: number, y: number, width: number, height: number) => {
        overlay.showCardAt(new DOMRect(x, y, width, height), scanOf([csrItem()]));
        const { top, bottom, maxHeight } = (card() as HTMLElement).style;
        return { top, bottom, maxHeight };
    };

    it('opens below an anchor near the top', () => {
        expect(shownAt(100, 100, 200, 20)).toEqual({ top: '126px', bottom: '', maxHeight: `${VH - 126 - 8}px` });
    });

    it('opens above an anchor near the bottom', () => {
        expect(shownAt(100, 700, 200, 20)).toEqual({ top: '', bottom: `${VH - 700 + 6}px`, maxHeight: `${700 - 6 - 8}px` });
    });

    it('stays on screen when the anchor starts above the viewport', () => {
        expect(shownAt(100, -300, 200, 20)).toEqual({ top: '8px', bottom: '', maxHeight: `${VH - 16}px` });
    });

    it('fills the viewport when the anchor is taller than it, e.g. a long selected chain', () => {
        expect(shownAt(100, -200, 200, 1200)).toEqual({ top: '8px', bottom: '', maxHeight: `${VH - 16}px` });
    });
});

describe('showCardAt', () => {
    it('shows a pinned card for a selection', () => {
        overlay.showCardAt(new DOMRect(10, 10, 100, 20), scanOf([csrItem()]));
        vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
        expect(card()?.querySelector('.title')?.textContent).toBe('csr.example');
        pressEscape();
        expect(card()).toBeNull();
    });
});

describe('toast', () => {
    it('shows a status message for a few seconds', () => {
        overlay.toast('Found 2 certificates');
        const status = overlay.root.querySelector('[role="status"]');
        expect(status?.textContent).toBe('Found 2 certificates');
        vi.advanceTimersByTime(TOAST_MS);
        expect(overlay.root.querySelector('[role="status"]')).toBeNull();
    });

    it('replaces an earlier message', () => {
        overlay.toast('first');
        overlay.toast('second');
        expect([...overlay.root.querySelectorAll('[role="status"]')].map(s => s.textContent)).toEqual(['second']);
    });
});

describe('clear', () => {
    it('removes badges, the card and the toast but keeps the host', () => {
        overlay.showBadges([{ element: el('a'), scan: CHAIN }]);
        badges()[0].click();
        overlay.toast('hello');
        overlay.clear();
        expect(badges()).toHaveLength(0);
        expect(card()).toBeNull();
        expect(overlay.root.querySelector('[role="status"]')).toBeNull();
        expect(document.querySelector(HOST)).not.toBeNull();
    });
});
