export type ExposedAPI = Record<string, (...args: any[]) => any>;

export type RemoteProxy<T extends ExposedAPI> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => Promise<Awaited<ReturnType<T[K]>>>;
};

export interface RpcRequest {
  type: 'rpc-request';
  id: string;
  method: string;
  args: unknown[];
}

export interface RpcResponse {
  type: 'rpc-response';
  id: string;
  result?: unknown;
  error?: { message: string; name?: string; stack?: string };
}

export interface ExposeOptions {
  onDisconnect?: () => void;
}

export interface RemoteOptions {
  timeout?: number;
}
