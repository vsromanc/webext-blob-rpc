import { expose as lowLevelExpose } from './expose';
import { remote as lowLevelRemote } from './remote';
import { detectContext } from './context';
import {
  getContentScriptPort,
  resetContentScriptPort,
  initServiceWorker,
  getServiceWorkerPort,
} from './autoPort';
import {
  getOffscreenPort,
  resetOffscreenPort,
  setBridgeHandlers,
} from './offscreenPort';
import type { ExposedAPI, RemoteProxy, RemoteOptions } from './types';

// ── expose() ──

export function expose<T extends ExposedAPI>(
  handlers: T,
): () => void {
  const context = detectContext();

  if (context === 'service-worker') {
    return initServiceWorker(handlers);
  }

  if (context === 'offscreen') {
    // Store handlers so bridge ports get the same API
    setBridgeHandlers(handlers);

    // Offscreen / extension page: wait for port from SW
    let disposed = false;
    let disposeExpose: (() => void) | null = null;

    getOffscreenPort().then((p) => {
      if (!disposed) {
        disposeExpose = lowLevelExpose(handlers, p);
      }
    });

    return () => {
      disposed = true;
      if (disposeExpose) {
        disposeExpose();
        disposeExpose = null;
      }
      resetOffscreenPort();
    };
  }

  // Content script: kick off port creation, expose when ready
  let disposed = false;
  let disposeExpose: (() => void) | null = null;

  getContentScriptPort().then((p) => {
    if (!disposed) {
      disposeExpose = lowLevelExpose(handlers, p);
    }
  });

  return () => {
    disposed = true;
    if (disposeExpose) {
      disposeExpose();
      disposeExpose = null;
    }
    resetContentScriptPort();
  };
}

// ── remote() ──

export function remote<T extends ExposedAPI>(
  tabId: number,
  options?: RemoteOptions,
): RemoteProxy<T>;
export function remote<T extends ExposedAPI>(
  options?: RemoteOptions,
): RemoteProxy<T>;
export function remote<T extends ExposedAPI>(
  tabIdOrOptions?: number | RemoteOptions,
  maybeOptions?: RemoteOptions,
): RemoteProxy<T> {
  // Service worker → content script by tabId
  if (typeof tabIdOrOptions === 'number') {
    const port = getServiceWorkerPort(tabIdOrOptions);
    return lowLevelRemote<T>(port, maybeOptions);
  }

  const context = detectContext();
  const options = tabIdOrOptions as RemoteOptions | undefined;

  // Offscreen / extension page → SW (lazy port on first call)
  if (context === 'offscreen') {
    return new Proxy({} as RemoteProxy<T>, {
      get(_target, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (prop === 'then') return undefined;

        return (...args: unknown[]) => {
          return getOffscreenPort().then((port) => {
            const proxy = lowLevelRemote<T>(port, options);
            return (proxy as any)[prop](...args);
          });
        };
      },
    });
  }

  // Content script → background (lazy port creation on first call)
  return new Proxy({} as RemoteProxy<T>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then') return undefined;

      return (...args: unknown[]) => {
        return getContentScriptPort().then((port) => {
          const proxy = lowLevelRemote<T>(port, options);
          return (proxy as any)[prop](...args);
        });
      };
    },
  });
}

// ── remoteOffscreen() ──

let bridgePortPromise: Promise<MessagePort> | null = null;

function getBridgePort(): Promise<MessagePort> {
  if (!bridgePortPromise) {
    bridgePortPromise = getContentScriptPort().then((csPort) => {
      return new Promise<MessagePort>((resolve, reject) => {
        const onResponse = (event: MessageEvent) => {
          if (event.data?.type === 'webext-blob-rpc:bridge-port' && event.ports.length) {
            csPort.removeEventListener('message', onResponse);
            const port = event.ports[0];
            port.start();
            resolve(port);
          } else if (event.data?.type === 'webext-blob-rpc:bridge-error') {
            csPort.removeEventListener('message', onResponse);
            reject(new Error(`remoteOffscreen: bridge failed – ${event.data.reason ?? 'unknown'}`));
          }
        };
        csPort.addEventListener('message', onResponse);
        csPort.postMessage({ type: 'webext-blob-rpc:bridge-to-offscreen' });
      });
    });
  }
  return bridgePortPromise;
}

export function resetBridgePort(): void {
  if (bridgePortPromise) {
    bridgePortPromise.then((port) => port.close()).catch(() => {});
    bridgePortPromise = null;
  }
}

/** Create a direct RPC proxy from a content script to an offscreen document. */
export function remoteOffscreen<T extends ExposedAPI>(
  options?: RemoteOptions,
): RemoteProxy<T> {
  return new Proxy({} as RemoteProxy<T>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then') return undefined;

      return (...args: unknown[]) => {
        return getBridgePort().then((port) => {
          const proxy = lowLevelRemote<T>(port, options);
          return (proxy as any)[prop](...args);
        });
      };
    },
  });
}

// ── Re-exports ──

export { detectContext } from './context';
export { connectOffscreen } from './connectOffscreen';
export type { ConnectOffscreenOptions } from './connectOffscreen';
export type { ExposedAPI, RemoteProxy } from './types';
