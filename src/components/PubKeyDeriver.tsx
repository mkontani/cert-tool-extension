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
        const match = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
        const base64 = (match ? match[1] : pem).replace(/\s/g, '');
        const binary = window.atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        return buffer.buffer;
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
            console.log('--- Starting Public Key Derivation ---');

            if (inputPem.includes('PRIVATE KEY')) {
                const pkcs8Buffer = decodePem(inputPem);
                const pkcs8Uint8 = new Uint8Array(pkcs8Buffer);

                // Surgical Detection via ASN.1 - Must use binary string for fromDer
                const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(pkcs8Uint8));
                if (asn1.type !== forge.asn1.Type.SEQUENCE) throw new Error("Not a valid PKCS#8 SEQUENCE");

                const algIdSeq = (asn1 as any).value[1];
                const algOid = forge.asn1.derToOid(algIdSeq.value[0].value);
                console.log('Detected Key OID:', algOid);

                if (algOid === '1.2.840.10045.2.1') {
                    // EC Key
                    const curveOid = forge.asn1.derToOid(algIdSeq.value[1].value);
                    console.log('Detected Curve OID:', curveOid);

                    let alg: any = null;
                    if (curveOid === '1.2.840.10045.3.1.7') alg = { name: 'ECDSA', namedCurve: 'P-256' };
                    else if (curveOid === '1.3.132.0.34') alg = { name: 'ECDSA', namedCurve: 'P-384' };
                    else if (curveOid === '1.3.132.0.35') alg = { name: 'ECDSA', namedCurve: 'P-521' };

                    if (!alg) throw new Error(`Unsupported EC Curve OID: ${curveOid}`);

                    // JWK Trick to bypass export restrictions
                    const privKey = await window.crypto.subtle.importKey('pkcs8', pkcs8Buffer, alg, true, ['sign']);
                    const jwk = await window.crypto.subtle.exportKey('jwk', privKey);
                    const { d, ...publicJwk } = jwk;
                    const pubKey = await window.crypto.subtle.importKey('jwk', publicJwk, alg, true, []);
                    const spki = await window.crypto.subtle.exportKey('spki', pubKey);

                    // encode64 expects a binary string, not Uint8Array
                    setPublicKey(formatPem('PUBLIC KEY', forge.util.encode64(forge.util.binary.raw.encode(new Uint8Array(spki)))));
                    setSourceType(`Private Key (ECDSA ${alg.namedCurve})`);
                    setIsProcessing(false);
                    return;

                } else if (algOid === '1.3.101.112') {
                    // Ed25519
                    const privKey = await window.crypto.subtle.importKey('pkcs8', pkcs8Buffer, { name: 'Ed25519' }, true, ['sign']);
                    const jwk = await window.crypto.subtle.exportKey('jwk', privKey);
                    const { d, ...publicJwk } = jwk;
                    const pubKey = await window.crypto.subtle.importKey('jwk', publicJwk, { name: 'Ed25519' }, true, []);
                    const spki = await window.crypto.subtle.exportKey('spki', pubKey);

                    setPublicKey(formatPem('PUBLIC KEY', forge.util.encode64(forge.util.binary.raw.encode(new Uint8Array(spki)))));
                    setSourceType('Private Key (Ed25519)');
                    setIsProcessing(false);
                    return;

                } else if (algOid === '1.2.840.113549.1.1.1') {
                    // RSA Key
                    const priv = forge.pki.privateKeyFromPem(inputPem);
                    const pub = forge.pki.setRsaPublicKey((priv as any).n, (priv as any).e);
                    setPublicKey(forge.pki.publicKeyToPem(pub));
                    setSourceType('Private Key (RSA)');
                    setIsProcessing(false);
                    return;
                } else {
                    throw new Error(`Unsupported Private Key Algorithm OID: ${algOid}`);
                }

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
