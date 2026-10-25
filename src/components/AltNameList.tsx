export interface AltNameEntry {
    readonly type: string;
    readonly value: string;
}

const TYPE_COLORS: Readonly<Record<string, string>> = {
    DNS: '#67e8f9',
    IP: '#c4b5fd',
    Email: '#fcd34d',
    URI: '#86efac',
};

interface AltNameListProps {
    readonly label: string;
    readonly entries: readonly AltNameEntry[];
}

export default function AltNameList({ label, entries }: AltNameListProps) {
    return (
        // role="list" keeps list semantics in Safari/VoiceOver despite list-style: none
        <ul role="list" aria-label={`${label} entries`} style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0 0' }}>
            {entries.map((entry, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', padding: '0.1rem 0' }}>
                    <span
                        style={{
                            flexShrink: 0, minWidth: '2.75rem', padding: '0 0.3rem', borderRadius: '4px', textAlign: 'center',
                            fontSize: '0.7rem', fontWeight: 600, color: TYPE_COLORS[entry.type] ?? '#94a3b8',
                            background: 'rgba(255, 255, 255, 0.06)',
                        }}
                    >
                        {entry.type}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{entry.value}</span>
                </li>
            ))}
        </ul>
    );
}
