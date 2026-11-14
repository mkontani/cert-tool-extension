import { useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CopyButton from './CopyButton';
import ErrorBanner from './ErrorBanner';
import SaveButton from './SaveButton';

type Algorithm = 'RSA' | 'Ed25519' | 'ECDSA';
type KeySize = 2048 | 4096;
type Curve = 'P-256' | 'P-384' | 'P-521';

export default function KeyPairGenerator() {
    /** Prefix of this form's element ids, so its labels name their fields. */
    const id = useId();
    const [algorithm, setAlgorithm] = useState<Algorithm>('RSA');
    const [keySize, setKeySize] = useState<KeySize>(2048);
    const [curve, setCurve] = useState<Curve>('P-256');
    const [privateKey, setPrivateKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                    const keys = await window.crypto.subtle.generateKey(
                        {
                            name: 'RSASSA-PKCS1-v1_5',
                            modulusLength: keySize,
                            publicExponent: new Uint8Array([1, 0, 1]),
                            hash: 'SHA-256',
                        },
                        true,
                        ['sign', 'verify']
                    );
                    const privBuf = await window.crypto.subtle.exportKey('pkcs8', keys.privateKey);
                    const pubBuf = await window.crypto.subtle.exportKey('spki', keys.publicKey);

                    privPem = formatPem('PRIVATE KEY', arrayBufferToBase64(privBuf));
                    pubPem = formatPem('PUBLIC KEY', arrayBufferToBase64(pubBuf));
                } else if (algorithm === 'Ed25519') {
                    const keys = await window.crypto.subtle.generateKey(
                        { name: 'Ed25519' },
                        true,
                        ['sign', 'verify']
                    );
                    const privBuf = await window.crypto.subtle.exportKey('pkcs8', keys.privateKey);
                    const pubBuf = await window.crypto.subtle.exportKey('spki', keys.publicKey);

                    privPem = formatPem('PRIVATE KEY', arrayBufferToBase64(privBuf));
                    pubPem = formatPem('PUBLIC KEY', arrayBufferToBase64(pubBuf));
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
            } catch (e: unknown) {
                console.error(e);
                setError(`Error generating keys: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setIsGenerating(false);
            }
        }, 50);
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Key Pair Generation</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <label htmlFor="algo-select">Algorithm</label>
                    <select
                        id="algo-select"
                        value={algorithm}
                        onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                        disabled={isGenerating}
                    >
                        <option value="RSA">RSA</option>
                        <option value="ECDSA">ECDSA</option>
                        <option value="Ed25519">Ed25519</option>
                    </select>
                </div>

                {algorithm === 'RSA' && (
                    <div>
                        <label htmlFor={`${id}-size`}>Key Size (bits)</label>
                        <select
                            id={`${id}-size`}
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
                        <label htmlFor={`${id}-curve`}>Curve</label>
                        <select
                            id={`${id}-curve`}
                            value={curve}
                            onChange={(e) => setCurve(e.target.value as Curve)}
                            disabled={isGenerating}
                        >
                            <option value="P-256">P-256</option>
                            <option value="P-384">P-384</option>
                            <option value="P-521">P-521</option>
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

            {error && <ErrorBanner>{error}</ErrorBanner>}

            {privateKey && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} data-testid="keypair-results">
                    {/* Private Key Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label htmlFor={`${id}-private`} style={{ margin: 0, color: '#ec4899' }}>Private Key</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <CopyButton text={privateKey} label="private key" />
                                <SaveButton text={privateKey} label="private key" filename="private.key" extensions={['.key']} />
                            </div>
                        </div>
                        <textarea
                            id={`${id}-private`}
                            readOnly
                            value={privateKey}
                            rows={6}
                            style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }}
                        />
                    </div>

                    {/* Public Key Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label htmlFor={`${id}-public`} style={{ margin: 0, color: '#8b5cf6' }}>Public Key</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <CopyButton text={publicKey} label="public key" />
                                <SaveButton text={publicKey} label="public key" filename="public.pem" extensions={['.pem']} />
                            </div>
                        </div>
                        <textarea
                            id={`${id}-public`}
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
