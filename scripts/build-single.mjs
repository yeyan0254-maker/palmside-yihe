import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const outputFile = path.join(projectRoot, 'dist-single', 'index.html');
const MAX_BYTES = 3.0 * 1024 * 1024;

const result = spawnSync(process.execPath, [viteBin, 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    SINGLE_FILE: 'true',
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(outputFile)) {
  console.error(`[build:single] Missing output file: ${outputFile}`);
  process.exit(1);
}

const stats = fs.statSync(outputFile);
const mb = stats.size / (1024 * 1024);
console.log(
  `[build:single] Bundle ready: ${outputFile} (${stats.size.toLocaleString()} bytes / ${mb.toFixed(3)} MB, limit 3.000 MB)`
);

if (stats.size > MAX_BYTES) {
  console.error(`[build:single] ERROR: Single-file bundle exceeds 3.0 MB limit (${mb.toFixed(3)} MB)`);
  process.exit(1);
}
