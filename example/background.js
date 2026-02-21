import { expose } from '../src/index';

expose({
  async analyzeFile(blob) {
    if (blob.type !== 'text/plain') {
      return { ok: false, reason: `Not a text file (${blob.type || 'unknown type'})` };
    }

    const text = await blob.text();
    const words = text.trim().split(/\s+/).filter(Boolean);

    return {
      ok: true,
      fileName: blob.name ?? '(unnamed)',
      size: blob.size,
      wordCount: words.length,
    };
  },
});
