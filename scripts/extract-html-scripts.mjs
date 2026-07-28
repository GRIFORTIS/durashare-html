#!/usr/bin/env node
/**
 * Extract inline <script> bodies from durashare.html for ESLint.
 * Classic scripts share one global scope in order; we concatenate them the same way.
 *
 * Uses indexOf scanning (not HTML-filter regexes) so CodeQL does not treat this
 * maintainer tool as an incomplete sanitizer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'durashare.html');
const outDir = path.join(root, '.cache');
const outPath = path.join(outDir, 'durashare.extracted.js');

function extractInlineScripts(html) {
  const lower = html.toLowerCase();
  const blocks = [];
  let pos = 0;

  while (pos < html.length) {
    const start = lower.indexOf('<script', pos);
    if (start === -1) break;

    const afterName = start + '<script'.length;
    const boundary = html[afterName];
    if (boundary && /[a-z0-9]/i.test(boundary)) {
      pos = afterName;
      continue;
    }

    const tagClose = html.indexOf('>', afterName);
    if (tagClose === -1) break;

    const attrs = html.slice(afterName, tagClose);
    const bodyStart = tagClose + 1;
    const endOpen = lower.indexOf('</script', bodyStart);
    if (endOpen === -1) break;

    const endClose = html.indexOf('>', endOpen);
    if (endClose === -1) break;

    pos = endClose + 1;

    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["'](?!text\/javascript|application\/javascript|module)[^"']+["']/i.test(attrs)) {
      continue;
    }

    blocks.push({ index: blocks.length + 1, body: html.slice(bodyStart, endOpen) });
  }

  return blocks;
}

const html = fs.readFileSync(htmlPath, 'utf8');
const blocks = extractInlineScripts(html);

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
