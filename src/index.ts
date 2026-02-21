import { expose as lowLevelExpose } from './expose';
import { remote as lowLevelRemote } from './remote';
import { detectContext } from './context';
import {
  getContentScriptPort,
  resetContentScriptPort,
  initServiceWorker,
  getServiceWorkerPort,
} from './autoPort';
import type { ExposedAPI, RemoteProxy, RemoteOptions } from './types';

// ── expose() ──

export function expose<T extends ExposedAPI>(
  handlers: T,
): () => void {
  const context = detectContext();

  if (context === 'service-worker') {
    return initServiceWorker(handlers);
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

  // Auto content script → background (lazy port creation on first call)
  const options = tabIdOrOptions as RemoteOptions | undefined;

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

// ── Re-exports ──

export { detectContext } from './context';
export type { ExposedAPI, RemoteProxy } from './types';
