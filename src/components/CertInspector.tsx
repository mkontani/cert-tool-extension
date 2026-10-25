import { useState } from 'react';
import forge from 'node-forge';
import { Search, AlertCircle } from 'lucide-react';
import { describePublicKey, signatureAlgorithmName } from '../inspector/algorithms';
import { describeExtension } from '../inspector/extensions';
import { describeName } from '../inspector/format';
import { findPemBlock } from '../inspector/pem';
import type { ExtensionInfo } from '../inspector/types';
import EntryList from './EntryList';

const entryCountLabel = (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`;

/** Re-encodes a parsed forge node so the schema-based decoders can read it. */
const derBytes = (node: forge.asn1.Asn1) => Uint8Array.from(forge.asn1.toDer(node).getBytes(), c => c.charCodeAt(0));

interface ParsedInfo {
    type: string;
    subject?: string;
    issuer?: string;
    serial?: string;
    notBefore?: string;
    notAfter?: string;
    pubKeyAlgo?: string;
    extensions?: ExtensionInfo[];
    signatureAlgo?: string;
    /** Shown above the details, e.g. when only the first certificate of a chain is inspected. */
    notice?: string;
}

export default function CertInspector() {
    const [inputPem, setInputPem] = useState('');
    const [info, setInfo] = useState<ParsedInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const parseInput = () => {
        setError(null);
        setInfo(null);
        if (!inputPem.trim()) return;

        try {
            const block = findPemBlock(inputPem);
            if (!block) throw new Error('Unsupported format. Please feed a CERTIFICATE or CERTIFICATE REQUEST (CSR).');
            const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(block.der));
            const notice = block.count > 1
                ? `Showing the first of ${block.count} ${block.kind === 'csr' ? 'CSRs' : 'certificates'}.`
                : undefined;

            if (block.kind === 'csr') {
                const cri = (asn1 as any).value[0];
                const subject = describeName(derBytes(cri.value[1]));
                const spki = cri.value[2];
                const attributesNode = cri.value[3];

                const pubKeyAlgo = describePublicKey(derBytes(spki));
                const signatureAlgo = signatureAlgorithmName(forge.asn1.derToOid((asn1 as any).value[1].value[0].value));

                const extensions: ExtensionInfo[] = [];
                if (attributesNode && attributesNode.value) {
                    for (let i = 0; i < attributesNode.value.length; i++) {
                        const attr = attributesNode.value[i];
                        const attrOid = forge.asn1.derToOid(attr.value[0].value);
                        if (attrOid === '1.2.840.113549.1.9.14') {
                            const extsSeq = attr.value[1].value[0];
                            for (let j = 0; j < extsSeq.value.length; j++) {
                                extensions.push(describeExtension(derBytes(extsSeq.value[j])));
                            }
                        }
                    }
                }

                setInfo({
                    type: 'Certificate Signing Request (CSR)',
                    subject,
                    pubKeyAlgo,
                    signatureAlgo,
                    extensions,
                    notice
                });

            } else {
                const tbs = (asn1 as any).value[0];
                let offset = 0;
                if (tbs.value[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && tbs.value[0].type === 0) {
                    offset = 1;
                }

                const serial = (forge.util as any).bytesToHex(tbs.value[offset].value);
                const issuer = describeName(derBytes(tbs.value[offset + 2]));

                const validity = tbs.value[offset + 3];
                const parseDate = (node: any) => {
                    if (node.type === forge.asn1.Type.UTCTIME) return (forge.asn1 as any).utcTimeToDate(node.value).toUTCString();
                    if (node.type === forge.asn1.Type.GENERALIZEDTIME) return (forge.asn1 as any).generalizedTimeToDate(node.value).toUTCString();
                    return 'Unknown';
                };

                const subject = describeName(derBytes(tbs.value[offset + 4]));
                const spki = tbs.value[offset + 5];

                const pubKeyAlgo = describePublicKey(derBytes(spki));
                const signatureAlgo = signatureAlgorithmName(forge.asn1.derToOid((asn1 as any).value[1].value[0].value));

                const extensions: ExtensionInfo[] = [];
                for (let i = offset + 6; i < tbs.value.length; i++) {
                    const node = tbs.value[i];
                    if (node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node.type === 3) {
                        const extsSeq = node.value[0];
                        for (let j = 0; j < extsSeq.value.length; j++) {
                            extensions.push(describeExtension(derBytes(extsSeq.value[j])));
                        }
                    }
                }

                setInfo({
                    type: 'X.509 Certificate',
                    subject,
                    issuer,
                    serial,
                    notBefore: parseDate(validity.value[0]),
                    notAfter: parseDate(validity.value[1]),
                    pubKeyAlgo,
                    signatureAlgo,
                    extensions,
                    notice
                });
            }
        } catch (e: any) {
            console.error('Inspector parse error:', e);
            setError(`Failed to parse: ${e.message || "Unknown error"}`);
        }
    };

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
            {error && (
                <div style={{
                    padding: '1rem', background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px',
                    color: '#fca5a5', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}><AlertCircle size={18} /> {error}</div>
            )}
            {info && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }} data-testid="inspector-results">
                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>{info.type}</h3>
                    {info.notice && <p data-testid="inspector-notice" style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '-0.5rem 0 1rem' }}>{info.notice}</p>}
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
    );
}
