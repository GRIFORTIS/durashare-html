import { test, expect } from '@playwright/test';
import {
  openApp,
  navigateToCreateShares,
  select12Words,
  fillMnemonic,
  selectScheme,
  selectMatMode,
  selectMatCustody,
  generateShares,
  extractShareData,
  navigateToRecover,
  navigateToRecoverFromHome,
  setupRecovery,
  fillRecoveryShare,
  recoverWallet,
  getRecoveredMnemonic
} from './test-helpers.js';

test.describe.configure({ timeout: 30000 });

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function create12WordShares(page, { matMode = 'dual', custody = 'whole' } = {}) {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, MNEMONIC);
  await selectScheme(page, '2of3');
  await selectMatMode(page, matMode);
  if (matMode !== 'none') {
    await selectMatCustody(page, custody);
  }
  await generateShares(page);
}

async function extractManifestKeys(page, shareNumber, kind = 'whole') {
  const section = page.locator(
    `.manifest-card[data-manifest-kind="${kind}"] ` +
    `.manifest-share-section[data-share-number="${shareNumber}"]`
  );
  return section.locator(':scope > .manifest-key-grid').evaluateAll(grids =>
    grids.map(grid => {
      const values = Array.from(grid.querySelectorAll('code[data-manifest-key="true"]'))
        .map(code => Number(code.textContent));
      return {
        weights: values.slice(0, 3),
        rowPads: values.slice(3)
      };
    })
  );
}

async function fillRecoveryMatColumn(
  page,
  shareIndex,
  columnIndex,
  { tags = [], weights = [], rowPads = [] },
  part = 'primary'
) {
  if (weights.length > 0 || rowPads.length > 0) {
    const details = page.locator(`#share-container-${shareIndex} .recovery-mat-keys`);
    if (!(await details.evaluate(element => element.open))) {
      await details.locator('summary').click();
    }
  }
  const slot = columnIndex === 0 ? 'mat-a' : 'mat-b';
  for (let row = 0; row < tags.length; row++) {
    await page.fill(
      `#recover-share-${shareIndex}-row-${row}-${slot}`,
      String(tags[row]).padStart(4, '0')
    );
  }
  for (let weight = 0; weight < weights.length; weight++) {
    await page.fill(
      `#recover-mat-key-${shareIndex}-${columnIndex}-${part}-weight-${weight}`,
      String(weights[weight]).padStart(4, '0')
    );
  }
  for (let row = 0; row < rowPads.length; row++) {
    await page.fill(
      `#recover-mat-key-${shareIndex}-${columnIndex}-${part}-pad-${row}`,
      String(rowPads[row]).padStart(4, '0')
    );
  }
}

test('Dual MAT is the default and renders Shares before a Whole-Key Manifest', async ({ page }) => {
  await openApp(page);
  await navigateToCreateShares(page);

  await expect(page.locator('#mat-dual')).toBeChecked();
  await expect(page.locator('#mat-custody-whole')).toBeChecked();

  await select12Words(page);
  await fillMnemonic(page, MNEMONIC);
  await selectScheme(page, '2of3');
  await generateShares(page);

  const output = page.locator('#shares-output');
  await expect(output.locator(':scope > .share-card')).toHaveCount(3);
  await expect(output.locator(':scope > .manifest-card')).toHaveCount(1);

  const firstShare = output.locator(':scope > .share-card').first();
  await expect(firstShare.locator('.share-word-list')).toHaveCSS('--share-columns', '6');
  await expect(firstShare.locator('code[data-mat-value="true"]')).toHaveCount(8);
  for (const text of await firstShare.locator('code[data-mat-value="true"]').allTextContents()) {
    expect(text).toMatch(/^\d{4}$/);
  }

  const manifest = output.locator(':scope > .manifest-card');
  await expect(manifest).toHaveAttribute('data-manifest-kind', 'whole');
  await expect(manifest.locator('code[data-manifest-key="true"]')).toHaveCount(42);
  await expect(manifest).not.toContainText('GIC');
  await expect(manifest).toContainText('Whole-Key');
  for (const text of await manifest.locator('code[data-manifest-key="true"]').allTextContents()) {
    expect(text).toMatch(/^\d{4}$/);
  }

  const lastShareIndex = await output.locator(':scope > .share-card').last().evaluate(element =>
    Array.from(element.parentElement.children).indexOf(element)
  );
  const manifestIndex = await manifest.evaluate(element =>
    Array.from(element.parentElement.children).indexOf(element)
  );
  expect(manifestIndex).toBeGreaterThan(lastShareIndex);
});

