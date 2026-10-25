export type PemKind = 'certificate' | 'csr';

export interface PemBlock {
    readonly kind: PemKind;
    readonly der: Uint8Array;
    /** How many blocks of the same kind the input holds, e.g. 3 for a full chain. */
    readonly count: number;
}

const LABELS: Readonly<Record<string, PemKind>> = {
    'CERTIFICATE': 'certificate',
    'X509 CERTIFICATE': 'certificate',
    'CERTIFICATE REQUEST': 'csr',
    'NEW CERTIFICATE REQUEST': 'csr',
};

const BEGIN = '-----BEGIN ';
const DASHES = '-----';
const MAX_LABEL_LENGTH = 64;

const kindOf = (label: string): PemKind | undefined => (Object.hasOwn(LABELS, label) ? LABELS[label] : undefined);

/** Occurrences of every BEGIN line of this kind; one split per label keeps this linear. */
const countBlocks = (text: string, kind: PemKind) =>
    Object.keys(LABELS)
        .filter(label => LABELS[label] === kind)
        .reduce((count, label) => count + text.split(`${BEGIN}${label}${DASHES}`).length - 1, 0);

function decodeBase64(body: string, label: string): Uint8Array {
    try {
        return Uint8Array.from(atob(body.replace(/\s/g, '')), c => c.charCodeAt(0));
    } catch {
        throw new Error(`The ${label} block is not valid base64.`);
    }
}

/**
 * Finds the first certificate or CSR in pasted text, skipping keys and other PEM blocks.
 * Uses indexOf rather than a regex so that hostile input cannot make the scan quadratic.
 */
export function findPemBlock(text: string): PemBlock | null {
    for (let begin = text.indexOf(BEGIN); begin !== -1; begin = text.indexOf(BEGIN, begin + BEGIN.length)) {
        const labelStart = begin + BEGIN.length;
        const labelEnd = text.indexOf(DASHES, labelStart);
        if (labelEnd === -1) return null;
        if (labelEnd - labelStart > MAX_LABEL_LENGTH) continue;
        const label = text.slice(labelStart, labelEnd);
        const kind = kindOf(label);
        if (!kind) continue;
        const bodyStart = labelEnd + DASHES.length;
        const end = text.indexOf(`-----END ${label}${DASHES}`, bodyStart);
        if (end === -1) throw new Error(`The ${label} block has no matching END line.`);
        return { kind, der: decodeBase64(text.slice(bodyStart, end), label), count: countBlocks(text, kind) };
    }
    return null;
}
