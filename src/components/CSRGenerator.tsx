import { useId, useState } from 'react';
import { FileSignature, Download } from 'lucide-react';
import { createCsr } from '../keys/csr';
import CopyButton from './CopyButton';
import ErrorBanner from './ErrorBanner';

export default function CSRGenerator() {
    /** Prefix of this form's element ids, so its labels name their fields. */
    const id = useId();
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
                <div><label htmlFor={`${id}-commonName`}>Common Name</label><input id={`${id}-commonName`} name="commonName" value={formData.commonName} onChange={handleInputChange} placeholder="e.g. example.com" /></div>
                <div><label htmlFor={`${id}-organization`}>Organization</label><input id={`${id}-organization`} name="organization" value={formData.organization} onChange={handleInputChange} placeholder="Acme Corp" /></div>
                <div><label htmlFor={`${id}-organizationalUnit`}>OU</label><input id={`${id}-organizationalUnit`} name="organizationalUnit" value={formData.organizationalUnit} onChange={handleInputChange} placeholder="IT" /></div>
                <div><label htmlFor={`${id}-country`}>Country (2 chars)</label><input id={`${id}-country`} name="country" value={formData.country} onChange={handleInputChange} placeholder="US" maxLength={2} /></div>
                <div><label htmlFor={`${id}-state`}>State</label><input id={`${id}-state`} name="state" value={formData.state} onChange={handleInputChange} placeholder="California" /></div>
                <div><label htmlFor={`${id}-locality`}>Locality</label><input id={`${id}-locality`} name="locality" value={formData.locality} onChange={handleInputChange} placeholder="San Francisco" /></div>
                <div style={{ gridColumn: 'span 2' }}><label htmlFor={`${id}-email`}>Email</label><input id={`${id}-email`} name="email" value={formData.email} onChange={handleInputChange} placeholder="admin@example.com" /></div>
                <div style={{ gridColumn: 'span 2' }}><label htmlFor={`${id}-sans`}>SANs (separated by commas, spaces or new lines)</label><input id={`${id}-sans`} name="sans" value={formData.sans} onChange={handleInputChange} placeholder="www.example.com, 10.0.0.1" /></div>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
                <label htmlFor={`${id}-key`}>Private Key (PEM) *</label>
                <textarea id={`${id}-key`} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----..." rows={4} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
            <button className="btn" onClick={generateCSR} style={{ width: '100%', marginBottom: '1.5rem' }}>Generate CSR</button>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {csrOutput && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label htmlFor={`${id}-csr`} style={{ margin: 0, color: '#ec4899' }}>CSR (PEM)</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <CopyButton text={csrOutput} label="CSR" />
                            <button type="button" className="btn-secondary btn-small" onClick={downloadCSR}>
                                <Download size={14} aria-hidden /> <span>Save</span>
                            </button>
                        </div>
                    </div>
                    <textarea id={`${id}-csr`} readOnly value={csrOutput} rows={8} style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} />
                </div>
            )}
        </div>
    );
}
