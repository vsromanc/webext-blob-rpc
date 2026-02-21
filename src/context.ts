export type Context = 'service-worker' | 'content-script';

export function detectContext(): Context {
  if (
    typeof ServiceWorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof ServiceWorkerGlobalScope
  ) {
    return 'service-worker';
  }
  return 'content-script';
}
