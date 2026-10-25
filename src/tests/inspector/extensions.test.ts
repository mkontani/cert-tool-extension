import { describe, it, expect } from 'vitest';
import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { Certificate, Extension } from '@peculiar/asn1-x509';
import { describeExtension } from '../../inspector/extensions';
import type { ExtensionInfo } from '../../inspector/types';
import { GOOGLE_LEAF } from '../lint/realWorldFixtures';
import { KITCHEN_SINK_CERT } from '../inspectorFixtures';

function extensionsOf(pem: string): ExtensionInfo[] {
    const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    const cert = AsnConvert.parse(der, Certificate);
    return (cert.tbsCertificate.extensions ?? []).map(ext => describeExtension(new Uint8Array(AsnConvert.serialize(ext))));
}

function find(extensions: readonly ExtensionInfo[], name: string): ExtensionInfo {
    const found = extensions.find(ext => ext.name === name);
    if (!found) throw new Error(`${name} not found in ${extensions.map(ext => ext.name).join(', ')}`);
    return found;
}

describe('describeExtension (www.google.com)', () => {
    const extensions = extensionsOf(GOOGLE_LEAF);

    it('shows only the key identifier of authorityKeyIdentifier', () => {
        const aki = find(extensions, 'authorityKeyIdentifier');
        expect(aki.value).toBe('75:BE:C4:77:AE:89:F6:44:37:7D:CF:B1:68:1F:1D:1A:EB:DC:34:59');
        expect(aki.entries).toBeUndefined();
    });

    it('lists the CRL distribution point URIs', () => {
        expect(find(extensions, 'cRLDistributionPoints').entries).toEqual([
            { type: 'URI', value: 'http://c.pki.goog/we2/xuzt3PU9F_w.crl' },
        ]);
    });

    it('lists the authority information access locations by method', () => {
        expect(find(extensions, 'authorityInfoAccess').entries).toEqual([
            { type: 'CA Issuers', value: 'http://i.pki.goog/we2.crt' },
        ]);
    });

    it('names the CA/B Forum reserved policy', () => {
        expect(find(extensions, 'certificatePolicies').entries).toEqual([
            { type: 'Policy', value: '2.23.140.1.2.1 (CA/B Domain Validated)' },
        ]);
    });

    it('lists each SCT with its timestamp and log ID', () => {
        expect(find(extensions, 'signedCertificateTimestampList').entries).toEqual([
            { type: 'SCT', value: 'Mon, 28 Sep 2026 19:41:22 GMT · log 2AlVO5RPev/IFhlvlE+Fq7D4/F6HVSYPFdEucrtFSxQ=' },
            { type: 'SCT', value: 'Mon, 28 Sep 2026 19:41:22 GMT · log dNudWPfUfp39eHoWKpkcGM9pjafHKZGMmhiwRQ26RLw=' },
        ]);
    });

    it('keeps the formatting of the extensions forge already decoded', () => {
        expect(find(extensions, 'subjectKeyIdentifier').value).toBe('DD:9E:D8:BD:A3:3C:B2:CA:D1:C0:7A:7A:5E:C9:75:19:7B:09:F9:4E');
        expect(find(extensions, 'keyUsage')).toMatchObject({ value: 'digitalSignature', critical: true });
        expect(find(extensions, 'extKeyUsage').value).toBe('serverAuth');
        expect(find(extensions, 'basicConstraints')).toMatchObject({ value: 'CA:false', critical: true });
        expect(find(extensions, 'subjectAltName').entries).toEqual([{ type: 'DNS', value: 'www.google.com' }]);
    });
});

