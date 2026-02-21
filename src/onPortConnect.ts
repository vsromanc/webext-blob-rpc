export function onPortConnect(
  callback: (port: MessagePort) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data === 'port' && event.ports.length > 0) {
      const port = event.ports[0];
      port.postMessage({ type: 'webext-blob-rpc:ack' });
      port.start();
      callback(port);
    }
  };

  self.addEventListener('message', handler as EventListener);

  return () => {
    self.removeEventListener('message', handler as EventListener);
  };
}
