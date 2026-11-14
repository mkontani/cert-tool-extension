import { useState } from 'react';
import forge from 'node-forge';
import { Key, ArrowDownCircle, Copy, Check, Download, AlertCircle, Loader2 } from 'lucide-react';
import { toPem } from '../keys/pem';
import { describeKey, publicKeyOf, readPrivateKey } from '../keys/privateKey';

export default function PubKeyDeriver() {
    const [inputPem, setInputPem] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [sourceType, setSourceType] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const decodePem = (pem: string): Uint8Array => {
        const match = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
        const base64 = (match ? match[1] : pem).replace(/\s/g, '');
        const binary = window.atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        return buffer;
    };

    const formatPem = (label: string, base64: string) => {
        const matches = base64.match(/.{1,64}/g) || [];
        return `-----BEGIN ${label}-----\n${matches.join('\n')}\n-----END ${label}-----`;
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
            if (inputPem.includes('PRIVATE KEY')) {
                // PKCS#8, PKCS#1 or SEC1; the key block is found even when a certificate comes first.
                const key = readPrivateKey(inputPem);
                setPublicKey(toPem('PUBLIC KEY', await publicKeyOf(key)));
                setSourceType(`Private Key (${describeKey(key.algorithm)})`);
            } else if (inputPem.includes('CERTIFICATE REQUEST')) {
                // Robust ASN.1 Extraction for CSR
                const der = forge.util.binary.raw.encode(new Uint8Array(decodePem(inputPem)));
                const asn1 = forge.asn1.fromDer(der);
                // CSR is SEQUENCE [ CertificationRequestInfo, SignatureAlgorithm, SignatureValue ]
                // CertificationRequestInfo is SEQUENCE [ Version, Subject, SubjectPublicKeyInfo, Attributes ]
                // So SubjectPublicKeyInfo is at index 0.value[2]
                const cri = (asn1 as any).value[0];
                const spki = cri.value[2];
                if (!spki) throw new Error("Could not find SubjectPublicKeyInfo in CSR.");

                const spkiDer = forge.asn1.toDer(spki).getBytes();
                setPublicKey(formatPem('PUBLIC KEY', forge.util.encode64(spkiDer)));
                setSourceType('CSR');
            } else if (inputPem.includes('CERTIFICATE')) {
                // Robust ASN.1 Extraction for Certificate
                const der = forge.util.binary.raw.encode(new Uint8Array(decodePem(inputPem)));
                const asn1 = forge.asn1.fromDer(der);
                // Certificate is SEQUENCE [ TBSCertificate, SignatureAlgorithm, SignatureValue ]
                // TBSCertificate is SEQUENCE [ Version (opt), SerialNumber, Signature, Issuer, Validity, Subject, SubjectPublicKeyInfo, ... ]
                const tbs = (asn1 as any).value[0];
                // SubjectPublicKeyInfo is at index 6 if version is present (as context tag 0)
                let spkiIdx = 6;
                // Check if index 0 is version (tagged 0)
                if (tbs.value[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC) {
                    spkiIdx = 6; // index 0 is version, 1 is serial, 2 is sig, 3 is issuer, 4 is validity, 5 is subject, 6 is spki
                } else {
                    spkiIdx = 5; // index 0 is serial, etc. (version is absent)
                }
                const spki = tbs.value[spkiIdx];
                if (!spki) throw new Error("Could not find SubjectPublicKeyInfo in Certificate.");

                const spkiDer = forge.asn1.toDer(spki).getBytes();
                setPublicKey(formatPem('PUBLIC KEY', forge.util.encode64(spkiDer)));
                setSourceType('Certificate');
            } else if (inputPem.includes('PUBLIC KEY')) {
                setPublicKey(inputPem);
                setSourceType('Public Key');
            } else {
                throw new Error("Unrecognized PEM format.");
            }

        } catch (e: any) {
            console.error('Derivation error:', e);
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

    const downloadKey = async () => {
        const filename = 'public_key.pem';
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'Public Key File', accept: { 'text/plain': ['.pem'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(publicKey);
                await writable.close();
                return;
            } catch (e: any) { if (e.name === 'AbortError') return; }
        }
        const blob = new Blob([publicKey], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <Key size={24} color="#8b5cf6" />
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
            <button className="btn" onClick={derivePublicKey} disabled={isProcessing} style={{ width: '100%', marginBottom: '1.5rem' }}>
                {isProcessing ? <Loader2 className="spin" size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} /> : <ArrowDownCircle size={18} style={{ marginRight: '0.5rem' }} />}
                Extract Public Key
            </button>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            {error && (
                <div style={{
                    padding: '1rem', background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px',
                    color: '#fca5a5', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    <AlertCircle size={18} /> {error}
                </div>
            )}
            {publicKey && (
                <div data-testid="deriver-results">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ margin: 0, color: '#06b6d4' }}>
                            Derived Public Key {sourceType && <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: '0.5rem' }}> (from {sourceType})</span>}
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={copyToClipboard}>
                                {copyStatus ? <Check size={14} /> : <Copy size={14} />}
                                <span style={{ marginLeft: '4px' }}>{copyStatus ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={downloadKey}>
                                <Download size={14} /> <span style={{ marginLeft: '4px' }}>Save</span>
                            </button>
                        </div>
                    </div>
                    <textarea readOnly value={publicKey} rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} />
                </div>
            )}
        </div>
    );
}
