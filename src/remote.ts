import type { ExposedAPI, RemoteProxy, RpcRequest, RpcResponse, RemoteOptions } from './types';

const DEFAULT_TIMEOUT = 30_000;

export function remote<T extends ExposedAPI>(
  port: MessagePort,
  options?: RemoteOptions,
): RemoteProxy<T> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const pending = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  port.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'rpc-response') return;

    const res = data as RpcResponse;
    const entry = pending.get(res.id);
    if (!entry) return;

    pending.delete(res.id);
    clearTimeout(entry.timer);

    if (res.error) {
      const err = new Error(res.error.message);
      err.name = res.error.name ?? 'Error';
      entry.reject(err);
    } else {
      entry.resolve(res.result);
    }
  });
  port.start();

  return new Proxy({} as RemoteProxy<T>, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then') return undefined;

      return (...args: unknown[]) => {
        return new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`RPC call "${String(prop)}" timed out after ${timeout}ms`));
          }, timeout);

          pending.set(id, { resolve, reject, timer });

          const request: RpcRequest = {
            type: 'rpc-request',
            id,
            method: String(prop),
            args,
          };
          port.postMessage(request);
        });
      };
    },
  });
}
