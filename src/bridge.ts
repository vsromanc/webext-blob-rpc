const secret = new URLSearchParams(location.search).get('secret');

window.addEventListener('message', async (event: MessageEvent) => {
  const data = event.data;
  if (data?.type !== 'webext-blob-rpc:port' || data.secret !== secret) return;
  if (!event.ports.length) return;

  const port = event.ports[0];
  const registration = await navigator.serviceWorker.ready;

  if (registration.active) {
    registration.active.postMessage('port', [port]);
  }
}, { once: true });
