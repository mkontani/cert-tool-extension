/**
 * Small DOM builder for the on-page UI. Content is only ever set with textContent:
 * everything shown comes from the page, so it must never be parsed as markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
    doc: Document,
    tag: K,
    className?: string,
    ...children: readonly (Node | string | undefined)[]
): HTMLElementTagNameMap[K] {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    for (const child of children) {
        if (child === undefined) continue;
        el.append(typeof child === 'string' ? doc.createTextNode(child) : child);
    }
    return el;
}

/**
 * Whether the page shows the element: not display:none, visibility:hidden or opacity:0 (on it or an ancestor).
 * Falls back to true where checkVisibility is missing (jsdom; Chrome has had it since 121).
 */
export function isShown(el: Element): boolean {
    return typeof el.checkVisibility !== 'function' || el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}
