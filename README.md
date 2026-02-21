# webext-blob-rpc

[![npm version](https://img.shields.io/npm/v/webext-blob-rpc)](https://www.npmjs.com/package/webext-blob-rpc)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/webext-blob-rpc)](https://bundlephobia.com/package/webext-blob-rpc)
[![license](https://img.shields.io/npm/l/webext-blob-rpc)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/vsromanc/webext-blob-rpc/actions/workflows/ci.yml/badge.svg)](https://github.com/vsromanc/webext-blob-rpc/actions/workflows/ci.yml)

Type-safe RPC for browser extensions with native Blob support. Uses `MessagePort` via a hidden iframe bridge for communication between content scripts and the extension service worker — Blobs, ArrayBuffers, and other structured-cloneable types transfer without serialization.

## Why not `chrome.runtime.sendMessage`?

| | `chrome.runtime.sendMessage` | `webext-blob-rpc` |
|---|---|---|
| Blob / File transfer | JSON only — must base64-encode | Native structured clone |
| ArrayBuffer | Must serialize | Native transfer |
| Type safety | Manual typing | Full `RemoteProxy<T>` inference |
| Bidirectional | Requires separate listeners | `expose` + `remote` on both sides |
| Setup | Manual message routing | Two functions, auto-wired |

## Setup

```bash
pnpm add webext-blob-rpc
```

Copy the pre-built bridge files from `node_modules/webext-blob-rpc/static/` into your extension (e.g. at the root):

```
cp node_modules/webext-blob-rpc/static/bridge.html your-extension/
cp node_modules/webext-blob-rpc/static/bridge.js your-extension/
```

Declare them in your `manifest.json`:

```json
{
  "web_accessible_resources": [{
    "resources": ["bridge.html", "bridge.js"],
    "matches": ["<all_urls>"]
  }]
}
```

## Usage

Define your API types once in a shared file, then import them on both sides:

```ts
// rpc.types.ts
export type BgAPI = {
  fetchData: (url: string) => any;
};

export type ContentAPI = {
  getPageTitle: () => string;
  getSelection: () => string | undefined;
};
```

### Content script

```ts
import { expose, remote } from 'webext-blob-rpc';
import type { BgAPI, ContentAPI } from './rpc.types';

expose<ContentAPI>({
  getPageTitle: () => document.title,
  getSelection: () => window.getSelection()?.toString(),
});

const bg = remote<BgAPI>();
const data = await bg.fetchData('/api/user');
```

### Service worker (background)

```ts
import { expose, remote } from 'webext-blob-rpc';
import type { BgAPI, ContentAPI } from './rpc.types';

expose<BgAPI>({
  fetchData: (url: string) => fetch(url).then(r => r.json()),
});

const page = remote<ContentAPI>(tabId);
const title = await page.getPageTitle();
```

### Error propagation

Errors thrown in handlers propagate to the caller:

```ts
// background
try {
  await page.riskyOp();
} catch (e) {
  // Error: failed
}
```

### Blob transfer

Blobs transfer natively over `MessagePort` — no base64 encoding or manual chunking:

```ts
// background
const blob = await page.captureCanvas(); // Blob instance
```

### Cleanup

`expose()` returns a dispose function:

```ts
const dispose = expose(handlers);

// Later:
dispose();
```

## API

### `expose(handlers): () => void`

Detects the current context (content script or service worker) and sets up transport automatically. Returns a dispose function.

- **Content script:** creates a bridge port in the background, then registers handlers on it.
- **Service worker:** listens for incoming port connections and registers handlers on each.

### `remote<T>(): RemoteProxy<T>`

Content script overload. Returns a proxy where each method call awaits the shared port before sending the RPC request.

### `remote<T>(tabId: number): RemoteProxy<T>`

Service worker overload. Looks up the stored port for the given tab and returns a typed proxy.

### `detectContext(): 'service-worker' | 'content-script'`

Returns the detected execution context.

## Example

See [`example/`](./example) for a complete Gmail extension that intercepts file uploads, sends the Blob to the service worker, and counts words in `.txt` attachments.

```bash
pnpm build:example
# Load example/dist/ as an unpacked extension in Chrome
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b my-feature`)
3. Run `pnpm verify` before committing
4. Open a pull request

## Development

```bash
pnpm install
pnpm dev           # Watch mode
pnpm test          # Run tests
pnpm build         # Production build
pnpm typecheck     # Type checking
pnpm verify        # Typecheck + test + build
```

## License

MIT
