import { Fragment } from 'react';
import type { InspectionResult } from '../inspector/types';
import CopyButton from './CopyButton';

interface HashRow {
    readonly label: string;
    /** What the copy button copies, for its name and messages. */
    readonly copyLabel: string;
    readonly value: string;
    readonly hint?: string;
}

function hashRows(info: InspectionResult): HashRow[] {
    const rows: HashRow[] = [];
    if (info.fingerprints) {
        rows.push({ label: 'SHA-256 Fingerprint:', copyLabel: 'SHA-256 fingerprint', value: info.fingerprints.sha256 });
        rows.push({ label: 'SHA-1 Fingerprint:', copyLabel: 'SHA-1 fingerprint', value: info.fingerprints.sha1 });
    }
    if (info.spkiSha256) {
        rows.push({
            label: 'Public Key Pin:', copyLabel: 'public key pin', value: info.spkiSha256,
            hint: 'pin-sha256 (RFC 7469): the base64 SHA-256 of the public key. It stays the same when the certificate is renewed with the same key.',
        });
    }
    return rows;
}

/** Colon-separated hex that wraps only after a colon, so a byte is never split across lines. */
function wrapAfterColons(value: string) {
    const bytes = value.split(':');
    return bytes.map((byte, i) => (
        <Fragment key={i}>{byte}{i < bytes.length - 1 && <>:<wbr /></>}</Fragment>
    ));
}

/**
 * The hashes for matching a certificate against a browser, `openssl x509 -fingerprint` or a pinning configuration,
 * as rows of the Inspector's details grid, each with its own copy button.
 */
export default function FingerprintRows({ info }: { readonly info: InspectionResult }) {
    return hashRows(info).map(({ label, copyLabel, value, hint }) => (
        <Fragment key={label}>
            <strong style={{ color: '#94a3b8', whiteSpace: 'nowrap' }} title={hint}>{label}</strong>
            <div className="hash-value">
                <code>{value.includes(':') ? wrapAfterColons(value) : value}</code>
                <CopyButton text={value} label={copyLabel} />
            </div>
        </Fragment>
    ));
}
