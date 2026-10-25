import { useState } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { inspect } from '../inspector/inspect';
import { findPemBlocks, MAX_PEM_BLOCKS, type PemBlock } from '../inspector/pem';
import type { InspectionResult } from '../inspector/types';
import ChainSelector from './ChainSelector';
import EntryList from './EntryList';

const entryCountLabel = (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`;

/** One pasted certificate or CSR: what it decoded to, or why it could not be read. */
type InspectedItem =
    | { readonly status: 'ok'; readonly label: string; readonly result: InspectionResult }
    | { readonly status: 'error'; readonly label: string; readonly error: string };

const UNREADABLE = '(unreadable)';
const OUTPUT_ID = 'inspector-output';

function parseFailure(e: unknown): string {
    console.error('Inspector parse error:', e);
    return `Failed to parse: ${e instanceof Error && e.message ? e.message : 'Unknown error'}`;
}

/** Decodes each block on its own, so one broken block does not hide the rest of a chain. */
function inspectBlock(block: PemBlock): InspectedItem {
    if ('error' in block) return { status: 'error', label: UNREADABLE, error: `Failed to parse: ${block.error}` };
    try {
        const result = inspect(block.der, block.kind);
        return { status: 'ok', label: block.kind === 'csr' ? `${result.label} (CSR)` : result.label, result };
    } catch (e: unknown) {
        return { status: 'error', label: UNREADABLE, error: parseFailure(e) };
    }
}

export default function CertInspector() {
    const [inputPem, setInputPem] = useState('');
    const [items, setItems] = useState<readonly InspectedItem[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [selected, setSelected] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const parseInput = () => {
        setError(null);
        setItems([]);
        setTruncated(false);
        setSelected(0);
        if (!inputPem.trim()) return;

        const scan = findPemBlocks(inputPem);
        if (scan.blocks.length === 0) {
            setError('Failed to parse: Unsupported format. Please feed a CERTIFICATE or CERTIFICATE REQUEST (CSR).');
            return;
        }
        setItems(scan.blocks.map(inspectBlock));
        setTruncated(scan.truncated);
    };

    const current = items[selected];
    const shownError = error ?? (current?.status === 'error' ? current.error : null);
    const info = current?.status === 'ok' ? current.result : null;

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <Search size={24} color="#06b6d4" />
                <h2 style={{ margin: 0 }}>Certificate Inspector</h2>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="inspector-input">Input (Certificate or CSR)</label>
                <textarea
                    id="inspector-input"
                    value={inputPem}
                    onChange={(e) => setInputPem(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                <button className="btn" onClick={parseInput} style={{ marginTop: '0.5rem', width: '100%' }}>Parse</button>
            </div>
            {items.length > 1 && (
                <ChainSelector labels={items.map(item => item.label)} selected={selected} onSelect={setSelected} controls={OUTPUT_ID} />
            )}
            {truncated && (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '-0.5rem 0 1rem' }}>Only the first {MAX_PEM_BLOCKS} blocks are listed.</p>
            )}
            <div id={OUTPUT_ID}>
                {shownError && (
                    <div role="alert" style={{
                        padding: '1rem', background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px',
                        color: '#fca5a5', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}><AlertCircle size={18} /> {shownError}</div>
                )}
                {info && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }} data-testid="inspector-results">
                        <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>{info.type}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr', gap: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                            {info.serial && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Serial Number:</strong><code style={{ wordBreak: 'break-all' }}>{info.serial}</code></>}
                            <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Subject:</strong><div style={{ wordBreak: 'break-word', color: '#e2e8f0' }}>{info.subject}</div>
                            {info.issuer && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Issuer:</strong><div style={{ wordBreak: 'break-word', color: '#e2e8f0' }}>{info.issuer}</div></>}
                            {info.notBefore && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Validity:</strong><div><div>{info.notBefore}</div><div style={{ fontSize: '0.8rem', opacity: 0.7 }}>to</div><div>{info.notAfter}</div></div></>}
                            {info.pubKeyAlgo && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Public Key:</strong><div>{info.pubKeyAlgo}</div></>}
                            {info.signatureAlgo && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Signature:</strong><div>{info.signatureAlgo}</div></>}
                            {info.extensions && info.extensions.length > 0 && (
                                <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap', marginTop: '0.5rem' }}>Extensions:</strong>
                                    <div style={{ marginTop: '0.5rem' }}>
                                        {info.extensions.map((ext, i) => (
                                            <div key={i} style={{ marginBottom: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '0.5rem' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                    {ext.name} {ext.critical && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>(Critical)</span>}
                                                    {ext.entries && <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 400, marginLeft: '0.25rem' }}>{entryCountLabel(ext.entries.length)}</span>}
                                                </div>
                                                {ext.entries
                                                    ? <EntryList label={ext.name} entries={ext.entries} />
                                                    : <div style={{ fontSize: '0.8rem', opacity: 0.8, wordBreak: 'break-all' }}>{ext.value}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
