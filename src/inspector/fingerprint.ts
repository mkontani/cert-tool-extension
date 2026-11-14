import forge from 'node-forge';
import { colonHex } from './format';

type Digest = typeof forge.md.sha256 | typeof forge.md.sha1;

/** The digest of DER bytes, computed synchronously so inspect() stays synchronous. */
function digest(algorithm: Digest, der: Uint8Array): Uint8Array {
    const bytes = algorithm.create().update(forge.util.binary.raw.encode(der)).digest().getBytes();
    return Uint8Array.from(bytes, c => c.charCodeAt(0));
}

/** A certificate's fingerprints, written as `openssl x509 -fingerprint` and Chrome's certificate viewer write them. */
export interface Fingerprints {
    readonly sha256: string;
    readonly sha1: string;
}

export const fingerprintsOf = (certificateDer: Uint8Array): Fingerprints => ({
    sha256: colonHex(digest(forge.md.sha256, certificateDer)),
    sha1: colonHex(digest(forge.md.sha1, certificateDer)),
});

/**
 * The base64 SHA-256 of a SubjectPublicKeyInfo: the pin-sha256 value of RFC 7469, which stays the same when the certificate is
 * renewed with the same key. inspect() hands it the SPKI as node-forge re-encodes it, which is the same bytes for any
 * DER-encoded certificate; only a malformed one with non-minimal lengths would get a pin that differs from openssl's.
 * The certificate fingerprints, by contrast, hash the original bytes.
 */
export const spkiPinOf = (spkiDer: Uint8Array): string => forge.util.encode64(forge.util.binary.raw.encode(digest(forge.md.sha256, spkiDer)));
