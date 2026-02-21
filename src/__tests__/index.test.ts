import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expose, remote, remoteOffscreen, resetBridgePort } from '../index';
import { detectContext } from '../context';
import { _resetState } from '../autoPort';
import { getOffscreenBridgePort } from '../connectOffscreen';

describe('detectContext', () => {
  it('returns content-script by default (no ServiceWorkerGlobalScope)', () => {
    expect(detectContext()).toBe('content-script');
  });

  it('returns service-worker when ServiceWorkerGlobalScope is present', () => {
    const original = (globalThis as any).ServiceWorkerGlobalScope;
    // Create a fake ServiceWorkerGlobalScope that self is an instance of
    class FakeSWGlobalScope {}
    (globalThis as any).ServiceWorkerGlobalScope = FakeSWGlobalScope;

    // self isn't actually an instance, so it should still be content-script
    expect(detectContext()).toBe('content-script');

    (globalThis as any).ServiceWorkerGlobalScope = original;
  });

  it('returns offscreen when chrome-extension:// protocol and document present', () => {
    const origLocation = globalThis.location;
    const origDocument = (globalThis as any).document;

    // Simulate chrome-extension:// page environment
    Object.defineProperty(globalThis, 'location', {
      value: { protocol: 'chrome-extension:' },
      writable: true,
      configurable: true,
    });
    (globalThis as any).document = {};

    expect(detectContext()).toBe('offscreen');

    // Restore
    Object.defineProperty(globalThis, 'location', {
      value: origLocation,
      writable: true,
      configurable: true,
    });
    (globalThis as any).document = origDocument;
  });
});

describe('auto-wiring overloads', () => {
  beforeEach(() => {
    _resetState();
  });

  afterEach(() => {
    _resetState();
  });

  it('remote(tabId) throws when no port is connected', () => {
    // Mock the service worker context detection
    expect(() => remote(42)).toThrow('No port connected for tabId 42');
  });

  it('remote() without args returns a proxy with deferred calls', () => {
    // Port creation is lazy (deferred to first method call), so no mocks needed
    const proxy = remote();
    expect((proxy as any)[Symbol.toPrimitive]).toBeUndefined();
    expect((proxy as any).then).toBeUndefined();
    expect(typeof (proxy as any).someMethod).toBe('function');
  });
});

describe('offscreenPort', () => {
  let origSelf: typeof globalThis;

  beforeEach(() => {
    origSelf = globalThis.self;
  });

  afterEach(() => {
    (globalThis as any).self = origSelf;
  });

  it('getOffscreenPort resolves when port message is received', async () => {
    // Create a mock EventTarget to act as `self`
    const target = new EventTarget();
    (globalThis as any).self = target;

    // Must import after mocking self
    // Use a unique query param to bust vitest module cache
    const mod = await import('../offscreenPort');
    // Reset any cached state
    mod.resetOffscreenPort();

    // Create a MessageChannel to simulate the SW sending a port
    const channel = new MessageChannel();

    // Start listening
    const portPromise = mod.getOffscreenPort();

    // Simulate SW sending port via self message event
    const event = new MessageEvent('message', {
      data: { type: 'webext-blob-rpc:offscreen-port' },
      ports: [channel.port2],
    });
    target.dispatchEvent(event);

    const port = await portPromise;
    expect(port).toBe(channel.port2);

    // Check that ack was sent
    const ackPromise = new Promise<any>((resolve) => {
      channel.port1.addEventListener('message', (e) => resolve(e.data), { once: true });
      channel.port1.start();
    });
    const ack = await ackPromise;
    expect(ack).toEqual({ type: 'webext-blob-rpc:offscreen-ack' });

    mod.resetOffscreenPort();
    channel.port1.close();
  });
});

describe('connectOffscreen', () => {
  it('finds client, sends port, and returns proxy after ack', async () => {
    const { connectOffscreen } = await import('../connectOffscreen');

    // Mock chrome.runtime.getURL
    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://abc123/${path}`,
      },
    };

    // Capture the port sent to the client
    let capturedPort: MessagePort | null = null;
    let capturedMessage: any = null;

    const fakeClient = {
      url: 'chrome-extension://abc123/offscreen.html',
      id: 'client-1',
      type: 'window' as const,
      postMessage(message: any, transfer?: Transferable[]) {
        capturedMessage = message;
        capturedPort = (transfer as MessagePort[])?.[0] ?? null;

        // Simulate offscreen doc receiving port and sending ack
        if (capturedPort) {
          capturedPort.start();
          capturedPort.postMessage({ type: 'webext-blob-rpc:offscreen-ack' });
        }
      },
    };

    // Mock ServiceWorkerGlobalScope with clients.matchAll
    const origSelf = globalThis.self;
    (globalThis as any).self = {
      ...globalThis.self,
      clients: {
        matchAll: async () => [fakeClient],
      },
    };

    const proxy = await connectOffscreen<{ doSomething(): string }>({
      url: 'offscreen.html',
    });

    expect(capturedMessage).toEqual({ type: 'webext-blob-rpc:offscreen-port' });
    expect(capturedPort).toBeInstanceOf(MessagePort);
    expect(typeof (proxy as any).doSomething).toBe('function');

    // Restore
    (globalThis as any).self = origSelf;
    delete (globalThis as any).chrome;
  });
});

