import { useState } from 'react';
import { FileSignature, Download } from 'lucide-react';
import { createCsr } from '../keys/csr';
import CopyButton from './CopyButton';
import ErrorBanner from './ErrorBanner';

export default function CSRGenerator() {
    const [formData, setFormData] = useState({
        commonName: '',
        organization: '',
        organizationalUnit: '',
        country: '',
        state: '',
        locality: '',
        email: '',
        sans: '' // Separated by commas, spaces or new lines
    });
    const [privateKey, setPrivateKey] = useState('');
    const [csrOutput, setCsrOutput] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const generateCSR = async () => {
        setError(null);
        setCsrOutput('');

        if (!privateKey.trim()) {
            setError('Private Key is required.');
            return;
        }

        try {
            const { sans, ...subject } = formData;
            setCsrOutput(await createCsr({ subject, sans, privateKey }));
        } catch (e: unknown) {
            console.error('CSR generation error:', e);
            setError(e instanceof Error && e.message ? e.message : 'Failed to generate CSR');
        }
    };

    const downloadCSR = async () => {
        const filename = `${formData.commonName.replace(/\s+/g, '_') || 'request'}.csr`;
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'CSR File', accept: { 'text/plain': ['.csr'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(csrOutput);
                await writable.close();
                return;
            } catch (e: any) { if (e.name === 'AbortError') return; }
        }
        const blob = new Blob([csrOutput], { type: 'text/plain' });
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
                <FileSignature size={24} color="#ec4899" />
                <h2 style={{ margin: 0 }}>CSR Generation</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div><label>Common Name</label><input name="commonName" value={formData.commonName} onChange={handleInputChange} placeholder="e.g. example.com" /></div>
                <div><label>Organization</label><input name="organization" value={formData.organization} onChange={handleInputChange} placeholder="Acme Corp" /></div>
                <div><label>OU</label><input name="organizationalUnit" value={formData.organizationalUnit} onChange={handleInputChange} placeholder="IT" /></div>
                <div><label>Country (2 chars)</label><input name="country" value={formData.country} onChange={handleInputChange} placeholder="US" maxLength={2} /></div>
                <div><label>State</label><input name="state" value={formData.state} onChange={handleInputChange} placeholder="California" /></div>
                <div><label>Locality</label><input name="locality" value={formData.locality} onChange={handleInputChange} placeholder="San Francisco" /></div>
                <div style={{ gridColumn: 'span 2' }}><label>Email</label><input name="email" value={formData.email} onChange={handleInputChange} placeholder="admin@example.com" /></div>
                <div style={{ gridColumn: 'span 2' }}><label>SANs (comma separated)</label><input name="sans" value={formData.sans} onChange={handleInputChange} placeholder="www.example.com, 10.0.0.1" /></div>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
                <label>Private Key (PEM) *</label>
                <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----..." rows={4} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
            <button className="btn" onClick={generateCSR} style={{ width: '100%', marginBottom: '1.5rem' }}>Generate CSR</button>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {csrOutput && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ margin: 0, color: '#ec4899' }}>CSR (PEM)</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <CopyButton text={csrOutput} label="CSR" />
                            <button type="button" className="btn-secondary btn-small" onClick={downloadCSR}>
                                <Download size={14} aria-hidden /> <span>Save</span>
                            </button>
                        </div>
                    </div>
                    <textarea readOnly value={csrOutput} rows={8} style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} />
                </div>
            )}
        </div>
    );
}
