export type Context = 'service-worker' | 'content-script' | 'offscreen';

export function detectContext(): Context {
  if (
    typeof ServiceWorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof ServiceWorkerGlobalScope
  ) {
    return 'service-worker';
  }

  // Extension pages (offscreen docs, popups, sidepanels, options pages)
  // have document + chrome-extension:// protocol but are not service workers
  if (
    typeof document !== 'undefined' &&
    typeof location !== 'undefined' &&
    location.protocol === 'chrome-extension:'
  ) {
    return 'offscreen';
  }

  return 'content-script';
}