test('Single MAT with Split-Key renders one tag column and two complete counterpart Manifests', async ({ page }) => {
  await create12WordShares(page, { matMode: 'single', custody: 'split' });

  const output = page.locator('#shares-output');
  const firstShare = output.locator(':scope > .share-card').first();
  await expect(firstShare.locator('.share-word-list')).toHaveCSS('--share-columns', '5');
  await expect(firstShare.locator('code[data-mat-value="true"]')).toHaveCount(4);
  await expect(firstShare.locator('.share-word-item label').filter({ hasText: /^MAT A1$/ })).toHaveCount(1);
  await expect(firstShare.locator('.share-word-item label').filter({ hasText: /^MAT 1$/ })).toHaveCount(0);

  const manifests = output.locator(':scope > .manifest-card');
  await expect(manifests).toHaveCount(2);
  await expect(manifests.nth(0)).toHaveAttribute('data-manifest-kind', 'split-a');
  await expect(manifests.nth(1)).toHaveAttribute('data-manifest-kind', 'split-b');
  await expect(manifests.nth(0).locator('code[data-manifest-key="true"]')).toHaveCount(21);
  await expect(manifests.nth(1).locator('code[data-manifest-key="true"]')).toHaveCount(21);
  await expect(manifests.nth(0)).toContainText('MAT A Keys');
});

test('No MAT keeps the four-column Share and still renders a keyless Manifest', async ({ page }) => {
  await create12WordShares(page, { matMode: 'none' });

  const output = page.locator('#shares-output');
  const firstShare = output.locator(':scope > .share-card').first();
  await expect(firstShare.locator('.share-word-list')).toHaveCSS('--share-columns', '4');
  await expect(firstShare.locator('code[data-mat-value="true"]')).toHaveCount(0);

  const manifest = output.locator(':scope > .manifest-card');
  await expect(manifest).toHaveCount(1);
  await expect(manifest).toHaveAttribute('data-manifest-kind', 'none');
  await expect(manifest.locator('code[data-manifest-key="true"]')).toHaveCount(0);
  await expect(manifest).toContainText('No MAT key material for this Share.');
});

test('share generation is single-flight and disables repeat activation while cryptography runs', async ({ page }) => {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, MNEMONIC);
  await selectScheme(page, '2of3');

  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const originalCreate = api.createSharingArtifacts;
    globalThis.__createSharingArtifactsCalls = 0;
    api.createSharingArtifacts = async (...args) => {
      globalThis.__createSharingArtifactsCalls++;
      await new Promise(resolve => setTimeout(resolve, 750));
      return originalCreate(...args);
    };
  });

  const generation = generateShares(page);
  await page.waitForFunction(() => globalThis.__createSharingArtifactsCalls === 1);

  const button = page.locator('#btn-generate-shares');
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toContainText('Generating');

  // dispatchEvent bypasses the disabled control's normal click suppression and
  // proves that the listener's own single-flight guard also rejects re-entry.
  await page.evaluate(() => {
    document.getElementById('btn-generate-shares')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  await generation;
  await expect(page.locator('#pageCreate2')).toBeVisible();
  expect(await page.evaluate(() => globalThis.__createSharingArtifactsCalls)).toBe(1);
});

test('temporary arithmetic source shares are cleared after successful generation', async ({ page }) => {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, MNEMONIC);
  await selectScheme(page, '2of3');

  await page.evaluate(() => {
    const originalPush = Array.prototype.push;
    const captured = [];
    globalThis.__restoreArrayPush = () => {
      Array.prototype.push = originalPush;
    };
    globalThis.__capturedArithmeticShares = captured;
    Array.prototype.push = function(...items) {
      for (const item of items) {
        if (
          item &&
          Array.isArray(item.wordShares) &&
          Array.isArray(item.checksumShares) &&
          !Object.hasOwn(item, 'matMode')
        ) {
          originalPush.call(captured, item);
        }
      }
      return originalPush.apply(this, items);
    };
  });

  let snapshot;
  try {
    await generateShares(page);
  } finally {
    snapshot = await page.evaluate(() => {
      globalThis.__restoreArrayPush();
      const shares = globalThis.__capturedArithmeticShares;
      return {
        count: shares.length,
        allCleared: shares.every(share =>
          share.wordShares.length === 0 &&
          share.checksumShares.length === 0 &&
          share.columnChecksumShares.length === 0 &&
          share.globalIntegrityCheckShare === 0
        )
      };
    });
  }

  expect(snapshot.count).toBe(3);
  expect(snapshot.allCleared).toBe(true);
});