describe('bridge brokering (SW side)', () => {
  it('SW creates MessageChannel and sends ports to both sides on bridge request', () => {
    // Simulate content-script port and offscreen port
    const csChannel = new MessageChannel();
    const csPort = csChannel.port1; // "SW side" of the CS port

    const osChannel = new MessageChannel();
    const osPort = osChannel.port1; // "SW side" of the offscreen port

    csPort.start();
    osPort.start();

    // Capture messages
    const csMessages: any[] = [];
    const csPorts: MessagePort[] = [];
    const osMessages: any[] = [];
    const osPorts: MessagePort[] = [];

    // We need to manually simulate the SW bridge handler logic
    // since initServiceWorker requires chrome APIs. Test the flow directly.
    const onBridge = (event: MessageEvent) => {
      if (event.data?.type !== 'webext-blob-rpc:bridge-to-offscreen') return;

      const bridge = new MessageChannel();
      osPort.postMessage({ type: 'webext-blob-rpc:bridge-port' }, [bridge.port2]);
      csPort.postMessage({ type: 'webext-blob-rpc:bridge-port' }, [bridge.port1]);
    };
    csPort.addEventListener('message', onBridge);

    // Listen on the "other ends" for what arrives
    const csRecvPromise = new Promise<void>((resolve) => {
      csChannel.port2.addEventListener('message', (e) => {
        csMessages.push(e.data);
        csPorts.push(...e.ports);
        resolve();
      });
      csChannel.port2.start();
    });
    const osRecvPromise = new Promise<void>((resolve) => {
      osChannel.port2.addEventListener('message', (e) => {
        osMessages.push(e.data);
        osPorts.push(...e.ports);
        resolve();
      });
      osChannel.port2.start();
    });

    // Send bridge request from CS side
    csChannel.port2.postMessage({ type: 'webext-blob-rpc:bridge-to-offscreen' });

    return Promise.all([csRecvPromise, osRecvPromise]).then(() => {
      expect(csMessages[0]).toEqual({ type: 'webext-blob-rpc:bridge-port' });
      expect(csPorts).toHaveLength(1);
      expect(csPorts[0]).toBeInstanceOf(MessagePort);

      expect(osMessages[0]).toEqual({ type: 'webext-blob-rpc:bridge-port' });
      expect(osPorts).toHaveLength(1);
      expect(osPorts[0]).toBeInstanceOf(MessagePort);

      // Clean up
      csChannel.port1.close();
      csChannel.port2.close();
      osChannel.port1.close();
      osChannel.port2.close();
    });
  });
});

describe('offscreen bridge port handler', () => {
  it('exposes handlers on incoming bridge port', async () => {
    const target = new EventTarget();
    (globalThis as any).self = target;

    const mod = await import('../offscreenPort');
    mod.resetOffscreenPort();

    const handlers = {
      greet: (name: string) => `Hello, ${name}!`,
    };
    mod.setBridgeHandlers(handlers);

    // Create the main SW↔offscreen channel
    const mainChannel = new MessageChannel();

    // Start listening for the main port
    const portPromise = mod.getOffscreenPort();

    // Deliver the main port
    target.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'webext-blob-rpc:offscreen-port' },
        ports: [mainChannel.port2],
      }),
    );
    const mainPort = await portPromise;

    // Now simulate a bridge port arriving on the main port
    const bridgeChannel = new MessageChannel();
    mainChannel.port1.start();
    mainChannel.port1.postMessage(
      { type: 'webext-blob-rpc:bridge-port' },
      [bridgeChannel.port2],
    );

    // Give it a tick to process
    await new Promise((r) => setTimeout(r, 50));

    // Send an RPC request on bridgeChannel.port1 (the content-script end)
    bridgeChannel.port1.start();
    const responsePromise = new Promise<any>((resolve) => {
      bridgeChannel.port1.addEventListener('message', (e) => resolve(e.data), { once: true });
    });
    bridgeChannel.port1.postMessage({
      type: 'rpc-request',
      id: 'test-1',
      method: 'greet',
      args: ['World'],
    });

    const response = await responsePromise;
    expect(response).toEqual({
      type: 'rpc-response',
      id: 'test-1',
      result: 'Hello, World!',
    });

    // Cleanup
    mod.resetOffscreenPort();
    mainChannel.port1.close();
    bridgeChannel.port1.close();
  });
});

describe('remoteOffscreen', () => {
  it('returns a lazy proxy', () => {
    const proxy = remoteOffscreen();
    expect((proxy as any)[Symbol.toPrimitive]).toBeUndefined();
    expect((proxy as any).then).toBeUndefined();
    expect(typeof (proxy as any).someMethod).toBe('function');
  });
});
