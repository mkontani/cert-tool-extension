import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeFileName } from '../components/fileNames';
import { saveTextFile, type SaveApis, type SaveRequest } from '../components/saveFile';

const REQUEST: SaveRequest = { text: '-----BEGIN PRIVATE KEY-----', filename: 'private.key', description: 'Private key', extensions: ['.key'] };

const DISK_FULL = new DOMException('Disk full', 'QuotaExceededError');

/** A save dialog that hands back a file whose writes, closing and aborting are recorded. */
function picker(writes: string[], { failWrite = false, failClose = false } = {}) {
    return vi.fn(() => Promise.resolve({
        createWritable: () => Promise.resolve({
            write: (data: string) => (failWrite ? Promise.reject(DISK_FULL) : Promise.resolve(void writes.push(data))),
            close: () => (failClose ? Promise.reject(DISK_FULL) : Promise.resolve(void writes.push('<closed>'))),
            abort: () => Promise.resolve(void writes.push('<aborted>')),
        }),
    })) as unknown as NonNullable<SaveApis['showSaveFilePicker']>;
}

const refusing = (name: string) => vi.fn(() => Promise.reject(new DOMException('No.', name))) as unknown as NonNullable<SaveApis['showSaveFilePicker']>;

/** jsdom's Blob has no text(). */
const textOf = (blob: Blob) => new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
});

const downloads = (result: Promise<number> = Promise.resolve(7)) => ({ download: vi.fn(() => result) });

describe('saveTextFile', () => {
    const created: Blob[] = [];
    const revoked: string[] = [];
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // jsdom has no blob URLs.
        URL.createObjectURL = (blob: Blob) => { created.push(blob); return `blob:test/${created.length}`; };
        URL.revokeObjectURL = (url: string) => { revoked.push(url); };
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        created.length = 0;
        revoked.length = 0;
        warn.mockRestore();
    });

    it('writes the text to the file picked in the save dialog', async () => {
        const writes: string[] = [];
        const showSaveFilePicker = picker(writes);
        const api = downloads();
        expect(await saveTextFile(REQUEST, { showSaveFilePicker, downloads: api })).toBe('saved');
        expect(writes).toEqual(['-----BEGIN PRIVATE KEY-----', '<closed>']);
        expect(showSaveFilePicker).toHaveBeenCalledWith({
            suggestedName: 'private.key',
            types: [{ description: 'Private key', accept: { 'text/plain': ['.key'] } }],
        });
        expect(api.download).not.toHaveBeenCalled();
    });

    it('does nothing more when the save dialog is canceled', async () => {
        const api = downloads();
        expect(await saveTextFile(REQUEST, { showSaveFilePicker: refusing('AbortError'), downloads: api })).toBe('canceled');
        expect(api.download).not.toHaveBeenCalled();
    });

    it.each([
        ['the save dialog fails', { showSaveFilePicker: refusing('SecurityError') }],
        ['there is no save dialog', {}],
    ])("hands the file to Chrome's downloads, which asks where to save it, when %s", async (_, apis) => {
        const api = downloads();
        expect(await saveTextFile(REQUEST, { ...apis, downloads: api })).toBe('downloading');
        expect(api.download).toHaveBeenCalledWith({ url: 'blob:test/1', filename: 'private.key', saveAs: true });
        expect(await textOf(created[0])).toBe('-----BEGIN PRIVATE KEY-----');
        expect(revoked).toEqual(['blob:test/1']);
    });

    it.each([
        ['writing', { failWrite: true }, ['<aborted>']],
        ['closing', { failClose: true }, ['-----BEGIN PRIVATE KEY-----', '<aborted>']],
    ])('fails when %s the picked file fails, rather than ask again where to save it', async (_, failure, expected) => {
        const writes: string[] = [];
        const api = downloads();
        await expect(saveTextFile(REQUEST, { showSaveFilePicker: picker(writes, failure), downloads: api })).rejects.toBe(DISK_FULL);
        expect(writes).toEqual(expected);
        expect(api.download).not.toHaveBeenCalled();
    });

    it("hands the file to Chrome's downloads before letting go of its URL", async () => {
        const api = { download: vi.fn(() => Promise.resolve(revoked.length)) };
        await saveTextFile(REQUEST, { downloads: api });
        expect(await api.download.mock.results[0].value).toBe(0);
        expect(revoked).toEqual(['blob:test/1']);
    });

    it("counts it as canceled when Chrome's downloads say the user canceled", async () => {
        const api = downloads(Promise.reject(new Error('USER_CANCELED')));
        expect(await saveTextFile(REQUEST, { downloads: api })).toBe('canceled');
    });

    it('fails with the save dialog\'s error when there is nothing to fall back on', async () => {
        await expect(saveTextFile(REQUEST, { showSaveFilePicker: refusing('SecurityError') })).rejects.toThrow('No.');
        expect(created).toEqual([]);
    });

    it("fails when Chrome's downloads refuse the file, and lets go of its URL", async () => {
        const api = downloads(Promise.reject(new Error('Invalid filename')));
        await expect(saveTextFile(REQUEST, { downloads: api })).rejects.toThrow('Invalid filename');
        expect(revoked).toEqual(['blob:test/1']);
    });

    it('fails when there is no way to save a file, rather than download it without asking', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
        await expect(saveTextFile(REQUEST, {})).rejects.toThrow('Saving files is not available here.');
        expect(click).not.toHaveBeenCalled();
        expect(created).toEqual([]);
        click.mockRestore();
    });
});

describe('safeFileName', () => {
    it.each([
        ['app.example.com', 'app.example.com'],
        ['  My Server  ', 'My_Server'],
        ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j'],
        ['..', 'request'],
        ['.hidden', 'hidden'],
        ['', 'request'],
        ['tab\tand\nnewline', 'tab_and_newline'],
    ])('makes %j into %j', (name, expected) => {
        expect(safeFileName(name, 'request')).toBe(expected);
    });
});