test('Recovery always mirrors the Dual-MAT Share layout without MAT configuration toggles', async ({ page }) => {
  await openApp(page);
  await navigateToRecoverFromHome(page);
  await setupRecovery(page, 12, 2);

  await expect(page.locator('input[name="recover-mat-mode"]')).toHaveCount(0);
  await expect(page.locator('input[name="recover-mat-custody"]')).toHaveCount(0);
  await expect(page.locator('#share-container-1 .share-word-list')).toHaveCSS('--share-columns', '6');
  await expect(page.locator('#share-container-1 input[data-slot="mat-a"]')).toHaveCount(4);
  await expect(page.locator('#share-container-1 input[data-slot="mat-b"]')).toHaveCount(4);
  await expect(page.locator('#share-container-1 input[data-mat-key="true"]')).toHaveCount(28);
  const details = page.locator('#share-container-1 .recovery-mat-keys');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('summary')).toHaveText(
    'Manifest Keys for Share Input #1 — optional'
  );
  await details.locator('summary').click();
  await expect(details.locator('.recovery-manifest-panel').nth(0)).toContainText(
    'Share Manifest / Share Manifest A'
  );
  await expect(details.locator('.recovery-manifest-panel').nth(1)).toContainText(
    'Share Manifest B — Split-Key only'
  );
  await expect(details).toContainText('One Split-Key Manifest alone cannot perform MAT validation');
});

test('word-count changes preserve hidden raw MAT tags and Row Pads exactly', async ({ page }) => {
  await openApp(page);
  await navigateToRecoverFromHome(page);
  await setupRecovery(page, 24, 2);

  await page.fill('#recover-share-1-row-7-mat-a', '7');
  const details = page.locator('#share-container-1 .recovery-mat-keys');
  await details.locator('summary').click();
  await page.fill('#recover-mat-key-1-0-primary-pad-7', '456');

  await page.click('#recover-btn-12-words');
  await page.click('#recover-btn-24-words');

  await expect(page.locator('#recover-share-1-row-7-mat-a')).toHaveValue('7');
  await expect(page.locator('#recover-mat-key-1-0-primary-pad-7')).toHaveValue('456');
});

test('completed rows validate RC immediately while incomplete CC and GIC remain neutral', async ({ page }) => {
  await openApp(page);
  await navigateToRecoverFromHome(page);
  await setupRecovery(page, 12, 2);

  const firstTwoRows = [
    [748, 1865, 1941],
    [1013, 420, 640]
  ];
  for (let row = 0; row < firstTwoRows.length; row++) {
    for (let word = 0; word < 3; word++) {
      await page.fill(
        `#recover-share-1-row-${row}-word-${word}`,
        String(firstTwoRows[row][word])
      );
    }
  }
  await page.fill('#recover-share-1-row-0-checksum', '449');
  await page.fill('#recover-share-1-row-1-checksum', '22');
  await page.fill('#recover-share-1-column-0', '1');
  await page.fill('#recover-share-1-gic', '1');
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#recover-share-1-row-0-checksum')).toHaveClass(/valid/);
  await expect(page.locator('#recover-share-1-row-1-checksum')).toHaveClass(/valid/);
  await expect(page.locator('#recover-share-1-column-0')).not.toHaveClass(/valid|invalid/);
  await expect(page.locator('#recover-share-1-gic')).not.toHaveClass(/valid|invalid/);

  await page.fill('#recover-share-1-row-0-word-0', '749');
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#recover-share-1-row-0-checksum')).toHaveClass(/invalid/);
  await expect(page.locator('#recover-share-1-row-1-checksum')).toHaveClass(/valid/);
  await expect(
    page.locator('#share-container-1 input[data-row-index="0"][data-slot^="word-"].invalid')
  ).toHaveCount(3);
});

