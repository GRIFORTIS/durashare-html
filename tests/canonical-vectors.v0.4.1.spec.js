import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import {
  openApp,
  setupRecovery,
  fillRecoveryShare,
  recoverWallet,
  getRecoveredMnemonic,
  navigateToRecoverFromHome
} from './test-helpers.js';

const SPEC_VERSION = 'v0.4.1';
const VECTORS_REL_PATH = join('test_vectors', SPEC_VERSION, 'vectors.json');
const SUPPORTED_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveSpecRepoRoot() {
  const envPath = process.env.SCHIAVINATO_SHARING_SPEC_REPO_PATH;
  if (envPath) return envPath;

  const siblingPath = resolve(__dirname, '..', '..', 'schiavinato-sharing');
  if (fs.existsSync(siblingPath)) return siblingPath;

  throw new Error(
    'Canonical vectors not found. Set SCHIAVINATO_SHARING_SPEC_REPO_PATH to the spec repo ' +
      'or clone schiavinato-sharing next to schiavinato-sharing-html.'
  );
}

function loadVectors() {
  const specRoot = resolveSpecRepoRoot();
  const vectorsPath = join(specRoot, VECTORS_REL_PATH);
  if (!fs.existsSync(vectorsPath)) {
    throw new Error(`Missing vectors file at ${vectorsPath}.`);
  }

  const raw = fs.readFileSync(vectorsPath, 'utf8');
  const json = JSON.parse(raw);

  if (json.version !== SPEC_VERSION) {
    throw new Error(`Vectors version mismatch: expected ${SPEC_VERSION}, got ${json.version}.`);
  }

  return json;
}

function formatValue(value) {
  return String(value).padStart(4, '0');
}

const vectorsJson = loadVectors();
const vectors = Array.isArray(vectorsJson.vectors) ? vectorsJson.vectors : [];

const compatibleVectors = vectors.filter((vector) => {
  const wordCount = vector?.params?.word_count;
  const prime = vector?.params?.field?.prime;
  return prime === 2053 && SUPPORTED_WORD_COUNTS.has(wordCount);
});

if (compatibleVectors.length === 0) {
  throw new Error('No compatible vectors found for the HTML implementation.');
}

test.describe('Canonical vectors v0.4.1 (recovery-only)', () => {
  for (const vector of compatibleVectors) {
    const wordCount = vector.params.word_count;
    const shareMap = new Map(vector.shares.map((share) => [share.x, share]));
    const combinations = vector.recovery?.lagrange_table ?? [];

    test.describe(`${vector.id} (${wordCount} words)`, () => {
      for (const combo of combinations) {
        const sharesUsed = combo.shares_used;
        const label = `recover with shares ${sharesUsed.join(',')}`;

        test(label, async ({ page }) => {
          await openApp(page);
          await navigateToRecoverFromHome(page);

          const k = sharesUsed.length;
          await setupRecovery(page, wordCount, k);

          for (let i = 0; i < sharesUsed.length; i++) {
            const x = sharesUsed[i];
            const share = shareMap.get(x);
            if (!share) {
              throw new Error(`Missing share data for x=${x} in vector ${vector.id}`);
            }

            const shareData = {
              shareNumber: String(share.x),
              globalIntegrityCheck: formatValue(share.gic_share),
              words: share.words.map(formatValue),
              checksums: share.row_checksums.map(formatValue)
            };

            await fillRecoveryShare(page, i + 1, shareData);
          }

          await recoverWallet(page);
          const recoveredMnemonic = await getRecoveredMnemonic(page);
          const expectedMnemonic = vector.mnemonic.words.join(' ');

          expect(recoveredMnemonic.trim()).toBe(expectedMnemonic);
        });
      }
    });
  }
});
