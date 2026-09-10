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

test('candidate result separates collapsed confidence and kit-health meters', async ({ page }) => {
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
  const meters = page.locator('#recovery-validation-summary > details');
  await expect(meters).toHaveCount(2);
  await expect(meters.nth(0)).not.toHaveAttribute('open', '');
  await expect(meters.nth(1)).not.toHaveAttribute('open', '');

  const confidence = page.locator('[data-meter-kind="confidence"]');
  await expect(confidence).toHaveAttribute('data-state', 'plausible');
  await expect(confidence.locator('.recovery-meter-state'))
    .toHaveText('PLAUSIBLE — NOT SESSION-BOUND');
  const kitHealth = page.locator('[data-meter-kind="kit-health"]');
  await expect(kitHealth).toHaveAttribute('data-state', 'consistent');
  await expect(kitHealth).toHaveAttribute('data-coverage', '1');
  await expect(kitHealth).toHaveAttribute('data-coverage-total', '6');
  await expect(confidence).toHaveAttribute('data-bar-pass', '1');
  await expect(confidence).toHaveAttribute('data-bar-fail', '0');
  await expect(confidence).toHaveAttribute('data-bar-blank', '1');
  await expect(kitHealth).toHaveAttribute('data-bar-pass', '1');
  await expect(kitHealth).toHaveAttribute('data-bar-fail', '0');
  await expect(kitHealth).toHaveAttribute('data-bar-blank', '5');
  await expect(confidence.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.pass'))
    .toHaveCount(1);
  await expect(confidence.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.blank'))
    .toHaveCount(1);
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.pass'))
    .toHaveCount(1);
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.blank'))
    .toHaveCount(1);
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar'))
    .toHaveAttribute(
      'aria-label',
      'Backup Kit Health: 1 pass, 0 fail, 5 not checked, 6 total.'
    );

  const rbt = page.locator('[data-validation-kind="rbt"]');
  await expect(rbt).toHaveAttribute('data-status', 'blank');
  await expect(rbt.locator('.recovery-evidence-status')).toHaveText('NOT CHECKED');
  await expect(rbt).toContainText('No Share payload or Manifest Header');

  const manifestHeader = page.locator('[data-validation-kind="manifest-header"]');
  await expect(manifestHeader).toHaveAttribute('data-status', 'blank');
  const manifestAudit = page.locator('[data-validation-kind="manifest-audit"]');
  await expect(manifestAudit).toHaveAttribute('data-total', '2');
  await expect(manifestAudit).toHaveAttribute('data-blank', '2');
  await expect(manifestAudit).toHaveAttribute('data-pass', '0');

  const bip39 = page.locator('[data-validation-kind="bip39"]');
  await expect(bip39).toHaveAttribute('data-status', 'pass');
  await expect(bip39.locator('.recovery-evidence-status')).toHaveText('VALID');

  const payloadIntegrity = page.locator(
    '[data-validation-kind="payload-integrity"]'
  );
  await expect(payloadIntegrity).toHaveAttribute('data-total', '2');
  await expect(payloadIntegrity).toHaveAttribute('data-blank', '2');

  const checksums = page.locator('[data-validation-kind="checksums"]');
  await expect(checksums).toHaveAttribute('data-total', '16');
  await expect(checksums).toHaveAttribute('data-blank', '0');
  await expect(checksums).toHaveAttribute('data-pass', '16');
  await expect(checksums).toHaveAttribute('data-fail', '0');
  await expect(checksums.locator('.recovery-evidence-bar'))
    .toHaveAttribute('role', 'img');
  await expect(checksums.locator('.recovery-evidence-bar')).toHaveAttribute(
    'aria-label',
    'Share Checksums: 16 pass, 0 fail, 0 not checked, 16 total.'
  );

  const mat = page.locator('[data-validation-kind="mat"]');
  await expect(mat).toHaveAttribute('data-total', '16');
  await expect(mat).toHaveAttribute('data-blank', '16');
  await expect(mat).toHaveAttribute('data-pass', '0');
  await expect(mat).toHaveAttribute('data-fail', '0');

  await kitHealth.locator('summary').click();
  const auditBox = await manifestAudit.boundingBox();
  const matBox = await mat.boundingBox();
  expect(auditBox?.y).toBe(matBox?.y);
  const kitHeights = await kitHealth.locator('.recovery-evidence-item')
    .evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
  expect(new Set(kitHeights).size).toBe(1);

  await confidence.locator('summary').click();
  const confidenceHeights = await confidence.locator('.recovery-evidence-item')
    .evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
  expect(new Set(confidenceHeights).size).toBe(1);
});

test('equal-size evidence bars scale with 24-word 3-share recovery', async ({ page }) => {
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
  const manifestAudit = page.locator('[data-validation-kind="manifest-audit"]');
  await expect(manifestAudit).toHaveAttribute('data-total', '3');
  await expect(manifestAudit).toHaveAttribute('data-blank', '3');
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
