import { MSG_INSPECT_TEXTS, type PageScan } from '../page/messages';
import type { ParseTexts } from './controller';

/** Chrome's error when the service worker is not listening yet, e.g. right after it was stopped for being idle. */
const NOT_LISTENING = /could not establish connection/i;

const isNotListening = (e: unknown) => e instanceof Error && NOT_LISTENING.test(e.message);

/** Parses page texts in the background service worker, which holds the parsing libraries. */
export function createBackgroundParser(runtime: Pick<typeof chrome.runtime, 'sendMessage'>): ParseTexts {
    return async texts => {
        const request = { type: MSG_INSPECT_TEXTS, texts };
        const reply: unknown = await runtime.sendMessage(request).catch((e: unknown) => {
            if (!isNotListening(e)) throw e;
            return runtime.sendMessage(request);
        });
        if (!Array.isArray(reply) || reply.length !== texts.length) throw new Error('Cert Tool could not parse the certificates on this page.');
        return reply as PageScan[];
    };
}
