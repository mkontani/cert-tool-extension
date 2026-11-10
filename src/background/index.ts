/** Background service worker entry: the selection context menu, certificate parsing for the content script, and reading the current site's certificate for the popup. */
import { registerBackground } from './handlers';

registerBackground(chrome);
