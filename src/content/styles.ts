/** Height of a badge in px; the overlay uses it to keep badges inside the visible part of their block. */
export const BADGE_HEIGHT = 24;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Styles for the overlay's shadow root. Dark, like the popup, so it reads the same on any page. */
export const OVERLAY_CSS = `
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.tone-ok { --tone: #34d399; }
.tone-warn { --tone: #fbbf24; }
.tone-bad { --tone: #f87171; }
.tone-info { --tone: #22d3ee; }
.tone-error { --tone: #94a3b8; }

.badge {
    position: fixed; display: inline-flex; align-items: center; gap: 6px;
    height: ${BADGE_HEIGHT}px; max-width: 320px; margin: 0; padding: 0 10px 0 8px;
    border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 999px;
    background: rgba(15, 23, 42, 0.94); color: #e2e8f0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    font: 600 12px/1 ${FONT}; white-space: nowrap; cursor: pointer; transform: translateX(-100%);
}
.badge:hover, .badge[aria-expanded="true"] { border-color: #06b6d4; }
.badge:focus-visible { outline: 2px solid #06b6d4; outline-offset: 2px; }
.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--tone); }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.detail { flex: none; color: var(--tone); }
.more { flex: none; color: #94a3b8; }

.card {
    position: fixed; width: min(440px, calc(100vw - 16px)); overflow: auto;
    border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 10px;
    background: #0f172a; color: #e2e8f0; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    font: 12px/1.45 ${FONT}; text-align: left;
}
.card:focus { outline: none; }
.card-head {
    position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px 6px 12px; background: #111c33; border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}
.disclaimer { margin: 0; padding: 6px 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); color: #94a3b8; font-size: 11px; }
.brand { color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.close {
    all: unset; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px;
    color: #94a3b8; font: 18px/1 ${FONT}; cursor: pointer;
}
.close:hover { background: rgba(148, 163, 184, 0.15); color: #e2e8f0; }
.close:focus-visible { outline: 2px solid #06b6d4; }
section { padding: 10px 12px; }
section + section { border-top: 1px solid rgba(148, 163, 184, 0.15); }
.item-head { display: flex; gap: 8px; color: #94a3b8; font-size: 11px; }
.index { font-variant-numeric: tabular-nums; }
.title { margin: 2px 0 4px; font-size: 14px; font-weight: 700; word-break: break-word; }
.validity { margin: 0 0 8px; color: var(--tone); font-weight: 600; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
dt { color: #94a3b8; }
dd { margin: 0; min-width: 0; word-break: break-word; }
.mono { font-family: ${MONO}; word-break: break-all; }
.exts-title { margin: 10px 0 4px; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ext { margin-bottom: 6px; padding-left: 8px; border-left: 2px solid rgba(148, 163, 184, 0.2); }
.ext-name { font-weight: 600; }
.crit { color: #fbbf24; font-size: 10px; text-transform: uppercase; }
.ext-value { opacity: 0.85; word-break: break-all; }
ul { margin: 2px 0 0; padding: 0; list-style: none; }
li { display: flex; gap: 6px; word-break: break-all; }
.more-entries { color: #94a3b8; font-style: italic; }
.type { flex: none; padding: 0 4px; border-radius: 4px; background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-size: 10px; line-height: 16px; }
.error { margin: 4px 0 0; color: #fca5a5; }
.note { margin: 0; padding: 8px 12px; border-top: 1px solid rgba(148, 163, 184, 0.15); color: #94a3b8; }

.toast {
    position: fixed; top: 16px; right: 16px; max-width: min(360px, calc(100vw - 32px)); padding: 10px 14px;
    border: 1px solid rgba(6, 182, 212, 0.5); border-radius: 10px; background: #0f172a; color: #e2e8f0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); font: 13px/1.4 ${FONT};
}
.toast::before { content: "Cert Tool"; margin-right: 8px; color: #22d3ee; font-weight: 700; }

@media (prefers-reduced-motion: no-preference) {
    .card, .toast { animation: cert-tool-appear 0.12s ease-out; }
}
@keyframes cert-tool-appear { from { opacity: 0; } }
`;
