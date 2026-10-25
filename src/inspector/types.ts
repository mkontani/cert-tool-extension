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
