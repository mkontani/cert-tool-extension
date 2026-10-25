/** One item of a multi-valued field, e.g. a SAN name or a CRL URI. */
export interface DisplayEntry {
    readonly type: string;
    readonly value: string;
}

export interface ExtensionInfo {
    readonly name: string;
    readonly critical: boolean;
    /** Single-line rendering; for list-valued extensions, the entries joined. */
    readonly value: string;
    /** Set for list-valued extensions so each item can be shown on its own row. */
    readonly entries?: readonly DisplayEntry[];
}

/** What the Inspector shows for one certificate or CSR. */
export interface InspectionResult {
    readonly type: string;
    /** Short name for choosing between several pasted certificates: the subject's common name when there is one. */
    readonly label: string;
    readonly subject: string;
    readonly issuer?: string;
    readonly serial?: string;
    readonly notBefore?: string;
    readonly notAfter?: string;
    readonly pubKeyAlgo: string;
    readonly signatureAlgo: string;
    readonly extensions: readonly ExtensionInfo[];
}
