import { expose as lowLevelExpose } from './expose';
import { remote as lowLevelRemote } from './remote';
import type { ExposedAPI, RemoteProxy } from './types';

const MESSAGE_TYPE = 'webext-blob-rpc:offscreen-port';
const DEFAULT_TIMEOUT = 10_000;

export interface ConnectOffscreenOptions<H extends ExposedAPI = ExposedAPI> {
  /** Path to offscreen HTML file (e.g. 'offscreen.html'). Used to find the client. */
  url: string;
  /** Optional SW methods to expose on the same port for bidirectional RPC. */
  handlers?: H;
  /** Timeout in ms waiting for ack from offscreen document. Default: 10000 */
  timeout?: number;
}

const connectionCache = new Map<string, Promise<RemoteProxy<any>>>();

// Stores the SW↔offscreen port so the SW can broker bridge channels
let offscreenBridgePort: MessagePort | null = null;

/** Returns the SW-side port to the offscreen document, or null if not yet connected. */
export function getOffscreenBridgePort(): MessagePort | null {
  return offscreenBridgePort;
}

export function connectOffscreen<T extends ExposedAPI>(
  options: ConnectOffscreenOptions,
): Promise<RemoteProxy<T>> {
  const fullUrl = chrome.runtime.getURL(options.url);

  const cached = connectionCache.get(fullUrl);
  if (cached) return cached;

  const promise = doConnect<T>(fullUrl, options);
  connectionCache.set(fullUrl, promise);

  // Remove from cache on failure so user can retry
  promise.catch(() => connectionCache.delete(fullUrl));

  return promise;
}

async function doConnect<T extends ExposedAPI>(
  fullUrl: string,
  options: ConnectOffscreenOptions,
): Promise<RemoteProxy<T>> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  // Find the client matching the offscreen document URL
  const allClients: Client[] = await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({ type: 'all' });
  const client = allClients.find((c) => c.url === fullUrl);

  if (!client) {
    throw new Error(
      `connectOffscreen: no client found for "${fullUrl}". ` +
      `Make sure the offscreen document is created before calling connectOffscreen().`,
    );
  }

  const channel = new MessageChannel();

  // Wait for ack from offscreen document
  const ackPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`connectOffscreen: timed out waiting for ack from "${fullUrl}"`));
    }, timeout);

    channel.port1.addEventListener(
      'message',
      (event) => {
        if (event.data?.type === 'webext-blob-rpc:offscreen-ack') {
          clearTimeout(timer);
          resolve();
        }
      },
      { once: true },
    );
    channel.port1.start();
  });

  // Send port2 to the offscreen document
  client.postMessage({ type: MESSAGE_TYPE }, [channel.port2]);

  await ackPromise;

  // Store port for bridge brokering
  offscreenBridgePort = channel.port1;

  // Set up bidirectional RPC if handlers provided
  if (options.handlers) {
    lowLevelExpose(options.handlers, channel.port1);
  }

  return lowLevelRemote<T>(channel.port1);
}