describe('describeExtension (kitchen sink)', () => {
    const extensions = extensionsOf(KITCHEN_SINK_CERT);

    it('formats IPv6 addresses per RFC 5952', () => {
        expect(find(extensions, 'subjectAltName').entries).toEqual([
            { type: 'DNS', value: 'ks.example.jp' },
            { type: 'IP', value: '2001:db8:0:1::1' },
            { type: 'IP', value: '2001:db8::1:0:0:1' },
        ]);
    });

    it('keeps extKeyUsage OIDs it has no name for', () => {
        expect(find(extensions, 'extKeyUsage').value).toBe('serverAuth, 1.3.6.1.4.1.311.10.3.4');
    });

    it('decodes the TLS feature (OCSP Must-Staple)', () => {
        expect(find(extensions, 'tlsFeature').value).toBe('status_request (OCSP Must-Staple)');
    });

    it('lists policies with their CPS and user notice qualifiers', () => {
        expect(find(extensions, 'certificatePolicies').entries).toEqual([
            { type: 'Policy', value: '2.23.140.1.2.2 (CA/B Organization Validated)' },
            { type: 'Policy', value: '1.3.6.1.4.1.99999.1' },
            { type: 'CPS', value: 'https://example.jp/cps' },
            { type: 'Notice', value: 'Test notice' },
        ]);
    });

    it('lists the key ID, issuer and serial of authorityKeyIdentifier', () => {
        expect(find(extensions, 'authorityKeyIdentifier').entries).toEqual([
            { type: 'KeyID', value: '7A:ED:1D:DA:AA:4B:7E:D5:B6:84:3D:00:39:D9:72:38:E3:83:21:58' },
            { type: 'DirName', value: 'countryName=JP, organizationName=株式会社テスト, commonName=ks.example.jp' },
            { type: 'Serial', value: '04:2D:A5:CD:0D:A3:AE:98:74:AB:E4:6A:A4:E2:57:97:0C:AA:47:A9' },
        ]);
    });

    it('lists permitted and excluded name constraints', () => {
        expect(find(extensions, 'nameConstraints').entries).toEqual([
            { type: 'Permitted', value: 'DNS .example.jp' },
            { type: 'Excluded', value: 'IP 10.0.0.0/8' },
        ]);
    });

    it('lists every CRL distribution point', () => {
        expect(find(extensions, 'cRLDistributionPoints').entries).toEqual([
            { type: 'URI', value: 'http://crl.example.jp/a.crl' },
            { type: 'URI', value: 'ldap://ldap.example.jp/cn=CA' },
        ]);
    });

    it('lists OCSP and CA issuer locations', () => {
        expect(find(extensions, 'authorityInfoAccess').entries).toEqual([
            { type: 'OCSP', value: 'http://ocsp.example.jp' },
            { type: 'CA Issuers', value: 'http://ca.example.jp/ca.crt' },
        ]);
    });

    it('decodes policyConstraints', () => {
        expect(find(extensions, 'policyConstraints').value).toBe('requireExplicitPolicy:0');
    });

    it('shows an unknown extension as hex under its OID', () => {
        expect(find(extensions, '1.2.3.4.5').value).toBe('(Hex) 0C:05:68:65:6C:6C:6F');
    });
});

describe('describeExtension (name constraints)', () => {
    const constraints = (subtree: number[]) => {
        const permitted = [0xa0, subtree.length, ...subtree];
        const value = [0x30, permitted.length, ...permitted];
        const ext = new Extension({ extnID: '2.5.29.30', critical: true, extnValue: new OctetString(new Uint8Array(value)) });
        return describeExtension(new Uint8Array(AsnConvert.serialize(ext))).entries;
    };
    const ipSubtree = (bytes: number[]) => [0x30, bytes.length + 2, 0x87, bytes.length, ...bytes];

    it('spells out a non-contiguous IPv4 mask', () => {
        expect(constraints(ipSubtree([10, 0, 0, 0, 255, 0, 255, 0]))).toEqual([{ type: 'Permitted', value: 'IP 10.0.0.0/255.0.255.0' }]);
    });

    it('uses a prefix length for a contiguous IPv6 mask', () => {
        const address = [0x20, 0x01, 0x0d, 0xb8, ...new Array(12).fill(0)];
        const mask = [0xff, 0xff, 0xff, 0xff, ...new Array(12).fill(0)];
        expect(constraints(ipSubtree([...address, ...mask]))).toEqual([{ type: 'Permitted', value: 'IP 2001:db8::/32' }]);
    });

    it('decodes the other name forms', () => {
        const dns = [0x82, 0x0b, ...Buffer.from('.example.jp')];
        expect(constraints([0x30, dns.length, ...dns])).toEqual([{ type: 'Permitted', value: 'DNS .example.jp' }]);
    });
});
