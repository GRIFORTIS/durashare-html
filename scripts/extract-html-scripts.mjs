#!/usr/bin/env node
/**
 * Extract inline <script> bodies from durashare.html for ESLint.
 * Classic scripts share one global scope in order; we concatenate them the same way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'durashare.html');
const outDir = path.join(root, '.cache');
const outPath = path.join(outDir, 'durashare.extracted.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const blocks = [];
let match;
while ((match = re.exec(html)) !== null) {
  const attrs = (match[1] || '').trim();
  if (/\bsrc\s*=/i.test(attrs)) continue;
  if (/\btype\s*=\s*["'](?!text\/javascript|application\/javascript|module)[^"']+["']/i.test(attrs)) {
    continue;
  }
  blocks.push({ index: blocks.length + 1, body: match[2] });
}

if (blocks.length === 0) {
  console.error(`No inline <script> blocks found in ${htmlPath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const parts = blocks.map(
  (b) =>
    `/* ===== extracted inline script block ${b.index} from durashare.html ===== */\n${b.body.trim()}\n`
);
fs.writeFileSync(outPath, parts.join('\n'), 'utf8');
console.log(`Wrote ${blocks.length} script block(s) → ${path.relative(root, outPath)}`);
