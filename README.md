# webext-blob-rpc

[![npm version](https://img.shields.io/npm/v/webext-blob-rpc)](https://www.npmjs.com/package/webext-blob-rpc)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/webext-blob-rpc)](https://bundlephobia.com/package/webext-blob-rpc)
[![license](https://img.shields.io/npm/l/webext-blob-rpc)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/vsromanc/webext-blob-rpc/actions/workflows/ci.yml/badge.svg)](https://github.com/vsromanc/webext-blob-rpc/actions/workflows/ci.yml)

Type-safe RPC for browser extensions with native Blob support.

- **Structured clone over `MessagePort`** — Blobs, Files, ArrayBuffers transfer natively, no serialization
- **Auto-wired** — `expose()` + `remote()` auto-detect context; `remoteOffscreen()` gives content scripts a direct port to offscreen documents
- **Full TypeScript inference** — `RemoteProxy<T>` gives you typed async methods
- **Zero runtime dependencies** — just the browser APIs you already have

## Why not `chrome.runtime.sendMessage`?

| | `chrome.runtime.sendMessage` | `webext-blob-rpc` |
|---|---|---|
| Blob / File transfer | JSON only — must base64-encode | Native structured clone |
| ArrayBuffer | Must serialize | Native transfer |
| Type safety | Manual typing | Full `RemoteProxy<T>` inference |
| Bidirectional | Requires separate listeners | `expose` + `remote` on both sides |
| Setup | Manual message routing | Two functions, auto-wired |

## Usage

### Content script — capture and send a file to background

```ts
import { expose, remote } from 'webext-blob-rpc';

// Types shared between content script and service worker
type BgAPI = {
  uploadFile: (file: File) => { hash: string; size: number };
  processImage: (bitmap: ImageBitmap) => ArrayBuffer;
};

type ContentAPI = {
  captureCanvas: () => Blob;
};

// Expose methods the service worker can call
expose<ContentAPI>({
  captureCanvas: () => {
    const canvas = document.querySelector('canvas')!;
    return new Promise<Blob>((resolve) => canvas.toBlob(resolve!));
  },
});

// Call service worker methods — Blobs and Files transfer natively
const bg = remote<BgAPI>();

document.querySelector('input[type=file]')!.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files![0];

  // File sent over MessagePort via structured clone — no base64, no chunking
  const { hash, size } = await bg.uploadFile(file);
  console.log(`Uploaded ${file.name}: ${hash} (${size} bytes)`);
});
```

### Service worker — receive and process binary data

```ts
import { expose, remote } from 'webext-blob-rpc';

type BgAPI = {
  uploadFile: (file: File) => { hash: string; size: number };
  processImage: (bitmap: ImageBitmap) => ArrayBuffer;
};

type ContentAPI = {
  captureCanvas: () => Blob;
};

expose<BgAPI>({
  async uploadFile(file) {
    // file is a real File object — read it directly
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hash = [...new Uint8Array(hashBuffer)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return { hash, size: file.size };
  },

  async processImage(bitmap) {
    // ImageBitmap transfers natively too
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp' });
    return blob.arrayBuffer();
  },
});

// Call content script methods by tab ID
const page = remote<ContentAPI>(tabId);
const screenshot = await page.captureCanvas(); // Blob instance
```

### Offscreen document — extracting content from HTML in the background

Offscreen documents can use the DOM but run outside any tab. The service worker creates the document, then uses `connectOffscreen()` to establish a direct `MessagePort` connection (no bridge iframe needed).

#### Shared types

```ts
type OffscreenAPI = {
  extractText: (html: string) => string;
};

type BgAPI = {
  getSettings: () => { maxLength: number };
};
```

#### Service worker

```ts
import { expose, connectOffscreen } from 'webext-blob-rpc';

// expose() still handles content script connections
expose<BgAPI>({ getSettings: () => ({ maxLength: 5000 }) });

// Create the offscreen document yourself
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: ['DOM_PARSER'],
  justification: 'Parse HTML content',
});

// Connect — library only handles the port
const offscreen = await connectOffscreen<OffscreenAPI>({
  url: 'offscreen.html',
  // Optional: expose SW methods back to the offscreen doc
  handlers: { getSettings: () => ({ maxLength: 5000 }) },
});

const text = await offscreen.extractText('<h1>Hello</h1>');
```

#### Offscreen document (`offscreen.html`)

```ts
import { expose, remote } from 'webext-blob-rpc';

// Auto-detects offscreen context, waits for port from SW
expose<OffscreenAPI>({
  extractText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent ?? '';
  },
});

// Call SW methods on the same port (if SW provided handlers)
const bg = remote<BgAPI>();
const { maxLength } = await bg.getSettings();
```

#### Content script → offscreen (direct, via port brokering)

`remoteOffscreen()` gives content scripts a direct `MessagePort` to the offscreen document. The service worker brokers the port once, then steps out of the way — no relay overhead per call.

```ts
// --- content script ---
import { remoteOffscreen } from 'webext-blob-rpc';

const offscreen = remoteOffscreen<OffscreenAPI>();
const text = await offscreen.extractText('<h1>Hello</h1>');
```

No changes are needed in the service worker or offscreen document — `connectOffscreen()` and `expose()` already handle brokering transparently.

> **Note:** The service worker must have called `connectOffscreen()` before the content script calls `remoteOffscreen()`, so the offscreen port is available for brokering.

### Error propagation

Errors thrown in handlers propagate to the caller:

```ts
try {
  await bg.uploadFile(file);
} catch (e) {
  // Error from service worker surfaces here
}
```

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

## API

### `expose(handlers): () => void`

Detects the current context and sets up transport automatically. Returns a dispose function that removes the message listener and closes the port.

- **Content script:** creates a bridge port in the background, then registers handlers on it.
- **Service worker:** listens for incoming port connections and registers handlers on each.
- **Offscreen / extension page:** waits for a `MessagePort` from the service worker (sent via `connectOffscreen`), then registers handlers on it.

### `remote<T>(): RemoteProxy<T>`

Content script or offscreen document overload. Returns a proxy where each method call awaits the shared port before sending the RPC request.

### `remote<T>(tabId: number): RemoteProxy<T>`

Service worker overload. Looks up the stored port for the given tab and returns a typed proxy.

### `remoteOffscreen<T>(options?): RemoteProxy<T>`

Content script only. Returns a lazy proxy that, on first method call, requests a brokered `MessagePort` from the service worker directly to the offscreen document. After brokering, RPC flows directly between the content script and offscreen document without service worker relay.

The service worker must have called `connectOffscreen()` before the content script uses `remoteOffscreen()`.

Options:
- `timeout` — ms to wait for each RPC call (default: `30000`).

### `connectOffscreen<T>(options): Promise<RemoteProxy<T>>`

Service worker only. Connects to an existing offscreen document (or any extension page) via `MessagePort`. The user must create the offscreen document before calling this function.

Options:
- `url` — path to the offscreen HTML file (e.g. `'offscreen.html'`). Used with `chrome.runtime.getURL()` to find the client.
- `handlers` — optional object of SW methods to expose on the same port, enabling bidirectional RPC.
- `timeout` — ms to wait for ack from the offscreen document (default: `10000`).

Connections are cached by URL. Subsequent calls with the same `url` return the same proxy.

### `detectContext(): 'service-worker' | 'content-script' | 'offscreen'`

Returns the detected execution context. Extension pages (`chrome-extension://` protocol with `document` present) return `'offscreen'`.

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
