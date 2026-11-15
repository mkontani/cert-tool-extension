import { useState } from 'react';
import { KeyRound, ArrowDownCircle, Loader2 } from 'lucide-react';
import CopyButton from './CopyButton';
import ErrorBanner from './ErrorBanner';
import SaveButton from './SaveButton';
import { derivePublicKey } from '../keys/publicKey';

export default function PubKeyDeriver() {
    const [inputPem, setInputPem] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [sourceType, setSourceType] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const derive = async () => {
        setError(null);
        setPublicKey('');
        setSourceType(null);
        if (!inputPem.trim()) return;

        setIsProcessing(true);
        try {
            const derived = await derivePublicKey(inputPem);
            setPublicKey(derived.pem);
            setSourceType(derived.source);
        } catch (e: unknown) {
            console.error('Derivation error:', e);
            setError(e instanceof Error ? e.message : 'Failed to derive public key');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <KeyRound size={24} color="#8b5cf6" />
                <h2 style={{ margin: 0 }}>Public Key Derivation</h2>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="deriver-input">Input (Private Key, CSR, or Certificate)</label>
                <textarea
                    id="deriver-input"
                    value={inputPem}
                    onChange={(e) => setInputPem(e.target.value)}
                    placeholder="Paste PEM content here..."
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
            </div>
            <button className="btn" onClick={derive} disabled={isProcessing} style={{ width: '100%', marginBottom: '1.5rem' }}>
                {isProcessing ? <Loader2 className="spin" size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} /> : <ArrowDownCircle size={18} style={{ marginRight: '0.5rem' }} />}
                Extract Public Key
            </button>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {publicKey && (
                <div data-testid="deriver-results">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label htmlFor="deriver-output" style={{ margin: 0, color: '#06b6d4' }}>
                            Derived Public Key {sourceType && <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: '0.5rem' }}> (from {sourceType})</span>}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <CopyButton text={publicKey} label="public key" />
                            <SaveButton text={publicKey} label="public key" filename="public_key.pem" extensions={['.pem']} />
                        </div>
                    </div>
                    <textarea id="deriver-output" readOnly value={publicKey} rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} />
                </div>
            )}
        </div>
    );
}
