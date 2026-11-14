/** What to save, and how the save dialog offers it. */
export interface SaveRequest {
    readonly text: string;
    /** The name the save dialog suggests, e.g. "private.key". */
    readonly filename: string;
    /** The file type the save dialog lists, e.g. "Private key". */
    readonly description: string;
    /** The extensions of that file type, e.g. [".key"]. */
    readonly extensions: readonly string[];
}

/**
 * How a save went. "downloading" means Chrome's downloads took the file: Chrome asks where to save it and shows how that went,
 * and Cert Tool is not told whether the user saved or canceled.
 */
export type SaveOutcome = 'saved' | 'canceled' | 'downloading';

interface SavePickerOptions {
    readonly suggestedName: string;
    readonly types: readonly { readonly description: string; readonly accept: Readonly<Record<string, readonly string[]>> }[];
}

/** The ways to save a file; either can be missing, e.g. outside the extension. */
export interface SaveApis {
    /** The File System Access save dialog, which TypeScript's DOM types do not include. */
    readonly showSaveFilePicker?: (options: SavePickerOptions) => Promise<Pick<FileSystemFileHandle, 'createWritable'>>;
    readonly downloads?: { readonly download: (options: chrome.downloads.DownloadOptions) => Promise<number> };
}

function browserApis(): SaveApis {
    const { showSaveFilePicker } = window as Window & Pick<SaveApis, 'showSaveFilePicker'>;
    return {
        showSaveFilePicker: showSaveFilePicker?.bind(window),
        // Present only in extension pages, with the downloads permission.
        downloads: typeof chrome === 'undefined' ? undefined : chrome.downloads,
    };
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

type PickedFile = Pick<FileSystemFileHandle, 'createWritable'>;

/**
 * The file the user picks in the save dialog, or why there is none.
 * Only a dialog that fails falls back to Chrome's downloads, before any file was picked.
 */
async function pickFile(request: SaveRequest, apis: SaveApis): Promise<PickedFile | 'canceled' | 'unavailable'> {
    if (!apis.showSaveFilePicker) return 'unavailable';
    try {
        return await apis.showSaveFilePicker({
            suggestedName: request.filename,
            types: [{ description: request.description, accept: { 'text/plain': request.extensions } }],
        });
    } catch (e: unknown) {
        if (isAbort(e)) return 'canceled';
        if (!apis.downloads) throw e;
        console.warn("Cert Tool: the save dialog failed, so the file goes through Chrome's downloads", e);
        return 'unavailable';
    }
}

/**
 * Once a file is picked, a failure to write it is final: falling back would ask again where to save it, unexplained.
 * The write is aborted, so Chrome drops what it had written so far.
 */
async function writeFile(file: PickedFile, text: string): Promise<void> {
    const writable = await file.createWritable();
    try {
        await writable.write(text);
        await writable.close();
    } catch (e: unknown) {
        await writable.abort().catch((abortError: unknown) => console.warn('Cert Tool: could not abort writing the file', abortError));
        throw e;
    }
}

/**
 * The reason Chrome gives for a download canceled before it began. Canceling the Save As dialog is expected to come later,
 * once the download exists, so this only keeps a cancel from showing as a failure should Chrome report it this way.
 */
const USER_CANCELED = 'USER_CANCELED';

/** Chrome reads the blob once the download has started, so its URL can be let go of then, even while Chrome still asks where to save. */
async function saveWithDownloads(request: SaveRequest, downloads: NonNullable<SaveApis['downloads']>): Promise<SaveOutcome> {
    const url = URL.createObjectURL(new Blob([request.text], { type: 'text/plain' }));
    try {
        await downloads.download({ url, filename: request.filename, saveAs: true });
        return 'downloading';
    } catch (e: unknown) {
        if (e instanceof Error && e.message === USER_CANCELED) return 'canceled';
        throw e;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Saves text to a file the user picks: in the save dialog, or else through Chrome's downloads with its Save As dialog.
 * A file is never written without asking where, since it may hold a private key, so with neither available this fails.
 * @throws Error when the file could not be saved.
 */
export async function saveTextFile(request: SaveRequest, apis: SaveApis = browserApis()): Promise<SaveOutcome> {
    const picked = await pickFile(request, apis);
    if (picked === 'canceled') return 'canceled';
    if (picked !== 'unavailable') {
        await writeFile(picked, request.text);
        return 'saved';
    }
    if (!apis.downloads) throw new Error('Saving files is not available here.');
    return saveWithDownloads(request, apis.downloads);
}
