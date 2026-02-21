# Changelog

## 0.2.1

- Add npm search keywords for discoverability

## 0.2.0

- Remove explicit `MessagePort` overloads from public API (`expose(handlers, port)`, `remote(port)`)
- Remove re-exports of `createServiceWorkerPort`, `onPortConnect`
- Fix race condition in service worker port init that could cause RPC timeouts
- Fix `package.json` exports to match actual build output (`.js`/`.cjs`, not `.mjs`)
- Add example Gmail extension (attachment word counter)
- Switch from npm to pnpm

## 0.1.0

- Initial release
- Auto-wiring `expose()` and `remote()` for content scripts and service workers
- Native Blob/File transfer over `MessagePort` via iframe bridge
- Type-safe `RemoteProxy<T>` with full inference
- Error propagation across contexts
- Configurable per-call timeout
