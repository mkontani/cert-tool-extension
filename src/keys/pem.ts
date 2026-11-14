/** One PEM block (RFC 7468): its label, such as "PRIVATE KEY", and everything between its BEGIN and END lines. */
export interface PemBlock {
    readonly label: string;
    /** The base64 body, preceded by any headers a legacy format puts there (e.g. "Proc-Type: 4,ENCRYPTED"). */
    readonly content: string;
}

const BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

/** Every PEM block in the text, in order. */
export const pemBlocks = (text: string): PemBlock[] => Array.from(text.matchAll(BLOCK), ([, label, content]) => ({ label, content }));

/** The bytes of a base64 body, ignoring line breaks and spaces; null when it is not base64. */
export function decodeBase64(body: string): Uint8Array<ArrayBuffer> | null {
    const compact = body.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) return null;
    return Uint8Array.from(atob(compact), c => c.charCodeAt(0));
}

const LINE_LENGTH = 64;

/** DER bytes as a PEM block with 64-character lines, ending with a newline. */
export function toPem(label: string, der: Uint8Array): string {
    let binary = '';
    for (const byte of der) binary += String.fromCharCode(byte);
    const base64 = btoa(binary);
    const lines = [];
    for (let i = 0; i < base64.length; i += LINE_LENGTH) lines.push(base64.slice(i, i + LINE_LENGTH));
    return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`, ''].join('\n');
}
