// Copies the Stockfish WASM engine (GPLv3) from node_modules into public/engine, where the web worker
// loads it from. Runs after `npm install`, so the 7 MB binary is not stored in git.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish');
const out = join(root, 'public', 'engine');
if (!existsSync(src)) process.exit(0); // e.g. production install without the package
mkdirSync(out, { recursive: true });
for (const [from, to] of [
  ['bin/stockfish-18-lite-single.js', 'stockfish.js'],
  ['bin/stockfish-18-lite-single.wasm', 'stockfish.wasm'],
  ['Copying.txt', 'COPYING.txt'],
]) copyFileSync(join(src, from), join(out, to));
