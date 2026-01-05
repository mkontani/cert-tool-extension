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

    const formatPem = (label: string, base64: string) => {
        const matches = base64.match(/.{1,64}/g) || [];
        return `-----BEGIN ${label}-----\n${matches.join('\n')}\n-----END ${label}-----`;
    };

    const decodePem = (pem: string) => {
        const match = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
        const base64 = (match ? match[1] : pem).replace(/\s/g, '');
        const binary = window.atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        return buffer.buffer;
    };

    const ecdsaSignatureToDer = (signature: ArrayBuffer): Uint8Array => {
        const raw = new Uint8Array(signature);
        const half = raw.length / 2;
        const r = raw.slice(0, half);
        const s = raw.slice(half);

        const toInteger = (bytes: Uint8Array) => {
            let i = 0;
            while (i < bytes.length - 1 && bytes[i] === 0) i++;
            const slice = bytes.slice(i);
            if (slice[0] & 0x80) {
                const res = new Uint8Array(slice.length + 1);
                res.set(slice, 1);
                return res;
            }
            return slice;
        };

        const rAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, forge.util.binary.raw.encode(toInteger(r)));
        const sAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, forge.util.binary.raw.encode(toInteger(s)));
        const seq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [rAsn1, sAsn1]);
        const der = forge.asn1.toDer(seq).getBytes();
        const res = new Uint8Array(der.length);
        for (let i = 0; i < der.length; i++) res[i] = der.charCodeAt(i);
        return res;
    };

    const generateCSR = async () => {
        setError(null);
        setCsrOutput('');

        if (!privateKey) {
            setError('Private Key is required.');
            return;
        }

        try {
            console.log('--- Starting CSR Generation ---');
            const pkcs8Buffer = decodePem(privateKey);
            const pkcs8Uint8 = new Uint8Array(pkcs8Buffer);

            // Surgical Detection - Must use binary string
            const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(pkcs8Uint8));
            if (asn1.type !== forge.asn1.Type.SEQUENCE) throw new Error("Not a valid PKCS#8 SEQUENCE");

            const algIdSeq = (asn1 as any).value[1];
            const algOid = forge.asn1.derToOid(algIdSeq.value[0].value);
            console.log('Detected Key OID:', algOid);

            if (algOid === '1.2.840.10045.2.1') {
                // ECDSA Flow
                const curveOid = forge.asn1.derToOid(algIdSeq.value[1].value);
                let params: any = null;
                if (curveOid === '1.2.840.10045.3.1.7') params = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256', sigOid: '1.2.840.10045.4.3.2' };
                else if (curveOid === '1.3.132.0.34') params = { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384', sigOid: '1.2.840.10045.4.3.3' };
                else if (curveOid === '1.3.132.0.35') params = { name: 'ECDSA', namedCurve: 'P-521', hash: 'SHA-512', sigOid: '1.2.840.10045.4.3.4' };

                if (!params) throw new Error(`Unsupported EC Curve OID: ${curveOid}`);

                const cryptoKey = await window.crypto.subtle.importKey('pkcs8', pkcs8Buffer, { name: 'ECDSA', namedCurve: params.namedCurve }, true, ['sign']);

                // JWK Trick to get SPKI efficiently
                const jwk = await window.crypto.subtle.exportKey('jwk', cryptoKey);
                const { d: _d, ...publicJwk } = jwk;
                const pubCryptoKey = await window.crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: params.namedCurve }, true, []);
                const spkiBuffer = await window.crypto.subtle.exportKey('spki', pubCryptoKey);
                const spkiAsn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(new Uint8Array(spkiBuffer)));

                // Build CRI
                const dummyKeys = forge.pki.rsa.generateKeyPair(1024); // Minimal RSA for forge framework
                const csr = forge.pki.createCertificationRequest();
                csr.publicKey = dummyKeys.publicKey; // CRITICAL FIX: Set public key before sign()

                const subject = [
                    { name: 'commonName', value: formData.commonName },
                    { name: 'organizationName', value: formData.organization },
                    { name: 'organizationalUnitName', value: formData.organizationalUnit },
                    { name: 'countryName', value: formData.country },
                    { name: 'stateOrProvinceName', value: formData.state },
                    { name: 'localityName', value: formData.locality },
                    { name: 'emailAddress', value: formData.email }
                ].filter(attr => attr.value);
                if (subject.length > 0) csr.setSubject(subject);

                if (formData.sans) {
                    const sans = formData.sans.split(',').map(s => s.trim()).filter(Boolean);
                    if (sans.length > 0) {
                        csr.setAttributes([{
                            name: 'extensionRequest',
                            extensions: [{
                                name: 'subjectAltName',
                                altNames: sans.map(s => {
                                    if (/^[a-z]+:\/\/.+$/i.test(s)) return { type: 6, value: s };
                                    if (/^[0-9.]+$/.test(s) || (/^[a-fA-F0-9:]+$/.test(s) && s.includes(':'))) return { type: 7, ip: s };
                                    if (/^.+@.+\..+$/.test(s)) return { type: 1, value: s };
                                    return { type: 2, value: s };
                                })
                            }]
                        }]);
                    }
                }

                csr.sign(dummyKeys.privateKey);
                const criAsn1 = (forge.pki.certificationRequestToAsn1(csr) as any).value[0];
                criAsn1.value[2] = spkiAsn1; // Swap to proper SubjectPublicKey

                const criDer = forge.asn1.toDer(criAsn1).getBytes();
                const criUint8 = new Uint8Array(criDer.length);
                for (let i = 0; i < criDer.length; i++) criUint8[i] = criDer.charCodeAt(i);

                const rawSig = await window.crypto.subtle.sign({ name: 'ECDSA', hash: params.hash }, cryptoKey, criUint8);
                const derSig = ecdsaSignatureToDer(rawSig);

                const finalAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                    criAsn1,
                    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(params.sigOid).getBytes())
                    ]),
                    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BITSTRING, false, String.fromCharCode(0) + forge.util.binary.raw.encode(derSig))
                ]);

                setCsrOutput(formatPem('CERTIFICATE REQUEST', forge.util.encode64(forge.asn1.toDer(finalAsn1).getBytes())));
                return;

            } else if (algOid === '1.3.101.112') {
                // Ed25519
                const cryptoKey = await window.crypto.subtle.importKey('pkcs8', pkcs8Buffer, { name: 'Ed25519' }, true, ['sign']);

                const jwk = await window.crypto.subtle.exportKey('jwk', cryptoKey);
                const { d: _d, ...publicJwk } = jwk;
                const pubCryptoKey = await window.crypto.subtle.importKey('jwk', publicJwk, { name: 'Ed25519' }, true, []);
                const spkiBuffer = await window.crypto.subtle.exportKey('spki', pubCryptoKey);
                const spkiAsn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(new Uint8Array(spkiBuffer)));

                const dummyKeys = forge.pki.rsa.generateKeyPair(1024);
                const csr = forge.pki.createCertificationRequest();
                csr.publicKey = dummyKeys.publicKey; // CRITICAL FIX: Set public key before sign()

                const subject = [
                    { name: 'commonName', value: formData.commonName },
                    { name: 'organizationName', value: formData.organization },
                    { name: 'organizationalUnitName', value: formData.organizationalUnit },
                    { name: 'countryName', value: formData.country },
                    { name: 'stateOrProvinceName', value: formData.state },
                    { name: 'localityName', value: formData.locality },
                    { name: 'emailAddress', value: formData.email }
                ].filter(attr => attr.value);
                if (subject.length > 0) csr.setSubject(subject);

                csr.sign(dummyKeys.privateKey);
                const criAsn1 = (forge.pki.certificationRequestToAsn1(csr) as any).value[0];
                criAsn1.value[2] = spkiAsn1;

                const criDer = forge.asn1.toDer(criAsn1).getBytes();
                const criUint8 = new Uint8Array(criDer.length);
                for (let i = 0; i < criDer.length; i++) criUint8[i] = criDer.charCodeAt(i);

                const sig = await window.crypto.subtle.sign({ name: 'Ed25519' }, cryptoKey, criUint8);

                const finalAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                    criAsn1,
                    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('1.3.101.112').getBytes())
                    ]),
                    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BITSTRING, false, String.fromCharCode(0) + forge.util.binary.raw.encode(new Uint8Array(sig)))
                ]);

                setCsrOutput(formatPem('CERTIFICATE REQUEST', forge.util.encode64(forge.asn1.toDer(finalAsn1).getBytes())));
                return;

            } else {
                // RSA or Other via forge
                const key = forge.pki.privateKeyFromPem(privateKey);
                const csr = forge.pki.createCertificationRequest();
                const subject = [
                    { name: 'commonName', value: formData.commonName },
                    { name: 'organizationName', value: formData.organization },
                    { name: 'organizationalUnitName', value: formData.organizationalUnit },
                    { name: 'countryName', value: formData.country },
                    { name: 'stateOrProvinceName', value: formData.state },
                    { name: 'localityName', value: formData.locality },
                    { name: 'emailAddress', value: formData.email }
                ].filter(attr => attr.value);
                if (subject.length > 0) csr.setSubject(subject);

                if (formData.sans) {
                    const sans = formData.sans.split(',').map(s => s.trim()).filter(Boolean);
                    if (sans.length > 0) {
                        csr.setAttributes([{
                            name: 'extensionRequest',
                            extensions: [{
                                name: 'subjectAltName',
                                altNames: sans.map(s => {
                                    if (/^[a-z]+:\/\/.+$/i.test(s)) return { type: 6, value: s };
                                    if (/^[0-9.]+$/.test(s)) return { type: 7, ip: s };
                                    if (/^.+@.+\..+$/.test(s)) return { type: 1, value: s };
                                    return { type: 2, value: s };
                                })
                            }]
                        }]);
                    }
                }

                if ((key as any).n) {
                    csr.publicKey = forge.pki.setRsaPublicKey((key as any).n, (key as any).e);
                } else {
                    csr.publicKey = (key as any).publicKey;
                }

                csr.sign(key);
                setCsrOutput(forge.pki.certificationRequestToPem(csr));
            }

        } catch (e: any) {
            console.error('CSR Gen error:', e);
            setError(e.message || "Failed to generate CSR");
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(csrOutput).then(() => {
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        });
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
            {error && (
                <div style={{
                    padding: '1rem', background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px',
                    color: '#fca5a5', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}><AlertCircle size={18} /> {error}</div>
            )}
            {csrOutput && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ margin: 0, color: '#ec4899' }}>CSR (PEM)</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={copyToClipboard}>
                                {copyStatus ? <Check size={14} /> : <Copy size={14} />}
                                <span style={{ marginLeft: '4px' }}>{copyStatus ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={downloadCSR}>
                                <Download size={14} /> <span style={{ marginLeft: '4px' }}>Save</span>
                            </button>
                        </div>
                    </div>
                    <textarea readOnly value={csrOutput} rows={8} style={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} />
                </div>
            )}
        </div>
    );
}
