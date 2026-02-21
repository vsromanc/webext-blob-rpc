import { createServiceWorkerPort } from './createServiceWorkerPort';
import { onPortConnect } from './onPortConnect';
import { expose as lowLevelExpose } from './expose';
import type { ExposedAPI } from './types';

// ── Content script side ──

let contentPortPromise: Promise<MessagePort> | null = null;

export function getContentScriptPort(bridgePath?: string): Promise<MessagePort> {
  if (!contentPortPromise) {
    contentPortPromise = createServiceWorkerPort(bridgePath).then((port) => {
      // Nonce-based correlation: no round-trip, no callback
      const nonce = crypto.randomUUID();

      // Fire-and-forget: tell the service worker our nonce (it will pair nonce → sender.tab.id)
      chrome.runtime.sendMessage({ type: 'webext-blob-rpc:init', nonce });

      // Send the same nonce over the port so the SW can correlate port ↔ tabId
      port.postMessage({ type: 'webext-blob-rpc:init', nonce });

      return port;
    });
  }
  return contentPortPromise;
}

export function resetContentScriptPort(): void {
  if (contentPortPromise) {
    contentPortPromise.then((port) => port.close()).catch(() => {});
    contentPortPromise = null;
  }
}

// ── Service worker side ──

const portsByTabId = new Map<number, MessagePort>();
const pendingNonces = new Map<string, number>();

let swInitialized = false;
let swDisposeOnPortConnect: (() => void) | null = null;
let swOnMessageHandler: ((
  message: any,
  sender: { tab?: { id: number } },
  sendResponse: (response?: any) => void,
) => boolean | void) | null = null;

export function initServiceWorker(handlers: ExposedAPI): () => void {
  if (!swInitialized) {
    swInitialized = true;

    // Listen for nonce init messages from content scripts
    swOnMessageHandler = (message, sender) => {
      if (
        message?.type === 'webext-blob-rpc:init' &&
        typeof message.nonce === 'string' &&
        sender.tab?.id != null
      ) {
        pendingNonces.set(message.nonce, sender.tab.id);
      }
    };
    chrome.runtime.onMessage.addListener(swOnMessageHandler);

    // Accept incoming ports from content scripts
    swDisposeOnPortConnect = onPortConnect((port) => {
      // Expose handlers immediately — don't wait for tabId correlation
      lowLevelExpose(handlers, port);

      // Correlate tabId asynchronously (needed for remote(tabId) lookups)
      const onInit = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'webext-blob-rpc:init' && typeof data.nonce === 'string') {
          port.removeEventListener('message', onInit);

          const tabId = pendingNonces.get(data.nonce);
          pendingNonces.delete(data.nonce);

          if (tabId != null) {
            portsByTabId.set(tabId, port);
          }
        }
      };
      port.addEventListener('message', onInit);
      // port.start() already called by onPortConnect
    });
  }

  return () => {
    if (swDisposeOnPortConnect) {
      swDisposeOnPortConnect();
      swDisposeOnPortConnect = null;
    }
    if (swOnMessageHandler) {
      chrome.runtime.onMessage.removeListener(swOnMessageHandler);
      swOnMessageHandler = null;
    }
    portsByTabId.forEach((port) => port.close());
    portsByTabId.clear();
    pendingNonces.clear();
    swInitialized = false;
  };
}

export function getServiceWorkerPort(tabId: number): MessagePort {
  const port = portsByTabId.get(tabId);
  if (!port) {
    throw new Error(`No port connected for tabId ${tabId}`);
  }
  return port;
}

// Exported for testing
export function _resetState(): void {
  contentPortPromise = null;
  portsByTabId.clear();
  pendingNonces.clear();
  swInitialized = false;
  swDisposeOnPortConnect = null;
  swOnMessageHandler = null;
}
