import { test, expect } from '@playwright/test';
import {
  openApp,
  navigateToCreateShares,
  select24Words,
  fillMnemonic,
  selectScheme,
  generateShares,
  extractShareData,
  navigateToRecover,
  setupRecovery,
  fillRecoveryShare,
  recoverWallet,
  getRecoveredMnemonic
} from './test-helpers.js';

const FIELD_PRIME = 2053;
const COLUMN_TOTAL = 60;

function mod(n) {
  return ((n % FIELD_PRIME) + FIELD_PRIME) % FIELD_PRIME;
}

function rowTotal(wordCount) {
  const rowCount = wordCount / 3;
  return (rowCount * (rowCount + 1)) / 2;
}

const TEST_MNEMONIC =
  'abandon zoo enhance young join maximum fancy call minimum code spider olive alcohol system also share birth profit horn bargain beauty media rapid tattoo';

const SCHEMES = [
  { name: '2of3', k: 2, n: 3 },
  { name: '2of4', k: 2, n: 4 },
  { name: '3of5', k: 3, n: 5 }
];

test.describe('v0.5.0 GIC binding: words, row, and column paths agree', () => {
  for (const scheme of SCHEMES) {
    test(scheme.name, async ({ page }) => {
      await openApp(page);
      await navigateToCreateShares(page);
      await select24Words(page);
      await fillMnemonic(page, TEST_MNEMONIC);
      await selectScheme(page, scheme.name);
      await generateShares(page);

      const rowTotalValue = rowTotal(24);
      const shares = [];

      for (let i = 0; i < scheme.n; i++) {
        const share = await extractShareData(page, i);
        shares.push(share);

        const shareNumber = parseInt(share.shareNumber, 10);
        const gic = parseInt(share.globalIntegrityCheck, 10);
        const words = share.words.map(w => parseInt(w, 10));
        const rowChecksums = share.checksums.map(c => parseInt(c, 10));
        const columnChecksums = share.columnChecksums.map(c => parseInt(c, 10));

        const sumWords = words.reduce((acc, val) => mod(acc + val), 0);
        const expectedFromWords = mod(
          mod(sumWords + rowTotalValue + COLUMN_TOTAL) + shareNumber
        );

        const sumRowChecksums = rowChecksums.reduce((acc, val) => mod(acc + val), 0);
        const expectedFromRows = mod(
          mod(sumRowChecksums + COLUMN_TOTAL) + shareNumber
        );

        const sumColumnChecksums = columnChecksums.reduce((acc, val) => mod(acc + val), 0);
        const expectedFromColumns = mod(
          mod(sumColumnChecksums + rowTotalValue) + shareNumber
        );

        expect(gic).toBe(expectedFromWords);
        expect(gic).toBe(expectedFromRows);
        expect(gic).toBe(expectedFromColumns);
        expect(expectedFromWords).toBe(expectedFromRows);
        expect(expectedFromWords).toBe(expectedFromColumns);
      }

      await navigateToRecover(page);
      await setupRecovery(page, 24, scheme.k);

      for (let i = 0; i < scheme.k; i++) {
        await fillRecoveryShare(page, i + 1, shares[i]);
      }

      await recoverWallet(page);

      const recoveredMnemonic = await getRecoveredMnemonic(page);
      expect(recoveredMnemonic.trim()).toBe(TEST_MNEMONIC);
    });
  }
});
