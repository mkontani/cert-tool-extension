import * as asn1js from 'asn1js';
import type { DisplayEntry } from './types';

const SCT_V1_HEADER_LENGTH = 1 + 32 + 8; // version, LogID, timestamp

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

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
        const end = pos + 2 + view.getUint16(pos);
        const start = pos + 2;
        if (end > list.length) throw new Error('Truncated SCT');
        if (list[start] !== 0) {
            entries.push({ type: 'SCT', value: `version ${list[start] + 1} (not decoded)` });
        } else {
            if (end - start < SCT_V1_HEADER_LENGTH) throw new Error('Truncated SCT v1');
            const logId = list.subarray(start + 1, start + 33);
            const timestamp = new Date(Number(view.getBigUint64(start + 33)));
            entries.push({ type: 'SCT', value: `${timestamp.toUTCString()} · log ${base64(logId)}` });
        }
        pos = end;
    }
    return entries;
}
