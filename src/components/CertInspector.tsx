import { useState } from 'react';
import forge from 'node-forge';
import { Search, AlertCircle } from 'lucide-react';

interface ParsedInfo {
    type: string;
    subject?: string;
    issuer?: string;
    serial?: string;
    notBefore?: string;
    notAfter?: string;
    pubKeyAlgo?: string;
    pubKeySize?: number;
    extensions?: { name: string; value: string; critical: boolean }[];
    signatureAlgo?: string;
}

export default function CertInspector() {
    const [inputPem, setInputPem] = useState('');
    const [info, setInfo] = useState<ParsedInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const formatDN = (dn: { attributes: any[] }) => {
        return dn.attributes.map(attr => {
            const shortName = attr.shortName || attr.name;
            return `${shortName}=${attr.value}`;
        }).join(', ');
    };

    const ipToString = (ip: string) => {
        if (!ip) return '';
        if (ip.length === 4) {
            return Array.from(ip).map(c => c.charCodeAt(0)).join('.');
        } else if (ip.length === 16) {
            const hex = [];
            for (let i = 0; i < 16; i += 2) {
                hex.push(((ip.charCodeAt(i) << 8) | ip.charCodeAt(i + 1)).toString(16));
            }
            return hex.join(':').replace(/(^|:)0(:0)*(:|$)/, '$1::$3').replace(/:{3,}/, '::');
        }
        return ip;
    };

    const parseDN = (asn1: any) => {
        const attributes: any[] = [];
        if (!asn1 || asn1.type !== forge.asn1.Type.SEQUENCE) return { attributes };
        for (const set of asn1.value) {
            if (set.type !== forge.asn1.Type.SET) continue;
            for (const seq of set.value) {
                if (seq.type !== forge.asn1.Type.SEQUENCE) continue;
                const oid = forge.asn1.derToOid(seq.value[0].value);
                const valueNode = seq.value[1];
                let value = valueNode.value;
                // Handle different string types (UTF8, Printable, etc.) correctly if needed
                const name = (forge.pki.oids as any)[oid] || oid;
                attributes.push({ name, value, shortName: name });
            }
        }
        return { attributes };
    };

    const formatHex = (bytes: string) => {
        const hex = (forge.util as any).bytesToHex(bytes);
        return hex.match(/.{2}/g)?.join(':').toUpperCase() || hex;
    };

    const decodeExtension = (extNode: any) => {
        // Use forge's internal decoder for the heavy lifting
        const ext = (forge.pki as any).certificateExtensionFromAsn1(extNode);
        const name = ext.name || ext.id;
        const critical = ext.critical;
        let value = String(ext.value);

        // Human-readable formatting for common extensions
        if (name === 'subjectAltName' || name === 'issuerAltName') {
            if (ext.altNames) {
                value = ext.altNames.map((an: any) => {
                    const typeMap: Record<number, string> = { 1: 'Email', 2: 'DNS', 6: 'URI', 7: 'IP' };
                    const label = typeMap[an.type as number] || `Type${an.type}`;
                    let v = an.value || an.ip || an.uri || an.email;
                    if (an.type === 7 && typeof v === 'string') v = ipToString(v);
                    return `${label}:${v}`;
                }).join(', ');
            }
        } else if (name === 'keyUsage') {
            const usages = [];
            const fields = [
                'digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment',
                'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'
            ];
            for (const f of fields) { if (ext[f]) usages.push(f); }
            value = usages.join(', ') || value;
        } else if (name === 'extKeyUsage') {
            const usages = [];
            const fields = ['serverAuth', 'clientAuth', 'codeSigning', 'emailProtection', 'timeStamping', 'OCSPSigning'];
            for (const f of fields) { if (ext[f]) usages.push(f); }
            // If forge didn't recognize any flags, it might be raw OIDs in an array
            if (usages.length === 0 && Array.isArray(ext.value)) {
                value = ext.value.map((oid: string) => (forge.pki.oids as any)[oid] || oid).join(', ');
            } else {
                value = usages.join(', ') || value;
            }
        } else if (name === 'basicConstraints') {
            const parts = [];
            if (ext.cA !== undefined) parts.push(`CA:${ext.cA}`);
            if (ext.pathLenConstraint !== undefined) parts.push(`pathLen:${ext.pathLenConstraint}`);
            value = parts.join(', ') || 'None';
        } else if (name === 'subjectKeyIdentifier' || name === 'authorityKeyIdentifier') {
            // Forge puts the hex string in a specific property if successfully decoded
            if (ext.subjectKeyIdentifier) value = formatHex((forge.util as any).hexToBytes(ext.subjectKeyIdentifier));
            else if (ext.authorityKeyIdentifier) value = formatHex((forge.util as any).hexToBytes(ext.authorityKeyIdentifier));
            else if (typeof ext.value === 'string' && /[\x00-\x1f]/.test(ext.value)) value = formatHex(ext.value);
        }

        // Final cleanup for binary residues
        if (typeof value === 'string' && /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/.test(value)) {
            value = `(Hex) ${formatHex(value)}`;
        }

        return { name, value, critical };
    };

    const extractPubKeyInfo = (spki: any) => {
        const algIdSeq = spki.value[0];
        const algOid = forge.asn1.derToOid(algIdSeq.value[0].value);

        if (algOid === '1.2.840.113549.1.1.1') {
            try {
                const publicKey = forge.pki.publicKeyFromAsn1(spki);
                return { algo: 'RSA', size: (publicKey as any).n.bitLength() };
            } catch (e) {
                return { algo: 'RSA (Parse Error)' };
            }
        } else if (algOid === '1.2.840.10045.2.1') {
            const curveOid = forge.asn1.derToOid(algIdSeq.value[1].value);
            let curveName = 'Unknown';
            if (curveOid === '1.2.840.10045.3.1.7') curveName = 'P-256';
            else if (curveOid === '1.3.132.0.34') curveName = 'P-384';
            else if (curveOid === '1.3.132.0.35') curveName = 'P-521';
            return { algo: `ECDSA (${curveName})` };
        } else if (algOid === '1.3.101.112') {
            return { algo: 'Ed25519' };
        }
        return { algo: `Unknown (${algOid})` };
    };

    const parseInput = () => {
        setError(null);
        setInfo(null);
        if (!inputPem.trim()) return;

        try {
            const b64 = inputPem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
            const binary = window.atob(b64);
            const der = forge.util.binary.raw.encode(new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i)));
            const asn1 = forge.asn1.fromDer(der);

            if (inputPem.includes('CERTIFICATE REQUEST')) {
                const cri = (asn1 as any).value[0];
                const subject = formatDN(parseDN(cri.value[1]));
                const spki = cri.value[2];
                const attributesNode = cri.value[3];

                const pubKeyInfo = extractPubKeyInfo(spki);
                const sigAlgOid = forge.asn1.derToOid((asn1 as any).value[1].value[0].value);
                const oidMap: Record<string, string> = {
                    '1.2.840.10045.4.3.2': 'ecdsa-with-sha256',
                    '1.2.840.10045.4.3.3': 'ecdsa-with-sha384',
                    '1.2.840.10045.4.3.4': 'ecdsa-with-sha512',
                    '1.3.101.112': 'Ed25519'
                };
                const signatureAlgo = oidMap[sigAlgOid] || (forge.pki.oids as any)[sigAlgOid] || sigAlgOid;

                let extensions: { name: string; value: string; critical: boolean }[] = [];
                if (attributesNode && attributesNode.value) {
                    for (let i = 0; i < attributesNode.value.length; i++) {
                        const attr = attributesNode.value[i];
                        const attrOid = forge.asn1.derToOid(attr.value[0].value);
                        if (attrOid === '1.2.840.113549.1.9.14') {
                            const extsSeq = attr.value[1].value[0];
                            for (let j = 0; j < extsSeq.value.length; j++) {
                                extensions.push(decodeExtension(extsSeq.value[j]));
                            }
                        }
                    }
                }

                setInfo({
                    type: 'Certificate Signing Request (CSR)',
                    subject,
                    pubKeyAlgo: pubKeyInfo.algo,
                    pubKeySize: pubKeyInfo.size,
                    signatureAlgo,
                    extensions
                });

            } else if (inputPem.includes('CERTIFICATE')) {
                const tbs = (asn1 as any).value[0];
                let offset = 0;
                if (tbs.value[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && tbs.value[0].type === 0) {
                    offset = 1;
                }

                const serial = (forge.util as any).bytesToHex(tbs.value[offset].value);
                const issuer = formatDN(parseDN(tbs.value[offset + 2]));

                const validity = tbs.value[offset + 3];
                const parseDate = (node: any) => {
                    if (node.type === forge.asn1.Type.UTCTIME) return (forge.asn1 as any).utcTimeToDate(node.value).toUTCString();
                    if (node.type === forge.asn1.Type.GENERALIZEDTIME) return (forge.asn1 as any).generalizedTimeToDate(node.value).toUTCString();
                    return 'Unknown';
                };

                const subject = formatDN(parseDN(tbs.value[offset + 4]));
                const spki = tbs.value[offset + 5];

                const pubKeyInfo = extractPubKeyInfo(spki);
                const sigAlgOid = forge.asn1.derToOid((asn1 as any).value[1].value[0].value);
                const oidMap: Record<string, string> = {
                    '1.2.840.10045.4.3.2': 'ecdsa-with-sha256',
                    '1.2.840.10045.4.3.3': 'ecdsa-with-sha384',
                    '1.2.840.10045.4.3.4': 'ecdsa-with-sha512',
                    '1.3.101.112': 'Ed25519'
                };
                const signatureAlgo = oidMap[sigAlgOid] || (forge.pki.oids as any)[sigAlgOid] || sigAlgOid;

                let extensions: any[] = [];
                for (let i = offset + 6; i < tbs.value.length; i++) {
                    const node = tbs.value[i];
                    if (node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node.type === 3) {
                        const extsSeq = node.value[0];
                        for (let j = 0; j < extsSeq.value.length; j++) {
                            extensions.push(decodeExtension(extsSeq.value[j]));
                        }
                    }
                }

                setInfo({
                    type: 'X.509 Certificate',
                    subject,
                    issuer,
                    serial,
                    notBefore: parseDate(validity.value[0]),
                    notAfter: parseDate(validity.value[1]),
                    pubKeyAlgo: pubKeyInfo.algo,
                    pubKeySize: pubKeyInfo.size,
                    signatureAlgo,
                    extensions
                });
            } else {
                throw new Error('Unsupported format. Please feed a CERTIFICATE or CERTIFICATE REQUEST (CSR).');
            }
        } catch (e: any) {
            console.error('Inspector parse error:', e);
            setError(`Failed to parse: ${e.message || "Unknown error"}`);
        }
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '0.5rem' }}>
                <Search size={24} color="#06b6d4" />
                <h2 style={{ margin: 0 }}>Certificate Inspector</h2>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="inspector-input">Input (Certificate or CSR)</label>
                <textarea
                    id="inspector-input"
                    value={inputPem}
                    onChange={(e) => setInputPem(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                <button className="btn" onClick={parseInput} style={{ marginTop: '0.5rem', width: '100%' }}>Parse</button>
            </div>
            {error && (
                <div style={{
                    padding: '1rem', background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px',
                    color: '#fca5a5', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}><AlertCircle size={18} /> {error}</div>
            )}
            {info && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }} data-testid="inspector-results">
                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>{info.type}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr', gap: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                        {info.serial && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Serial Number:</strong><code style={{ wordBreak: 'break-all' }}>{info.serial}</code></>}
                        <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Subject:</strong><div style={{ wordBreak: 'break-word', color: '#e2e8f0' }}>{info.subject}</div>
                        {info.issuer && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Issuer:</strong><div style={{ wordBreak: 'break-word', color: '#e2e8f0' }}>{info.issuer}</div></>}
                        {info.notBefore && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Validity:</strong><div><div>{info.notBefore}</div><div style={{ fontSize: '0.8rem', opacity: 0.7 }}>to</div><div>{info.notAfter}</div></div></>}
                        {(info.pubKeyAlgo || info.pubKeySize) && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Public Key:</strong><div>{info.pubKeyAlgo} {info.pubKeySize ? `(${info.pubKeySize} bits)` : ''}</div></>}
                        {info.signatureAlgo && <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Signature:</strong><div>{info.signatureAlgo}</div></>}
                        {info.extensions && info.extensions.length > 0 && (
                            <><strong style={{ color: '#94a3b8', whiteSpace: 'nowrap', marginTop: '0.5rem' }}>Extensions:</strong>
                                <div style={{ marginTop: '0.5rem' }}>
                                    {info.extensions.map((ext, i) => (
                                        <div key={i} style={{ marginBottom: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '0.5rem' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ext.name} {ext.critical && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>(Critical)</span>}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8, wordBreak: 'break-all' }}>{ext.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
