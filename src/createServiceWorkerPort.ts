const DEFAULT_BRIDGE_PATH = '/bridge.html';
const CONNECTION_TIMEOUT = 10_000;

export function createServiceWorkerPort(
  bridgePath = DEFAULT_BRIDGE_PATH,
): Promise<MessagePort> {
  return new Promise((resolve, reject) => {
    const secret = crypto.randomUUID();
    const url = new URL(chrome.runtime.getURL(bridgePath));
    url.searchParams.set('secret', secret);

    const container = document.createElement('div');
    container.style.display = 'none';
    const shadow = container.attachShadow({ mode: 'closed' });
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    shadow.appendChild(iframe);
    (document.body || document.documentElement).appendChild(container);

    const channel = new MessageChannel();

    iframe.addEventListener('load', () => {
      iframe.contentWindow!.postMessage(
        { type: 'webext-blob-rpc:port', secret },
        '*',
        [channel.port2],
      );
    });

    iframe.addEventListener('error', () => {
      container.remove();
      reject(new Error('createServiceWorkerPort: failed to load bridge iframe'));
    });

    channel.port1.addEventListener(
      'message',
      (event) => {
        if (event.data?.type === 'webext-blob-rpc:ack') {
          resolve(channel.port1);
        }
      },
      { once: true },
    );
    channel.port1.start();

    iframe.src = url.toString();

    setTimeout(() => {
      container.remove();
      reject(new Error('createServiceWorkerPort: timed out waiting for service worker acknowledgment'));
    }, CONNECTION_TIMEOUT);
  });
}
