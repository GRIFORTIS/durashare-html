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

const SPEC_VERSION = 'v0.5.0';
/** Frozen v0.5.0 machine-readable vectors (see durashare `previous_versions/README.md`). */
const VECTORS_REL_PATH = join('previous_versions', SPEC_VERSION, 'test_vectors', 'vectors.json');
const SUPPORTED_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveSpecRepoRoot() {
  const envPath =
    process.env.DURASHARE_SPEC_REPO_PATH || process.env.SCHIAVINATO_SHARING_SPEC_REPO_PATH;
  if (envPath) return envPath;

  // Prefer the new local folder name; keep the pre-rename sibling name for transition.
  for (const name of ['durashare', 'schiavinato-sharing']) {
    const siblingPath = resolve(__dirname, '..', '..', name);
    if (fs.existsSync(siblingPath)) return siblingPath;
  }

  throw new Error(
    'Canonical vectors not found. Set DURASHARE_SPEC_REPO_PATH to the spec repo ' +
      'or clone durashare next to durashare-html.'
  );
}

function loadVectors() {
  const specRoot = resolveSpecRepoRoot();
  const vectorsPath = join(specRoot, VECTORS_REL_PATH);
  if (!fs.existsSync(vectorsPath)) {
    throw new Error(
      `Missing frozen v0.5.0 vectors at ${vectorsPath}. Use an up-to-date ` +
        'durashare tree (see `previous_versions/v0.5.0/test_vectors/`) and set ' +
        'DURASHARE_SPEC_REPO_PATH if the spec repo is not a sibling of this repo.'
    );
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

test.describe('Canonical vectors v0.5.0 (recovery-only)', () => {
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
              globalIntegrityCheck: formatValue(share.printed_gic),
              words: share.words.map(formatValue),
              checksums: share.row_checksums.map(formatValue),
              columnChecksums: share.column_checksums.map(formatValue)
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
