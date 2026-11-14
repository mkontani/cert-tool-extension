/** Characters that Windows, macOS or Chrome's downloads refuse in a file name, and runs of white space. */
const UNSAFE_IN_FILE_NAME = /[\p{Cc}\s\\/:*?"<>|]+/gu;

/**
 * A file name made from text such as a common name: anything a file name cannot hold becomes "_",
 * and leading dots are dropped, so the file is neither hidden nor "..".
 */
export function safeFileName(name: string, fallback: string): string {
    return name.trim().replace(UNSAFE_IN_FILE_NAME, '_').replace(/^\.+/, '') || fallback;
}

/** The file a CSR is saved to, named after its common name; the "*" of a wildcard becomes "wildcard". */
export const csrFileName = (commonName: string): string =>
    `${safeFileName(commonName.trim().replace(/^\*\./, 'wildcard.'), 'request')}.csr`;
