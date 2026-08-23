import { test, expect } from '@playwright/test';
import {
  openApp,
  navigateToCreateShares,
  select12Words,
  select24Words,
  fillMnemonic,
  selectScheme,
  generateShares,
  extractShareData,
  navigateToRecover,
  setupRecovery,
  fillRecoveryShare,
  getBip39WordlistForTest
} from './test-helpers.js';

const MNEMONIC_12 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEMONIC_24 =
  'abandon zoo enhance young join maximum fancy call minimum code spider olive alcohol system also share birth profit horn bargain beauty media rapid tattoo';

test('candidate result exposes four accessible validation summaries without a review gate', async ({ page }) => {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, MNEMONIC_12);
  await selectScheme(page, '2of3');
  await generateShares(page);

  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await page.click('#btn-recover-wallet');

  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('#pageRecover2 h2')).toHaveText('Candidate Recovery Result');
  await expect(
    page.getByRole('heading', { name: 'Recovered Seed Phrase', exact: true })
  ).toBeVisible();
  await expect(page.locator('#custom-modal')).not.toBeVisible();
  await expect(page.getByText('Checks Need Review')).toHaveCount(0);
  await expect(page.locator('#recovery-validation-summary > section')).toHaveCount(4);

  const rbt = page.locator('[data-validation-kind="rbt"]');
  await expect(rbt).toHaveAttribute('data-status', 'not-checked');
  await expect(rbt.locator('.recovery-status-value')).toHaveText('NOT CHECKED');
  await expect(rbt).toContainText('not implemented in this HTML version');

  const bip39 = page.locator('[data-validation-kind="bip39"]');
  await expect(bip39).toHaveAttribute('data-status', 'pass');
  await expect(bip39.locator('.recovery-status-value')).toHaveText('PASS');

  const checksums = page.locator('[data-validation-kind="checksums"]');
  await expect(checksums).toHaveAttribute('data-total', '16');
  await expect(checksums).toHaveAttribute('data-blank', '0');
  await expect(checksums).toHaveAttribute('data-pass', '16');
  await expect(checksums).toHaveAttribute('data-fail', '0');
  await expect(checksums.locator('svg')).toHaveAttribute('role', 'img');
  await expect(checksums.locator('svg')).toHaveAttribute(
    'aria-label',
    'Share Checksums: 16 pass, 0 fail, 0 blank, 16 total.'
  );

  const mat = page.locator('[data-validation-kind="mat"]');
  await expect(mat).toHaveAttribute('data-total', '16');
  await expect(mat).toHaveAttribute('data-blank', '16');
  await expect(mat).toHaveAttribute('data-pass', '0');
  await expect(mat).toHaveAttribute('data-fail', '0');
});

test('donut totals scale with 24-word 3-share recovery', async ({ page }) => {
  await openApp(page);
  await navigateToCreateShares(page);
  await select24Words(page);
  await fillMnemonic(page, MNEMONIC_24);
  await selectScheme(page, '3of5');
  await generateShares(page);

  const share1 = await extractShareData(page, 0);
  const share3 = await extractShareData(page, 2);
  const share5 = await extractShareData(page, 4);
  await navigateToRecover(page);
  await setupRecovery(page, 24, 3);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share3);
  await fillRecoveryShare(page, 3, share5);
  await page.click('#btn-recover-wallet');

  const checksums = page.locator('[data-validation-kind="checksums"]');
  await expect(checksums).toHaveAttribute('data-total', '36');
  await expect(checksums).toHaveAttribute('data-pass', '36');
  await expect(checksums).toHaveAttribute('data-fail', '0');

  const mat = page.locator('[data-validation-kind="mat"]');
  await expect(mat).toHaveAttribute('data-total', '48');
  await expect(mat).toHaveAttribute('data-blank', '48');
});

test('duplicate Share Numbers still block before any candidate is shown', async ({ page }) => {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, MNEMONIC_12);
  await selectScheme(page, '2of3');
  await generateShares(page);

  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await page.fill('#recover-x-2', share1.shareNumber);
  await page.click('#btn-recover-wallet');

  await expect(page.locator('#custom-modal')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('Input Error');
  await expect(page.locator('#modal-text')).toContainText('Duplicate share numbers');
  await expect(page.locator('#pageRecover1')).toBeVisible();
  await expect(page.locator('#pageRecover2')).not.toBeVisible();
});

test('core recovery accepts only Share Numbers and words and always evaluates BIP39', async ({ page }) => {
  await openApp(page);
  const wordlist = getBip39WordlistForTest();

  const report = await page.evaluate(async ({ bip39Wordlist }) => {
    const words = new Array(12).fill(1);
    return globalThis.DuraShare.recoverAndValidate(
      [
        { shareNumber: 1, wordShares: [...words] },
        { shareNumber: 2, wordShares: [...words] }
      ],
      12,
      bip39Wordlist
    );
  }, { bip39Wordlist: wordlist });

  expect(report.recoveredMnemonic).toBe(new Array(12).fill('abandon').join(' '));
  expect(report.validation.bip39.status).toBe('fail');
  expect(report.validation.rbt.status).toBe('not-checked');
  expect(report.errors.bip39).toBe(true);
  expect(report.errors).not.toHaveProperty('rowPathMismatch');
  expect(report.errors).not.toHaveProperty('globalPathMismatch');
});