test('complete Whole-Key rows validate while another Share may omit MAT', async ({ page }) => {
  await create12WordShares(page);

  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  const share1Keys = await extractManifestKeys(page, share1.shareNumber);

  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await fillRecoveryMatColumn(page, 1, 0, {
    tags: share1.matTags[0],
    ...share1Keys[0]
  });
  await fillRecoveryMatColumn(page, 1, 1, {
    tags: share1.matTags[1],
    ...share1Keys[1]
  });
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#share-container-1 input[data-slot="mat-a"].valid')).toHaveCount(4);
  await expect(page.locator('#share-container-1 input[data-slot="mat-b"].valid')).toHaveCount(4);
  await expect(page.locator('#share-container-2 input[data-slot="mat-a"].valid')).toHaveCount(0);
  await recoverWallet(page);

  const recovered = await getRecoveredMnemonic(page);
  expect(recovered).toBe(MNEMONIC);
  const matSummary = page.locator('[data-validation-kind="mat"]');
  await expect(matSummary).toHaveAttribute('data-total', '16');
  await expect(matSummary).toHaveAttribute('data-blank', '8');
  await expect(matSummary).toHaveAttribute('data-pass', '8');
  await expect(matSummary).toHaveAttribute('data-fail', '0');
  await expect(matSummary.locator('.recovery-evidence-bar')).toHaveAttribute(
    'aria-label',
    'Manual Authentication (MAT): 8 pass, 0 fail, 8 not checked, 16 total.'
  );
  await expect(matSummary.locator('.recovery-evidence-counts'))
    .toContainText('Not checked: 8');
});

test('Split-Key MAT B validates without MAT A when only MAT B material is available', async ({ page }) => {
  await create12WordShares(page, { matMode: 'dual', custody: 'split' });

  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  const manifestA = await extractManifestKeys(page, share1.shareNumber, 'split-a');
  const manifestB = await extractManifestKeys(page, share1.shareNumber, 'split-b');

  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await fillRecoveryMatColumn(page, 1, 0, {
    tags: share1.matTags[0]
  });
  await fillRecoveryMatColumn(page, 1, 1, {
    tags: share1.matTags[1],
    ...manifestA[1]
  }, 'primary');
  await fillRecoveryMatColumn(page, 1, 1, manifestB[1], 'secondary');
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#share-container-1 input[data-slot="mat-a"].valid')).toHaveCount(0);
  await expect(page.locator('#share-container-1 input[data-slot="mat-a"].invalid')).toHaveCount(0);
  await expect(page.locator('#share-container-1 input[data-slot="mat-b"].valid')).toHaveCount(4);
  await recoverWallet(page);
  expect(await getRecoveredMnemonic(page)).toBe(MNEMONIC);
  const matSummary = page.locator('[data-validation-kind="mat"]');
  await expect(matSummary).toHaveAttribute('data-total', '16');
  await expect(matSummary).toHaveAttribute('data-blank', '12');
  await expect(matSummary).toHaveAttribute('data-pass', '4');
  await expect(matSummary).toHaveAttribute('data-fail', '0');
});

test('Dual Split-Key MAT validates both columns and the final result summary', async ({ page }) => {
  await create12WordShares(page, { matMode: 'dual', custody: 'split' });

  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  const manifestA = await extractManifestKeys(page, share1.shareNumber, 'split-a');
  const manifestB = await extractManifestKeys(page, share1.shareNumber, 'split-b');

  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const originalRecombine = api.recombineMatKeySets;
    globalThis.__recoveryCombinedKeys = [];
    api.recombineMatKeySets = (...args) => {
      const combined = originalRecombine(...args);
      globalThis.__recoveryCombinedKeys.push(combined);
      return combined;
    };
  });
  for (let columnIndex = 0; columnIndex < 2; columnIndex++) {
    await fillRecoveryMatColumn(page, 1, columnIndex, {
      tags: share1.matTags[columnIndex],
      ...manifestA[columnIndex]
    }, 'primary');
    await fillRecoveryMatColumn(page, 1, columnIndex, manifestB[columnIndex], 'secondary');
  }
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#share-container-1 input[data-slot="mat-a"].valid')).toHaveCount(4);
  await expect(page.locator('#share-container-1 input[data-slot="mat-b"].valid')).toHaveCount(4);
  await expect(
    page.locator('#share-container-1 input[data-part="primary"][data-key-kind="weight"].valid')
  ).toHaveCount(6);
  await expect(
    page.locator('#share-container-1 input[data-part="secondary"][data-key-kind="weight"].valid')
  ).toHaveCount(6);
  const cleanup = await page.evaluate(() => ({
    count: globalThis.__recoveryCombinedKeys.length,
    allCleared: globalThis.__recoveryCombinedKeys.every(keySet =>
      keySet.weights.length === 0 && keySet.rowPads.length === 0
    )
  }));
  expect(cleanup.count).toBeGreaterThan(0);
  expect(cleanup.allCleared).toBe(true);

  await recoverWallet(page);
  expect(await getRecoveredMnemonic(page)).toBe(MNEMONIC);

  const matSummary = page.locator('[data-validation-kind="mat"]');
  await expect(matSummary).toHaveAttribute('data-total', '16');
  await expect(matSummary).toHaveAttribute('data-blank', '8');
  await expect(matSummary).toHaveAttribute('data-pass', '8');
  await expect(matSummary).toHaveAttribute('data-fail', '0');
  await expect(matSummary.locator('.recovery-evidence-bar')).toHaveAttribute(
    'aria-label',
    'Manual Authentication (MAT): 8 pass, 0 fail, 8 not checked, 16 total.'
  );
  await expect(page.locator('[data-validation-kind="bip39"]')).toHaveAttribute(
    'data-status',
    'pass'
  );

  const finalCleanup = await page.evaluate(() => ({
    count: globalThis.__recoveryCombinedKeys.length,
    allCleared: globalThis.__recoveryCombinedKeys.every(keySet =>
      keySet.weights.length === 0 && keySet.rowPads.length === 0
    )
  }));
  expect(finalCleanup.count).toBeGreaterThan(cleanup.count);
  expect(finalCleanup.allCleared).toBe(true);
});

