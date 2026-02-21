// ServiceWorkerGlobalScope may not exist in all environments
declare var ServiceWorkerGlobalScope: { new (): any; prototype: any } | undefined;

// Clients API for ServiceWorkerGlobalScope (used by connectOffscreen)
interface Client {
  readonly url: string;
  readonly id: string;
  readonly type: 'window' | 'worker' | 'sharedworker' | 'all';
  postMessage(message: any, transfer?: Transferable[]): void;
}

interface Clients {
  matchAll(options?: { type?: 'window' | 'worker' | 'sharedworker' | 'all' }): Promise<Client[]>;
  get(id: string): Promise<Client | undefined>;
}

interface ServiceWorkerGlobalScope {
  readonly clients: Clients;
}

declare namespace chrome {
  namespace runtime {
    function getURL(path: string): string;

    function sendMessage<T = any>(
      message: any,
      callback?: (response: T) => void,
    ): void;

    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: { tab?: { id: number } },
          sendResponse: (response?: any) => void,
        ) => boolean | void,
      ): void;
      removeListener(
        callback: (
          message: any,
          sender: { tab?: { id: number } },
          sendResponse: (response?: any) => void,
        ) => boolean | void,
      ): void;
    };
  }
}
