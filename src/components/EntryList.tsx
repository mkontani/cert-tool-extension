import { nameFor } from '../inspector/format';
import type { DisplayEntry } from '../inspector/types';

const TYPE_COLORS: Readonly<Record<string, string>> = {
    DNS: '#67e8f9',
    IP: '#c4b5fd',
    Email: '#fcd34d',
    URI: '#86efac',
};

/** Badges share the width of the longest label (up to this many characters) so the values line up. */
const MAX_BADGE_CHARS = 12;

interface EntryListProps {
    readonly label: string;
    readonly entries: readonly DisplayEntry[];
}

export default function EntryList({ label, entries }: EntryListProps) {
    const badgeChars = Math.min(MAX_BADGE_CHARS, Math.max(...entries.map(entry => entry.type.length)));
    return (
        // role="list" keeps list semantics in Safari/VoiceOver despite list-style: none
        <ul role="list" aria-label={`${label} entries`} style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0 0' }}>
            {entries.map((entry, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', padding: '0.1rem 0' }}>
                    <span
                        style={{
                            flexShrink: 0, minWidth: `${badgeChars + 1}ch`, padding: '0 0.3rem', borderRadius: '4px', textAlign: 'center',
                            fontSize: '0.7rem', fontWeight: 600, color: nameFor(TYPE_COLORS, entry.type) ?? '#94a3b8',
                            background: 'rgba(255, 255, 255, 0.06)',
                        }}
                    >
                        {entry.type}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>{entry.value}</span>
                </li>
            ))}
        </ul>
    );
}