test('malformed non-empty MAT fields are red even before Share words are complete', async ({ page }) => {
  await openApp(page);
  await navigateToRecoverFromHome(page);
  await setupRecovery(page, 12, 2);

  await page.fill('#recover-share-1-row-0-mat-a', 'abcd');
  await page.locator('#share-container-1 .recovery-mat-keys summary').click();
  await page.fill('#recover-mat-key-1-0-primary-weight-0', '2053');
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#recover-share-1-row-0-mat-a')).toHaveClass(/invalid/);
  await expect(page.locator('#recover-mat-key-1-0-primary-weight-0')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1')).toHaveAttribute('data-mat-warning', 'true');
  await expect(page.locator('#share-container-1 .validation-indicator.invalid')).toHaveCount(2);
});

test('recovery is single-flight while validation and interpolation run', async ({ page }) => {
  await create12WordShares(page, { matMode: 'none' });
  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);

  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const originalRecover = api.recoverAndValidate;
    globalThis.__recoverAndValidateCalls = 0;
    api.recoverAndValidate = async (...args) => {
      globalThis.__recoverAndValidateCalls++;
      await new Promise(resolve => setTimeout(resolve, 500));
      return originalRecover(...args);
    };
  });

  await page.click('#btn-recover-wallet');
  await page.waitForFunction(() => globalThis.__recoverAndValidateCalls === 1);
  const button = page.locator('#btn-recover-wallet');
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => {
    document.getElementById('btn-recover-wallet')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#pageRecover2')).toBeVisible();
  expect(await page.evaluate(() => globalThis.__recoverAndValidateCalls)).toBe(1);
});

