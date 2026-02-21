# webext-blob-rpc

[![npm version](https://img.shields.io/npm/v/webext-blob-rpc)](https://www.npmjs.com/package/webext-blob-rpc)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/webext-blob-rpc)](https://bundlephobia.com/package/webext-blob-rpc)
[![license](https://img.shields.io/npm/l/webext-blob-rpc)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/vsromanc/webext-blob-rpc/actions/workflows/ci.yml/badge.svg)](https://github.com/vsromanc/webext-blob-rpc/actions/workflows/ci.yml)

Type-safe RPC for browser extensions with native Blob support.

- **Structured clone over `MessagePort`** — Blobs, Files, ArrayBuffers transfer natively, no serialization
- **Two functions** — `expose()` + `remote()`, auto-detects content script vs service worker
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

Detects the current context (content script or service worker) and sets up transport automatically. Returns a dispose function that removes the message listener and closes the port.

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
