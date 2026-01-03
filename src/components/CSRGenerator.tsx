import { useState } from 'react';
import forge from 'node-forge';
import { FileSignature, Copy, Download, AlertCircle, Check } from 'lucide-react';

export default function CSRGenerator() {
    const [formData, setFormData] = useState({
        commonName: '',
        organization: '',
        organizationalUnit: '',
        country: '',
        state: '',
        locality: '',
        email: '',
        sans: '' // Comma separated
    });
    const [privateKey, setPrivateKey] = useState('');
    const [csrOutput, setCsrOutput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const generateCSR = () => {
        setError(null);
        setCsrOutput('');

        if (!privateKey) {
            setError('Private Key is required.');
            return;
        }

        try {
            // Parse private key
            let key;
            try {
                key = forge.pki.privateKeyFromPem(privateKey);
            } catch (e) {
                throw new Error('Invalid Private Key PEM. Please check your input.');
            }

            // Create CSR
            const csr = forge.pki.createCertificationRequest();
            if ((key as any).n && (key as any).e) {
                csr.publicKey = forge.pki.setRsaPublicKey((key as any).n, (key as any).e);
            } else if ((key as any).publicKey) {
                csr.publicKey = (key as any).publicKey;
            } else {
                throw new Error("Could not determine public key from the provided private key.");
            }

            const subject = [
                { name: 'commonName', value: formData.commonName },
                { name: 'organizationName', value: formData.organization },
                { name: 'organizationalUnitName', value: formData.organizationalUnit },
                { name: 'countryName', value: formData.country },
                { name: 'stateOrProvinceName', value: formData.state },
                { name: 'localityName', value: formData.locality },
                { name: 'emailAddress', value: formData.email }
            ].filter(attr => attr.value);

            if (subject.length > 0) {
                csr.setSubject(subject);
            }

            // SANs
            if (formData.sans) {
                const sans = formData.sans.split(',').map(s => s.trim()).filter(Boolean);
                if (sans.length > 0) {
                    csr.setAttributes([{
                        name: 'extensionRequest',
                        extensions: [{
                            name: 'subjectAltName',
                            altNames: sans.map(s => {
                                // detection of IP vs DNS
                                const isIp = /^[0-9.]+$/.test(s);
                                if (isIp) {
                                    return { type: 7, ip: s };
                                }
                                return { type: 2, value: s }; // 2 is DNS
                            })
                        }]
                    }]);
                }
            }

            // Sign
            csr.sign(key); // defaults to SHA256

            const pem = forge.pki.certificationRequestToPem(csr);
            setCsrOutput(pem);

        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to generate CSR");
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(csrOutput).then(() => {
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        });
    };

    const downloadCSR = () => {
        const blob = new Blob([csrOutput], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${formData.commonName.replace(/\s+/g, '_') || 'request'}.csr`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <FileSignature size={24} color="#ec4899" />
                <h2 style={{ margin: 0 }}>CSR Generation</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                    <label>Common Name (CN)</label>
                    <input name="commonName" value={formData.commonName} onChange={handleInputChange} placeholder="e.g. example.com" />
                </div>
                <div>
                    <label>Organization (O)</label>
                    <input name="organization" value={formData.organization} onChange={handleInputChange} placeholder="e.g. Acme Corp" />
                </div>
                <div>
                    <label>Organizational Unit (OU)</label>
                    <input name="organizationalUnit" value={formData.organizationalUnit} onChange={handleInputChange} placeholder="e.g. IT" />
                </div>
                <div>
                    <label>Country (C)</label>
                    <input name="country" value={formData.country} onChange={handleInputChange} placeholder="e.g. US" maxLength={2} />
                </div>
                <div>
                    <label>State/Province (ST)</label>
                    <input name="state" value={formData.state} onChange={handleInputChange} placeholder="e.g. California" />
                </div>
                <div>
                    <label>Locality (L)</label>
                    <input name="locality" value={formData.locality} onChange={handleInputChange} placeholder="e.g. San Francisco" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                    <label>Email Address</label>
                    <input name="email" value={formData.email} onChange={handleInputChange} placeholder="e.g. admin@example.com" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                    <label>Subject Alternative Names (SANs)</label>
                    <input name="sans" value={formData.sans} onChange={handleInputChange} placeholder="e.g. www.example.com, 10.0.0.1 (comma separated)" />
                </div>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
                <label>Private Key (PEM) *</label>
                <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="-----BEGIN PRIVATE KEY-----..."
                    rows={4}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                    Paste your specific Private Key here to sign the request.
                </p>
            </div>

            <button className="btn" onClick={generateCSR} style={{ width: '100%', marginBottom: '1.5rem' }}>
                Generate CSR
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

            {csrOutput && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ margin: 0, color: '#ec4899' }}>Certificate Signing Request (CSR)</label>
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
                                onClick={downloadCSR}
                            >
                                <Download size={14} />
                                <span style={{ marginLeft: '4px' }}>Save</span>
                            </button>
                        </div>
                    </div>
                    <textarea
                        readOnly
                        value={csrOutput}
                        rows={8}
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }}
                    />
                </div>
            )}
        </div>
    );
}