test('rank-3 Split-Key matches keep weights green and isolate a failing row', async ({ page }) => {
  await openApp(page);
  await navigateToRecoverFromHome(page);
  await setupRecovery(page, 12, 2);

  const canonicalRows = [
    1681, 1470, 1343,
    1, 2048, 850,
    0, 2052, 415,
    812, 1966, 509
  ];
  for (let row = 0; row < 4; row++) {
    for (let word = 0; word < 3; word++) {
      await page.fill(
        `#recover-share-1-row-${row}-word-${word}`,
        String(canonicalRows[row * 3 + word]).padStart(4, '0')
      );
    }
  }
  await fillRecoveryMatColumn(page, 1, 0, {
    tags: [172, 1834, 858, 746],
    weights: [1, 1, 1],
    rowPads: [1, 2, 3, 4]
  }, 'primary');
  await fillRecoveryMatColumn(page, 1, 0, {
    weights: [1, 3, 6],
    rowPads: [5, 6, 7, 8]
  }, 'secondary');
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#recover-share-1-row-0-mat-a')).toHaveClass(/valid/);
  await expect(page.locator('#recover-share-1-row-3-mat-a')).toHaveClass(/invalid/);
  await expect(page.locator('#recover-mat-key-1-0-primary-pad-3')).toHaveClass(/invalid/);
  await expect(page.locator('#recover-mat-key-1-0-secondary-pad-3')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 input[data-key-kind="weight"].valid')).toHaveCount(6);
  await expect(page.locator('#share-container-1 .validation-indicator.valid')).not.toHaveCount(0);
  await expect(page.locator('#share-container-1 .validation-indicator.invalid')).not.toHaveCount(0);

  for (let row = 0; row < 4; row++) {
    for (let word = 0; word < 3; word++) {
      await page.fill(
        `#recover-share-2-row-${row}-word-${word}`,
        String(canonicalRows[row * 3 + word]).padStart(4, '0')
      );
    }
  }
  await fillRecoveryMatColumn(page, 2, 0, {
    tags: [172, 1834, 858, 745],
    weights: [1, 1, 1],
    rowPads: [1, 2, 3, 4]
  }, 'primary');
  await fillRecoveryMatColumn(page, 2, 0, { weights: [1] }, 'secondary');
  await page.locator('#btn-recover-wallet').focus();
  await expect(page.locator('#share-container-2 input[data-slot="mat-a"].valid')).toHaveCount(0);
  await expect(page.locator('#share-container-2 input[data-slot="mat-a"].invalid')).toHaveCount(0);
  await expect(page.locator('#share-container-2 input[data-mat-key="true"].valid')).toHaveCount(0);
  await expect(page.locator('#share-container-2 input[data-mat-key="true"].invalid')).toHaveCount(0);

  await page.fill('#recover-mat-key-2-0-secondary-weight-0', '');
  await page.locator('#btn-recover-wallet').focus();
  await expect(page.locator('#share-container-2 input[data-slot="mat-a"].valid')).toHaveCount(0);
  await expect(page.locator('#share-container-2 input[data-slot="mat-a"].invalid')).toHaveCount(0);
  await expect(page.locator('#share-container-2 input[data-mat-key="true"].valid')).toHaveCount(0);
  await expect(page.locator('#share-container-2 input[data-mat-key="true"].invalid')).toHaveCount(0);
});

test('rank-deficient MAT mismatch marks weights, tag, and Row Pad red', async ({ page }) => {
  await openApp(page);
  await navigateToRecoverFromHome(page);
  await setupRecovery(page, 12, 2);

  for (let row = 0; row < 4; row++) {
    for (let word = 0; word < 3; word++) {
      await page.fill(`#recover-share-1-row-${row}-word-${word}`, '0001');
    }
  }
  await fillRecoveryMatColumn(page, 1, 0, {
    tags: [19, 21, 23, 26],
    weights: [2, 4, 7],
    rowPads: [6, 8, 10, 12]
  });
  await page.locator('#btn-recover-wallet').focus();

  await expect(page.locator('#recover-share-1-row-0-mat-a')).toHaveClass(/valid/);
  await expect(page.locator('#recover-share-1-row-3-mat-a')).toHaveClass(/invalid/);
  await expect(page.locator('#recover-mat-key-1-0-primary-pad-3')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 input[data-key-kind="weight"].invalid')).toHaveCount(3);
});

test('MAT mismatch is summarized by row and raw entries survive Back', async ({ page }) => {
  await create12WordShares(page, { matMode: 'single', custody: 'whole' });

  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  const share1Keys = await extractManifestKeys(page, share1.shareNumber);
  const wrongTags = [...share1.matTags[0]];
  wrongTags[0] = (Number(wrongTags[0]) + 1) % 2053;

  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await fillRecoveryMatColumn(page, 1, 0, {
    tags: wrongTags,
    ...share1Keys[0]
  });

  await page.click('#btn-recover-wallet');
  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('#custom-modal')).not.toBeVisible();
  const matSummary = page.locator('[data-validation-kind="mat"]');
  await expect(matSummary).toHaveAttribute('data-total', '16');
  await expect(matSummary).toHaveAttribute('data-blank', '12');
  await expect(matSummary).toHaveAttribute('data-pass', '3');
  await expect(matSummary).toHaveAttribute('data-fail', '1');
  await expect(matSummary.locator('.recovery-evidence-counts')).toContainText('Pass: 3');
  await expect(matSummary.locator('.recovery-evidence-counts')).toContainText('Problem: 1');
  expect(await getRecoveredMnemonic(page)).toBe(MNEMONIC);

  await page.click('#btn-back-to-recover1');
  await expect(page.locator('#recover-share-1-row-0-mat-a')).toHaveValue(
    String(wrongTags[0]).padStart(4, '0')
  );
  await expect(page.locator('#recover-mat-key-1-0-primary-weight-0')).toHaveValue(
    String(share1Keys[0].weights[0]).padStart(4, '0')
  );
  await expect(page.locator('#recover-share-1-row-0-mat-a')).toHaveClass(/invalid/);
});
