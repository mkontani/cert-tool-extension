import * as asn1js from 'asn1js';
import type { DisplayEntry } from './types';

const LOG_ID_LENGTH = 32;
/** version, LogID, timestamp, extensions length, hash and signature algorithms, signature length */
const SCT_V1_MIN_LENGTH = 1 + LOG_ID_LENGTH + 8 + 2 + 2 + 2;

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** One v1 SCT (RFC 6962 §3.2), checking that its fields exactly fill `[start, end)`. */
function describeSctV1(list: Uint8Array, view: DataView, start: number, end: number): string {
    if (end - start < SCT_V1_MIN_LENGTH) throw new Error('Truncated SCT v1');
    const signatureStart = start + 1 + LOG_ID_LENGTH + 8 + 2 + view.getUint16(start + 1 + LOG_ID_LENGTH + 8);
    if (signatureStart + 4 > end || signatureStart + 4 + view.getUint16(signatureStart + 2) !== end) {
        throw new Error('SCT v1 fields do not match its length');
    }
    const logId = list.subarray(start + 1, start + 1 + LOG_ID_LENGTH);
    const millis = view.getBigUint64(start + 1 + LOG_ID_LENGTH);
    const timestamp = new Date(Number(millis));
    const when = Number.isNaN(timestamp.getTime()) ? `timestamp ${millis} ms` : timestamp.toUTCString();
    return `${when} · log ${base64(logId)}`;
}

/**
 * Lists the SCTs of an RFC 6962 §3.3 SignedCertificateTimestampList extension value:
 * a DER OCTET STRING wrapping a TLS-encoded list of length-prefixed SCTs.
 */
export function describeSctList(extnValue: ArrayBuffer): DisplayEntry[] {
    const parsed = asn1js.fromBER(extnValue);
    if (parsed.offset === -1 || !(parsed.result instanceof asn1js.OctetString)) throw new Error('SCT list is not an OCTET STRING');
    const list = parsed.result.valueBlock.valueHexView;
    const view = new DataView(list.buffer, list.byteOffset, list.byteLength);
    if (list.length < 2 || view.getUint16(0) !== list.length - 2) throw new Error('SCT list length mismatch');

    const entries: DisplayEntry[] = [];
    for (let pos = 2; pos < list.length;) {
        if (pos + 2 > list.length) throw new Error('Truncated SCT length');
        const start = pos + 2;
        const end = start + view.getUint16(pos);
        if (end === start) throw new Error('Empty SCT');
        if (end > list.length) throw new Error('Truncated SCT');
        const version = list[start];
        entries.push({
            type: 'SCT',
            value: version === 0 ? describeSctV1(list, view, start, end) : `version ${version + 1} (not decoded)`,
        });
        pos = end;
    }
    return entries;
}
