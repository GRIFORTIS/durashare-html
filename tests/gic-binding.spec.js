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

test('v0.5.0 GIC binding: words path, row path, and column path agree', async ({ page }) => {
  const schemes = [
    { name: '2of3', k: 2, n: 3 },
    { name: '2of4', k: 2, n: 4 },
    { name: '3of5', k: 3, n: 5 }
  ];

  for (const scheme of schemes) {
    await openApp(page);
    await navigateToCreateShares(page);
    await select24Words(page);
    await fillMnemonic(page, TEST_MNEMONIC);
    await selectScheme(page, scheme.name);
    await generateShares(page);

    const rowTotalValue = rowTotal(24);

    for (let i = 0; i < scheme.n; i++) {
      const share = await extractShareData(page, i);

      const shareNumber = parseInt(share.shareNumber, 10);
      const gic = parseInt(share.globalIntegrityCheck, 10);
      const words = share.words.map(w => parseInt(w, 10));
      const rowChecksums = share.checksums.map(c => parseInt(c, 10));
      const columnChecksums = share.columnChecksums.map(c => parseInt(c, 10));

      const sumWords = words.reduce((acc, val) => mod(acc + val), 0);
      const expectedFromWords = mod(mod(sumWords + rowTotalValue + COLUMN_TOTAL) + shareNumber);

      const sumRowChecksums = rowChecksums.reduce((acc, val) => mod(acc + val), 0);
      const expectedFromRows = mod(mod(sumRowChecksums + COLUMN_TOTAL) + shareNumber);

      const sumColumnChecksums = columnChecksums.reduce((acc, val) => mod(acc + val), 0);
      const expectedFromColumns = mod(mod(sumColumnChecksums + rowTotalValue) + shareNumber);

      expect(gic).toBe(expectedFromWords);
      expect(gic).toBe(expectedFromRows);
      expect(gic).toBe(expectedFromColumns);
      expect(expectedFromWords).toBe(expectedFromRows);
      expect(expectedFromWords).toBe(expectedFromColumns);
    }

    const shares = [];
    for (let i = 0; i < scheme.k; i++) {
      shares.push(await extractShareData(page, i));
    }

    await navigateToRecover(page);
    await setupRecovery(page, 24, scheme.k);

    for (let i = 0; i < scheme.k; i++) {
      await fillRecoveryShare(page, i + 1, shares[i]);
    }

    await page.click('#btn-recover-wallet');
    await page.waitForSelector('#pageRecover2', { state: 'visible' });

    const recoveredMnemonic = await getRecoveredMnemonic(page);
    expect(recoveredMnemonic.trim()).toBe(TEST_MNEMONIC);
  }
});
