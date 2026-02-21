import { expose as lowLevelExpose } from './expose';
import type { ExposedAPI } from './types';

const MESSAGE_TYPE = 'webext-blob-rpc:offscreen-port';

let portPromise: Promise<MessagePort> | null = null;

// Handlers to expose on incoming bridge ports
let bridgeHandlers: ExposedAPI | null = null;

export function setBridgeHandlers(handlers: ExposedAPI): void {
  bridgeHandlers = handlers;
}

export function getBridgeHandlers(): ExposedAPI | null {
  return bridgeHandlers;
}

export function getOffscreenPort(): Promise<MessagePort> {
  if (!portPromise) {
    portPromise = new Promise<MessagePort>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type !== MESSAGE_TYPE || !event.ports.length) return;

        self.removeEventListener('message', handler);

        const port = event.ports[0];
        port.postMessage({ type: 'webext-blob-rpc:offscreen-ack' });
        port.start();

        // Listen for bridge ports on the main SW↔offscreen port
        port.addEventListener('message', (e: MessageEvent) => {
          if (e.data?.type === 'webext-blob-rpc:bridge-port' && e.ports.length) {
            const bridgePort = e.ports[0];
            bridgePort.start();
            if (bridgeHandlers) {
              lowLevelExpose(bridgeHandlers, bridgePort);
            }
          }
        });

        resolve(port);
      };

      self.addEventListener('message', handler);
    });
  }
  return portPromise;
}

export function resetOffscreenPort(): void {
  if (portPromise) {
    portPromise.then((port) => port.close()).catch(() => {});
    portPromise = null;
  }
  bridgeHandlers = null;
}
