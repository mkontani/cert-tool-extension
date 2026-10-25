interface ChainSelectorProps {
    readonly labels: readonly string[];
    readonly selected: number;
    readonly onSelect: (index: number) => void;
    /** id of the element that shows the selected certificate. */
    readonly controls: string;
}

/** Buttons for choosing one of several pasted certificates, e.g. the leaf and intermediates of a full chain. */
export default function ChainSelector({ labels, selected, onSelect, controls }: ChainSelectorProps) {
    return (
        <div role="group" aria-label="Certificates in the input" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
            {labels.map((label, i) => (
                <button
                    key={i}
                    type="button"
                    className={`tab ${i === selected ? 'active' : ''}`}
                    aria-pressed={i === selected}
                    aria-controls={controls}
                    aria-label={`${i + 1}: ${label}`}
                    title={label} // full text when the label is cut off with an ellipsis
                    onClick={() => onSelect(i)}
                    style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', maxWidth: '100%', fontSize: '0.8rem' }}
                >
                    <span aria-hidden style={{ fontWeight: 700, opacity: 0.7 }}>{i + 1}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                </button>
            ))}
        </div>
    );
}
