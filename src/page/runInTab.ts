import { isContentReply, type ContentCommand } from './messages';

/** The content script's file in the built extension (see vite.content.config.ts). */
export const CONTENT_SCRIPT_FILE = 'content.js';

export interface InjectApi {
    readonly scripting: Pick<typeof chrome.scripting, 'executeScript'>;
    readonly tabs: Pick<typeof chrome.tabs, 'sendMessage'>;
}

/**
 * Injects the content script into one frame of a tab and hands it a command.
 * Needs host access to the tab, which activeTab grants after the user opens the popup or picks the context menu item.
 * Injecting again is harmless: the content script registers its listener only once.
 */
export async function runInTab(api: InjectApi, tabId: number, frameId: number, command: ContentCommand): Promise<{ found: number }> {
    await api.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: [CONTENT_SCRIPT_FILE] });
    const reply: unknown = await api.tabs.sendMessage(tabId, command, { frameId });
    if (!isContentReply(reply)) throw new Error('The page did not respond.');
    if ('error' in reply) throw new Error(reply.error);
    return reply;
}

/** Browser pages, the Web Store and file:// URLs (unless allowed) reject injection with these messages. */
const RESTRICTED_PAGE = /cannot access|cannot be scripted/i;

/** A message for the user when injecting fails, e.g. "Couldn't scan this page: …". */
export function describeScanError(e: unknown, action = 'scan this page'): string {
    const message = e instanceof Error ? e.message : String(e);
    if (RESTRICTED_PAGE.test(message)) {
        return "Cert Tool can't read this page. Browser pages, the Chrome Web Store, and local files (unless allowed in the extension's settings) are off-limits to extensions.";
    }
    return `Couldn't ${action}: ${message}`;
}
