import type { PageItem, PageScan } from '../../page/messages';
import type { InspectionResult } from '../../inspector/types';
import type { Validity } from '../../page/validity';

export const result = (overrides: Partial<InspectionResult> = {}): InspectionResult => ({
    type: 'X.509 Certificate',
    label: 'example.com',
    subject: 'CN=example.com',
    issuer: 'CN=Example CA',
    serial: '01ab',
    notBefore: 'Mon, 01 Jun 2026 00:00:00 GMT',
    notAfter: 'Tue, 01 Jun 2027 00:00:00 GMT',
    pubKeyAlgo: 'ECDSA P-256',
    signatureAlgo: 'ecdsa-with-SHA256',
    extensions: [],
    ...overrides,
});

export const certItem = (validity: Validity | undefined, overrides: Partial<InspectionResult> = {}): PageItem =>
    validity
        ? { status: 'ok', kind: 'certificate', result: result(overrides), validity }
        : { status: 'ok', kind: 'certificate', result: result(overrides) };

export const csrItem = (label = 'csr.example'): PageItem => ({
    status: 'ok',
    kind: 'csr',
    result: result({ type: 'Certificate Signing Request (CSR)', label, subject: `CN=${label}`, issuer: undefined, serial: undefined, notBefore: undefined, notAfter: undefined }),
});

export const errorItem = (error = 'The CERTIFICATE block is not valid base64.'): PageItem => ({ status: 'error', kind: 'certificate', error });

export const scanOf = (items: readonly PageItem[], truncated = false): PageScan => ({ items, truncated });
