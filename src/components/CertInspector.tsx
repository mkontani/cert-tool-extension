import { useState } from 'react';
import forge from 'node-forge';
import { Search, AlertCircle } from 'lucide-react';

interface ParsedInfo {
    type: string;
    subject?: string;
    issuer?: string;
    serial?: string;
    notBefore?: string;
    notAfter?: string;
    pubKeyAlgo?: string;
    pubKeySize?: number;
    extensions?: { name: string; value: string; critical: boolean }[];
    signatureAlgo?: string;
}

export default function CertInspector() {
    const [inputPem, setInputPem] = useState('');
    const [info, setInfo] = useState<ParsedInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const formatDN = (attrs: forge.pki.CertificateField[]) => {
        return attrs.map(attr => {
            const shortName = attr.shortName || attr.name;
            return `${shortName}=${attr.value}`;
        }).join(', ');
    };

    const parseInput = () => {
        setError(null);
        setInfo(null);
        if (!inputPem.trim()) return;

        try {
            if (inputPem.includes('CERTIFICATE REQUEST')) {
                const csr = forge.pki.certificationRequestFromPem(inputPem);

                let extensions: { name: string; value: string; critical: boolean }[] = [];
                // CSR extensions are in attributes
                const extAttr = csr.getAttribute({ name: 'extensionRequest' });
                if (extAttr && extAttr.extensions) {
                    extensions = extAttr.extensions.map((ext: any) => ({
                        name: ext.name || ext.id,
                        value: JSON.stringify(ext.value) || '', // simplified
                        critical: ext.critical
                    }));
                    // Try to decode common extensions if possible?
                    // Forge usually decodes SANs if structured
                }

                setInfo({
                    type: 'Certificate Signing Request (CSR)',
                    subject: formatDN(csr.subject.attributes),
                    pubKeyAlgo: 'RSA (Assumed)', // forge usually
                    signatureAlgo: (csr as any).signatureOid ? forge.pki.oids[(csr as any).signatureOid] : 'Unknown',
                    extensions
                });

            } else if (inputPem.includes('CERTIFICATE')) {
                const cert = forge.pki.certificateFromPem(inputPem);

                const extensions = cert.extensions.map((ext: any) => {
                    let val = ext.value;
                    if (ext.altNames) {
                        val = ext.altNames.map((an: any) => `${an.type === 2 ? 'DNS' : (an.type === 7 ? 'IP' : 'Type' + an.type)}:${an.value}`).join(', ');
                    } else if (typeof val === 'object') {
                        try { val = JSON.stringify(val); } catch (e) { }
                    }
                    // KeyUsage
                    if (ext.keyUsage) { // specific handling if I want to decode bitmap? Forge might decode `keyUsage` properly?
                        // Forge usually adds properties to ext object for standard exts
                    }

                    return {
                        name: ext.name || ext.id,
                        value: String(val),
                        critical: ext.critical
                    };
                });

                setInfo({
                    type: 'X.509 Certificate',
                    subject: formatDN(cert.subject.attributes),
                    issuer: formatDN(cert.issuer.attributes),
                    serial: cert.serialNumber, // hex string usually
                    notBefore: cert.validity.notBefore.toUTCString(),
                    notAfter: cert.validity.notAfter.toUTCString(),
                    pubKeyAlgo: (cert.publicKey as any).n ? 'RSA' : 'Unknown', // primitive check
                    pubKeySize: (cert.publicKey as any).n ? (cert.publicKey as any).n.bitLength() : undefined,
                    signatureAlgo: forge.pki.oids[cert.signatureOid] || cert.signatureOid,
                    extensions
                });
            } else {
                throw new Error('Unsupported format. Please feed a CERTIFICATE or CERTIFICATE REQUEST (CSR).');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to parse");
        }
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <Search size={24} color="#06b6d4" />
                <h2 style={{ margin: 0 }}>Certificate Inspector</h2>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
                <label>Input (Certificate or CSR)</label>
                <textarea
                    value={inputPem}
                    onChange={(e) => setInputPem(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                <button
                    className="btn"
                    onClick={parseInput}
                    style={{ marginTop: '0.5rem', width: '100%' }}
                >
                    Parse
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '1rem', background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px',
                    color: '#fca5a5', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {info && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                        {info.type}
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr', gap: '0.75rem 1.5rem', fontSize: '0.9rem' }}>

                        {info.serial && (
                            <>
                                <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Serial Number:</strong>
                                <code style={{ wordBreak: 'break-all' }}>{info.serial}</code>
                            </>
                        )}

                        <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Subject:</strong>
                        <div style={{ wordBreak: 'break-word', color: '#e2e8f0' }}>{info.subject}</div>

                        {info.issuer && (
                            <>
                                <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Issuer:</strong>
                                <div style={{ wordBreak: 'break-word', color: '#e2e8f0' }}>{info.issuer}</div>
                            </>
                        )}

                        {info.notBefore && (
                            <>
                                <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Validity:</strong>
                                <div>
                                    <div>{info.notBefore}</div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>to</div>
                                    <div>{info.notAfter}</div>
                                </div>
                            </>
                        )}

                        {(info.pubKeyAlgo || info.pubKeySize) && (
                            <>
                                <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Public Key:</strong>
                                <div>{info.pubKeyAlgo} {info.pubKeySize ? `(${info.pubKeySize} bits)` : ''}</div>
                            </>
                        )}

                        {info.signatureAlgo && (
                            <>
                                <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Signature:</strong>
                                <div>{info.signatureAlgo}</div>
                            </>
                        )}

                        {info.extensions && info.extensions.length > 0 && (
                            <>
                                <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap', marginTop: '0.5rem' }}>Extensions:</strong>
                                <div style={{ marginTop: '0.5rem' }}>
                                    {info.extensions.map((ext, i) => (
                                        <div key={i} style={{ marginBottom: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '0.5rem' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                {ext.name} {ext.critical && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>(Critical)</span>}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8, wordBreak: 'break-all' }}>{ext.value}</div>
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
