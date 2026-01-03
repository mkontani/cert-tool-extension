import { useState } from 'react';
import forge from 'node-forge';
import { Key, ArrowDownCircle, Copy, Check, Download, AlertCircle, Loader2 } from 'lucide-react';

export default function PubKeyDeriver() {
    const [inputPem, setInputPem] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [sourceType, setSourceType] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const decodePem = (pem: string) => {
        const base64 = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
        const binary = window.atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }
        return buffer.buffer;
    };
    const derivePublicKey = async () => {
        setError(null);
        setPublicKey('');
        setSourceType(null);
        setIsProcessing(true);

        if (!inputPem.trim()) {
            setIsProcessing(false);
            return;
        }

        try {
            let pubKeyObj = null;
            let detectedType = '';

            if (inputPem.includes('PRIVATE KEY')) {
                detectedType = 'Private Key';
                // Use Web Crypto to extract public key from PKCS#8
                try {
                    const pkcs8Buffer = decodePem(inputPem);

                    // We need to know the algorithm. PKCS#8 labels don't tell us easily without ASN.1 parsing.
                    // We can try RSA, then Ed25519, then ECDSA.
                    let key = null;
                    const algorithms = [
                        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
                        { name: 'ECDSA', namedCurve: 'P-256' },
                        { name: 'ECDSA', namedCurve: 'P-384' },
                        { name: 'ECDSA', namedCurve: 'P-521' },
                        { name: 'Ed25519' }
                    ];

                    for (const alg of algorithms) {
                        try {
                            key = await window.crypto.subtle.importKey('pkcs8', pkcs8Buffer, alg, true, ['sign']);
                            if (key) break;
                        } catch (e) { continue; }
                    }

                    if (!key) throw new Error("Could not import Private Key. Format might be unsupported.");

                    // Export as SPKI (Public Key)
                    // Wait, you can't exportKey 'spki' from a 'private' key object usually? 
                    // Actually, you usually can't. But you can GENERATE the public key or it's implicitly there.
                    // In Web Crypto, a private key object doesn't always allow exporting the public part directly.

                    // TRICK: If we can't export spki from private, we might need node-forge for extraction after all,
                    // OR use a proper PKCS#8 parser.

                    // Let's try node-forge PEM parsing again but CLEANER now that headers are fixed.
                    const priv = forge.pki.privateKeyFromPem(inputPem);
                    if ((priv as any).n) {
                        pubKeyObj = forge.pki.setRsaPublicKey((priv as any).n, (priv as any).e);
                    } else {
                        // For Ed25519, forge might store it differently
                        pubKeyObj = (priv as any).publicKey || null;
                    }

                    if (!pubKeyObj) throw new Error("Could not extract public key component.");

                } catch (e: any) {
                    throw new Error("Private Key Parsing Error: " + e.message);
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
        } finally {
            setIsProcessing(false);
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

            <button className="btn" onClick={derivePublicKey} disabled={isProcessing} style={{ width: '100%', marginBottom: '1.5rem' }}>
                {isProcessing ? <Loader2 className="spin" size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} /> : <ArrowDownCircle size={18} style={{ marginRight: '0.5rem' }} />}
                Extract Public Key
            </button>

            <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>

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
