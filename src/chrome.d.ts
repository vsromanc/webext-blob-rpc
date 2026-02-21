// ServiceWorkerGlobalScope may not exist in all environments
declare var ServiceWorkerGlobalScope: { new (): any; prototype: any } | undefined;

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
