import { useState } from 'react';
import forge from 'node-forge';
import { Download, Copy, RefreshCw, AlertCircle, Check } from 'lucide-react';

type Algorithm = 'RSA' | 'Ed25519' | 'ECDSA';
type KeySize = 2048 | 4096;
type Curve = 'P-256' | 'P-384';

export default function KeyPairGenerator() {
    const [algorithm, setAlgorithm] = useState<Algorithm>('RSA');
    const [keySize, setKeySize] = useState<KeySize>(2048);
    const [curve, setCurve] = useState<Curve>('P-256');
    const [privateKey, setPrivateKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState<{ [key: string]: boolean }>({});

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    const formatPem = (label: string, base64: string) => {
        const lines = base64.match(/.{1,64}/g) || [];
        return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
    };

    const handleGenerate = () => {
        setIsGenerating(true);
        setError(null);
        setPrivateKey('');
        setPublicKey('');

        // Allow UI to update before heavy computation
        setTimeout(async () => {
            try {
                let privPem = '';
                let pubPem = '';

                if (algorithm === 'RSA') {
                    const keys = forge.pki.rsa.generateKeyPair({ bits: keySize, workers: -1 });
                    privPem = forge.pki.privateKeyToPem(keys.privateKey);
                    pubPem = forge.pki.publicKeyToPem(keys.publicKey);
                } else if (algorithm === 'Ed25519') {
                    const keys = forge.pki.ed25519.generateKeyPair();
                    privPem = forge.pki.privateKeyToPem(keys.privateKey);
                    pubPem = forge.pki.publicKeyToPem(keys.publicKey);
                } else if (algorithm === 'ECDSA') {
                    const keys = await window.crypto.subtle.generateKey(
                        { name: 'ECDSA', namedCurve: curve },
                        true,
                        ['sign', 'verify']
                    );
                    const privBuf = await window.crypto.subtle.exportKey('pkcs8', keys.privateKey);
                    const pubBuf = await window.crypto.subtle.exportKey('spki', keys.publicKey);

                    privPem = formatPem('PRIVATE KEY', arrayBufferToBase64(privBuf));
                    pubPem = formatPem('PUBLIC KEY', arrayBufferToBase64(pubBuf));
                }

                setPrivateKey(privPem);
                setPublicKey(pubPem);
            } catch (e: any) {
                console.error(e);
                setError("Error generating keys: " + (e.message || e));
            } finally {
                setIsGenerating(false);
            }
        }, 50);
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyStatus(prev => ({ ...prev, [id]: true }));
            setTimeout(() => setCopyStatus(prev => ({ ...prev, [id]: false })), 2000);
        });
    };

    const downloadFile = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Key Pair Generation</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <label>Algorithm</label>
                    <select
                        value={algorithm}
                        onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                        disabled={isGenerating}
                    >
                        <option value="RSA">RSA</option>
                        <option value="Ed25519">Ed25519</option>
                        <option value="ECDSA">ECDSA</option>
                    </select>
                </div>

                {algorithm === 'RSA' && (
                    <div>
                        <label>Key Size (bits)</label>
                        <select
                            value={keySize}
                            onChange={(e) => setKeySize(Number(e.target.value) as KeySize)}
                            disabled={isGenerating}
                        >
                            <option value={2048}>2048</option>
                            <option value={4096}>4096</option>
                        </select>
                    </div>
                )}

                {algorithm === 'ECDSA' && (
                    <div>
                        <label>Curve</label>
                        <select
                            value={curve}
                            onChange={(e) => setCurve(e.target.value as Curve)}
                            disabled={isGenerating}
                        >
                            <option value="P-256">P-256</option>
                            <option value="P-384">P-384</option>
                        </select>
                    </div>
                )}
            </div>

            <button
                className="btn"
                style={{ width: '100%', marginBottom: '1.5rem', opacity: isGenerating ? 0.7 : 1 }}
                onClick={handleGenerate}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <RefreshCw className="spin" size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                        Generating...
                    </>
                ) : (
                    <>
                        <RefreshCw size={18} style={{ marginRight: '0.5rem' }} />
                        Generate Key Pair
                    </>
                )}
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

            {privateKey && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Private Key Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ margin: 0, color: '#ec4899' }}>Private Key</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    onClick={() => copyToClipboard(privateKey, 'priv')}
                                >
                                    {copyStatus['priv'] ? <Check size={14} /> : <Copy size={14} />}
                                    <span style={{ marginLeft: '4px' }}>{copyStatus['priv'] ? 'Copied' : 'Copy'}</span>
                                </button>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    onClick={() => downloadFile(privateKey, 'private.key')}
                                >
                                    <Download size={14} />
                                    <span style={{ marginLeft: '4px' }}>Save</span>
                                </button>
                            </div>
                        </div>
                        <textarea
                            readOnly
                            value={privateKey}
                            rows={6}
                            style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }}
                        />
                    </div>

                    {/* Public Key Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ margin: 0, color: '#8b5cf6' }}>Public Key</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    onClick={() => copyToClipboard(publicKey, 'pub')}
                                >
                                    {copyStatus['pub'] ? <Check size={14} /> : <Copy size={14} />}
                                    <span style={{ marginLeft: '4px' }}>{copyStatus['pub'] ? 'Copied' : 'Copy'}</span>
                                </button>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    onClick={() => downloadFile(publicKey, 'public.pem')}
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
                </div>
            )}
        </div>
    );
}
