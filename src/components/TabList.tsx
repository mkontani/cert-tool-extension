import { useRef, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { tabId, tabPanelId } from './tabIds';

export interface TabSpec {
    /** Names the tab and its panel: "tab-<id>" and "panel-<id>". */
    readonly id: string;
    readonly label: string;
    readonly icon: LucideIcon;
}

interface TabListProps {
    /** What the tabs choose between, for screen readers, e.g. "Tools". */
    readonly label: string;
    readonly tabs: readonly TabSpec[];
    readonly active: number;
    readonly onSelect: (index: number) => void;
    /** "tabs" for the tools across the top, "subtabs" for a choice inside one tool. */
    readonly variant: 'tabs' | 'subtabs';
}

/** The tab the arrow keys, Home and End move to (WAI-ARIA tabs pattern), wrapping around at either end. */
function tabAfterKey(key: string, current: number, count: number): number | undefined {
    switch (key) {
        case 'ArrowRight': return (current + 1) % count;
        case 'ArrowLeft': return (current - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return undefined;
    }
}

/**
 * A row of tabs that follows the WAI-ARIA tabs pattern: only the selected tab is in the Tab order,
 * and the arrow keys, Home and End select another and move focus to it. The caller renders the panels,
 * each with the attributes tabPanelProps gives.
 */
export default function TabList({ label, tabs, active, onSelect, variant }: TabListProps) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const tabClass = variant === 'tabs' ? 'tab' : 'subtab';

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // With Alt, Ctrl or Cmd the keys belong to the browser, e.g. Alt+Left for back.
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const next = tabAfterKey(event.key, active, tabs.length);
        if (next === undefined) return;
        event.preventDefault();
        onSelect(next);
        buttons.current[next]?.focus();
    };

    return (
        <div className={variant} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
            {tabs.map(({ id, label: tabLabel, icon: Icon }, i) => (
                <button
                    key={id}
                    ref={el => { buttons.current[i] = el; }}
                    type="button"
                    role="tab"
                    id={tabId(id)}
                    aria-selected={i === active}
                    aria-controls={tabPanelId(id)}
                    tabIndex={i === active ? 0 : -1}
                    className={`${tabClass} ${i === active ? 'active' : ''}`}
                    onClick={() => onSelect(i)}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Icon size={16} aria-hidden />
                        <span>{tabLabel}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}
