import { inspectTexts } from '../page/inspectTexts';
import { isInspectTextsRequest, MAX_TEXT_LENGTH, MSG_INSPECT_SELECTION, type ContentCommand, type PageScan } from '../page/messages';
import { describeScanError, runInTab, type InjectApi } from '../page/runInTab';

export const MENU_INSPECT_SELECTION = 'cert-tool-inspect-selection';
/** The toolbar title from manifest.json, restored once a failure is cleared. */
const DEFAULT_TITLE = 'Cert Tool';
const FAILURE_BADGE_COLOR = '#dc2626';

/** The parts of the chrome API the background uses, so tests can pass fakes. */
export interface BackgroundApi extends InjectApi {
    readonly runtime: Pick<typeof chrome.runtime, 'id' | 'onInstalled' | 'onMessage'>;
    readonly contextMenus: Pick<typeof chrome.contextMenus, 'removeAll' | 'create' | 'onClicked'>;
    readonly action: Pick<typeof chrome.action, 'setBadgeText' | 'setBadgeBackgroundColor' | 'setTitle'>;
}

/** Context menu items persist across service worker restarts, so they are (re)created only on install and update. */
export async function createMenus(api: BackgroundApi): Promise<void> {
    await api.contextMenus.removeAll();
    api.contextMenus.create({ id: MENU_INSPECT_SELECTION, title: 'Inspect certificate with Cert Tool', contexts: ['selection'] });
}

const selectionCommand = (info: chrome.contextMenus.OnClickData, preferFallback: boolean): ContentCommand =>
    ({ type: MSG_INSPECT_SELECTION, fallbackText: (info.selectionText ?? '').slice(0, MAX_TEXT_LENGTH), preferFallback });

/** The context menu has no UI of its own, so a failure is shown on the toolbar icon of that tab. */
async function showFailure(api: BackgroundApi, tabId: number, e: unknown): Promise<void> {
    console.error('Cert Tool: could not inspect the selection', e);
    await Promise.all([
        api.action.setBadgeText({ tabId, text: '!' }),
        api.action.setBadgeBackgroundColor({ tabId, color: FAILURE_BADGE_COLOR }),
        api.action.setTitle({ tabId, title: `Cert Tool: ${describeScanError(e, 'inspect the selection')}` }),
    ]);
}

async function clearFailure(api: BackgroundApi, tabId: number): Promise<void> {
    await Promise.all([api.action.setBadgeText({ tabId, text: '' }), api.action.setTitle({ tabId, title: DEFAULT_TITLE })]);
}

/** Runs the command in the clicked frame, then in the top frame when that frame is out of reach (another origin, which activeTab does not cover). */
async function inspectSelection(api: BackgroundApi, tabId: number, info: chrome.contextMenus.OnClickData): Promise<void> {
    const frameId = info.frameId ?? 0;
    try {
        await runInTab(api, tabId, frameId, selectionCommand(info, false));
    } catch (e: unknown) {
        if (frameId === 0) throw e;
        // The top frame's own selection is unrelated to the click, so the menu's copy of the text comes first there.
        await runInTab(api, tabId, 0, selectionCommand(info, true));
    }
}

/** Shows the selected certificate on the page. The click grants activeTab, so the content script can be injected. */
export async function onMenuClick(api: BackgroundApi, info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined): Promise<void> {
    if (info.menuItemId !== MENU_INSPECT_SELECTION || tab?.id === undefined) return;
    const tabId = tab.id;
    try {
        await inspectSelection(api, tabId, info);
        await clearFailure(api, tabId);
    } catch (e: unknown) {
        await showFailure(api, tabId, e).catch((e2: unknown) => console.error('Cert Tool: could not flag the failure', e2));
    }
}

/** Parses page texts for the content script. Synchronous, so it answers before returning. */
export function createInspectListener(extensionId: string, now: () => number = Date.now) {
    return (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (scans: PageScan[]) => void): boolean => {
        if (sender.id !== extensionId || !isInspectTextsRequest(msg)) return false;
        sendResponse(inspectTexts(msg.texts, now()));
        return false;
    };
}

export function registerBackground(api: BackgroundApi): void {
    api.runtime.onInstalled.addListener(() => {
        createMenus(api).catch((e: unknown) => console.error('Cert Tool: could not create the context menu', e));
    });
    api.contextMenus.onClicked.addListener((info, tab) => { void onMenuClick(api, info, tab); });
    api.runtime.onMessage.addListener(createInspectListener(api.runtime.id));
}
