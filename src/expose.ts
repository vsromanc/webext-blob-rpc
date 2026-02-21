import type { ExposedAPI, RpcRequest, RpcResponse, ExposeOptions } from './types';

export function expose<T extends ExposedAPI>(
  handlers: T,
  port: MessagePort,
  options?: ExposeOptions,
): () => void {
  const onMessage = async (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'rpc-request') return;

    const req = data as RpcRequest;
    const handler = handlers[req.method];
    const response: RpcResponse = { type: 'rpc-response', id: req.id };

    if (typeof handler !== 'function') {
      response.error = {
        message: `Method "${req.method}" not found`,
        name: 'MethodNotFoundError',
      };
    } else {
      try {
        response.result = await handler(...req.args);
      } catch (err: unknown) {
        const e = err as Error;
        response.error = {
          message: e?.message ?? String(err),
          name: e?.name,
          stack: e?.stack,
        };
      }
    }

    port.postMessage(response);
  };

  port.addEventListener('message', onMessage);
  port.start();

  return () => {
    port.removeEventListener('message', onMessage);
    port.close();
    options?.onDisconnect?.();
  };
}
