import { createController, createMessageListener } from './controller';
import { createBackgroundParser } from './parse';

export type ContentRuntime = Pick<typeof chrome.runtime, 'id' | 'onMessage' | 'sendMessage'>;

/** What a running copy of the content script leaves in its isolated world, for the next injection to find. */
interface Installed {
    readonly isAlive: () => boolean;
    readonly dispose: () => void;
}

const INSTALLED = Symbol.for('cert-tool.content-script');

/** An updated or reloaded extension leaves earlier copies orphaned: their chrome.runtime loses its id, or throws. */
function runtimeAlive(runtime: ContentRuntime): boolean {
    try {
        return Boolean(runtime.id);
    } catch {
        return false;
    }
}

/**
 * Sets up the content script once per page. Each injection runs the script again in the same isolated world:
 * a live copy is kept (with its badges), while a copy orphaned by an extension update is torn down and replaced,
 * since it can no longer reach the extension.
 * Returns whether a new copy was installed.
 */
export function installContentScript(scope: Record<symbol, unknown>, runtime: ContentRuntime, doc: Document): boolean {
    const previous = scope[INSTALLED] as Installed | undefined;
    if (previous?.isAlive()) return false;
    previous?.dispose();

    const controller = createController({ doc, parse: createBackgroundParser(runtime) });
    const listener = createMessageListener(runtime.id, command => controller.handle(command));
    runtime.onMessage.addListener(listener);
    const installed: Installed = {
        isAlive: () => runtimeAlive(runtime),
        dispose: () => {
            controller.dispose();
            try {
                runtime.onMessage.removeListener(listener);
            } catch {
                // An orphaned runtime throws here; its listener can never fire again anyway.
            }
        },
    };
    scope[INSTALLED] = installed;
    return true;
}
