/**
 * Content script entry. Injected on demand (activeTab) by the popup's "Scan this page" button
 * and the "Inspect certificate" context menu item; it never runs on a page by itself.
 * Kept free of the parsing libraries: certificates are parsed by the background service worker.
 */
import { installContentScript } from './install';

installContentScript(globalThis as unknown as Record<symbol, unknown>, chrome.runtime, document);
