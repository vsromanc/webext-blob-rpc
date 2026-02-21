import { defineConfig } from 'tsup';

export default defineConfig([
  {
    clean: true,
    entry: ['./src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    treeshake: true,
    cjsInterop: true,
  },
  {
    entry: { bridge: './src/bridge.ts' },
    outDir: 'static',
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    treeshake: true,
    minify: true,
  },
]);
