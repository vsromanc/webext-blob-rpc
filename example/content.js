import { remote } from '../src/index';

const bg = remote();

async function analyzeFile(file) {
  console.log(`[blob-rpc] Detected attachment: ${file.name} (${file.type}, ${file.size} bytes)`);

  try {
    const result = await bg.analyzeFile(file);

    if (result.ok) {
      console.log(`[blob-rpc] "${file.name}" has ${result.wordCount} words`);
    } else {
      console.log(`[blob-rpc] Skipped "${file.name}": ${result.reason}`);
    }
  } catch (err) {
    console.error(`[blob-rpc] Error analyzing "${file.name}":`, err);
  }
}

// File input (attach button)
document.addEventListener('change', (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;

  for (const file of input.files) {
    analyzeFile(file);
  }
}, true);

// Drag-and-drop
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer) return;

  for (const file of e.dataTransfer.files) {
    analyzeFile(file);
  }
}, true);

console.log('[blob-rpc] Watching for file uploads on Gmail');
