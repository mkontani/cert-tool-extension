import { useState } from 'react';
import forge from 'node-forge';
import { Key, ArrowDownCircle, Copy, Check, Download, AlertCircle } from 'lucide-react';

export default function PubKeyDeriver() {
    const [inputPem, setInputPem] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [sourceType, setSourceType] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState(false);

    const derivePublicKey = () => {
        setError(null);
        setPublicKey('');
        setSourceType(null);

        if (!inputPem.trim()) {
            return;
        }

        try {
            let pubKeyObj = null;
            let detectedType = '';

            if (inputPem.includes('PRIVATE KEY')) {
                detectedType = 'Private Key';
                try {
                    const priv = forge.pki.privateKeyFromPem(inputPem);
                    if ((priv as any).n && (priv as any).e) {
                        pubKeyObj = forge.pki.setRsaPublicKey((priv as any).n, (priv as any).e);
                    } else {
                        // Fallback or specific Ed25519 attempt
                        pubKeyObj = (priv as any).publicKey || null;
                    }
                } catch (e) {
                    // If forge fails, it might be a format it doesn't like (like Ed25519 in some versions)
                    detectedType = 'Private Key (Unknown Format)';
                }
            } else if (inputPem.includes('CERTIFICATE REQUEST')) {
                detectedType = 'CSR';
                const csr = forge.pki.certificationRequestFromPem(inputPem);
                pubKeyObj = csr.publicKey;
            } else if (inputPem.includes('CERTIFICATE')) {
                detectedType = 'Certificate';
                const cert = forge.pki.certificateFromPem(inputPem);
                pubKeyObj = cert.publicKey;
            } else if (inputPem.includes('PUBLIC KEY')) {
                detectedType = 'Public Key (Passthrough)';
                pubKeyObj = forge.pki.publicKeyFromPem(inputPem);
            } else {
                throw new Error("Unknown PEM format. Please ensure it has headers (e.g., -----BEGIN ...).");
            }

            if (!pubKeyObj) {
                throw new Error("Could not extract Public Key from the input.");
            }
            setSourceType(detectedType);
            const pubPem = forge.pki.publicKeyToPem(pubKeyObj);
            setPublicKey(pubPem);

        } catch (e: any) {
            setError(e.message || "Failed to derive public key");
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(publicKey).then(() => {
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        });
    };

    const downloadKey = () => {
        const blob = new Blob([publicKey], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'public_key.pem';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <Key size={24} color="#8b5cf6" />
                <h2 style={{ margin: 0 }}>Public Key Derivation</h2>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
                <label>Input (Private Key, CSR, or Certificate)</label>
                <textarea
                    value={inputPem}
                    onChange={(e) => setInputPem(e.target.value)}
                    placeholder="Paste PEM content here..."
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
            </div>

            <button className="btn" onClick={derivePublicKey} style={{ width: '100%', marginBottom: '1.5rem' }}>
                <ArrowDownCircle size={18} style={{ marginRight: '0.5rem' }} />
                Extract Public Key
            </button>

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

            {publicKey && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ margin: 0, color: '#06b6d4' }}>
                            Derived Public Key
                            {sourceType && <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: '0.5rem' }}> (from {sourceType})</span>}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                onClick={copyToClipboard}
                            >
                                {copyStatus ? <Check size={14} /> : <Copy size={14} />}
                                <span style={{ marginLeft: '4px' }}>{copyStatus ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                                className="btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                onClick={downloadKey}
                            >
                                <Download size={14} />
                                <span style={{ marginLeft: '4px' }}>Save</span>
                            </button>
                        </div>
                    </div>
                    <textarea
                        readOnly
                        value={publicKey}
                        rows={6}
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }}
                    />
                </div>
            )}
        </div>
    );
}
