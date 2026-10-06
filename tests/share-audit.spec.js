import { test, expect } from '@playwright/test';
import {
  openApp,
  navigateToAuditFromHome,
  navigateToCreateShares,
  selectCreateWordCount,
  selectScheme,
  selectMatMode,
  selectMatCustody,
  fillMnemonic,
  generateShares,
  extractShareData,
  createSyntheticShare,
  modifyShareValue,
  getDeterministicMnemonic
} from './test-helpers.js';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function createArtifacts(
  page,
  {
    matMode = 'none',
    custody = 'whole',
    wordCount = 12,
    scheme = '2of3'
  } = {}
) {
  await openApp(page);
  await navigateToCreateShares(page);
  await selectCreateWordCount(page, wordCount);
  await fillMnemonic(
    page,
    wordCount === 12 ? MNEMONIC : getDeterministicMnemonic(wordCount)
  );
  await selectScheme(page, scheme);
  await selectMatMode(page, matMode);
  if (matMode !== 'none') await selectMatCustody(page, custody);
  await generateShares(page);

  const share = await extractShareData(page, 0);
  const shareCard = page.locator('#shares-output > .share-card').first();
  const manifest = page.locator('#shares-output > .manifest-card').first();
  const audit = manifest.locator(
    `.manifest-digital-audit[data-share-number="${share.shareNumber}"]`
  );
  const artifacts = {
    fullPayload: await shareCard.locator(
      '[data-digital-field="full-share-payload"]'
    ).textContent(),
    compactPayload: await shareCard.locator(
      '[data-digital-field="compact-share-payload"]'
    ).textContent(),
    fullHash: await audit.locator(
      '[data-digital-field="full-audit-hash"]'
    ).textContent(),
    fullSa: await audit.locator(
      '[data-digital-field="full-audit-payload"]'
    ).textContent(),
    compactSa: await audit.locator(
      '[data-digital-field="compact-audit-payload"]'
    ).textContent(),
    fullSb: await manifest.locator(
      '[data-digital-field="manifest-full-header-payload"]'
    ).textContent()
  };
  return { share, artifacts };
}

async function leaveCreateForAudit(page) {
  await page.click('#btn-start-over-create');
  const landingVisible = page.waitForSelector('#pageLanding', {
    state: 'visible'
  });
  await page.click('#modal-confirm');
  await landingVisible;
  const disclaimerLabel = page.locator('label[for="disclaimer-checkbox"]');
  await expect(disclaimerLabel).toBeVisible();
  await disclaimerLabel.click();
  await expect(page.locator('#btn-continue-to-home')).toBeEnabled();
  await page.click('#btn-continue-to-home');
  await expect(page.locator('#pageHome')).toBeVisible();
  await navigateToAuditFromHome(page);
}

async function fillManualAuditShare(page, share) {
  await page.fill('#recover-x-1', share.shareNumber);
  const rows = share.words.length / 3;
  for (let row = 0; row < rows; row++) {
    for (let word = 0; word < 3; word++) {
      await page.fill(
        `#recover-share-1-row-${row}-word-${word}`,
        share.words[row * 3 + word]
      );
    }
    await page.fill(
      `#recover-share-1-row-${row}-checksum`,
      share.checksums[row]
    );
  }
  for (let column = 0; column < 3; column++) {
    await page.fill(
      `#recover-share-1-column-${column}`,
      share.columnChecksums[column]
    );
  }
  await page.fill('#recover-share-1-gic', share.globalIntegrityCheck);
  await page.locator('#recover-share-1-gic').blur();
}

async function manifestKeys(page, shareNumber, kind = 'whole') {
  return page.locator(
    `.manifest-card[data-manifest-kind="${kind}"] ` +
    `.manifest-share-section[data-share-number="${shareNumber}"] ` +
    '> .manifest-key-grid'
  ).evaluateAll(grids => grids.map(grid => {
    const values = Array.from(grid.querySelectorAll('code'))
      .map(code => Number(code.textContent));
    return { weights: values.slice(0, 3), rowPads: values.slice(3) };
  }));
}

async function fillMat(page, share, keys, column, part = 'primary') {
  const details = page.locator('#share-container-1 .recovery-mat-keys');
  if (!(await details.evaluate(element => element.open))) {
    await details.locator('summary').click();
  }
  const slot = column === 0 ? 'mat-a' : 'mat-b';
  for (let row = 0; row < share.matTags[column].length; row++) {
    await page.fill(
      `#recover-share-1-row-${row}-${slot}`,
      share.matTags[column][row]
    );
    await page.fill(
      `#recover-mat-key-1-${column}-${part}-pad-${row}`,
      String(keys.rowPads[row]).padStart(4, '0')
    );
  }
  for (let weight = 0; weight < 3; weight++) {
    await page.fill(
      `#recover-mat-key-1-${column}-${part}-weight-${weight}`,
      String(keys.weights[weight]).padStart(4, '0')
    );
  }
  await page.locator('#recover-share-1-gic').focus();
}

test('Audit reuses one Recovery-style editor and validates a manual-only Share', async ({ page }) => {
  await openApp(page);
  const columns = page.locator('#pageHome .home-grid > .home-col');
  await expect(columns).toHaveCount(3);
  await expect(columns.nth(1).locator('#btn-go-to-audit')).toHaveText(
    /2\. Audit Share/
  );
  await navigateToAuditFromHome(page);
  await page.click('#audit-btn-12-words');

  await expect(page.locator('#recover-shares-container > .share-input-container'))
    .toHaveCount(1);
  await expect(page.locator('#btn-recover-wallet')).not.toBeVisible();
  await expect(page.locator('#pageAudit canvas, #pageAudit video'))
    .toHaveCount(0);
  const share = createSyntheticShare(1, null, new Array(12).fill(1));
  await fillManualAuditShare(page, share);

  const checks = page.locator('[data-validation-kind="audit-checksums"]');
  await expect(checks).toHaveAttribute('data-pass', '8');
  await expect(page.locator('[data-meter-kind="audit"]'))
    .toHaveAttribute('data-state', 'consistent');

  await page.fill(
    '#recover-share-1-row-0-checksum',
    modifyShareValue(share.checksums[0])
  );
  await page.locator('#recover-share-1-row-0-checksum').blur();
  await expect(checks).toHaveAttribute('data-fail', '1');
});

test('Audit and Recovery use the same editor with isolated state', async ({ page }) => {
  await openApp(page);
  await navigateToAuditFromHome(page);
  await page.fill('#recover-x-1', '5');
  await page.click('#pageAudit .btn-back-home');
  await page.click('#btn-go-to-recover');
  await expect(page.locator('#recover-x-1')).toHaveValue('');
  await expect(page.locator('#recover-shares-container > .share-input-container'))
    .toHaveCount(2);
  await page.click('#pageRecover1 .btn-back-home');
  await navigateToAuditFromHome(page);
  await expect(page.locator('#recover-x-1')).toHaveValue('5');
  await expect(page.locator('#recover-shares-container > .share-input-container'))
    .toHaveCount(1);
});

test('Full and Compact payloads overwrite fields while invalid import is atomic', async ({ page }) => {
  const { share, artifacts } = await createArtifacts(page);
  await leaveCreateForAudit(page);
  await page.fill('#recover-x-1', '4');
  await page.fill('#recover-payload-1', artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-x-1')).toHaveValue(share.shareNumber);
  await expect(page.locator('[data-validation-kind="audit-payload-agreement"]'))
    .toHaveAttribute('data-status', 'pass');

  const committedWord = await page.locator(
    '#recover-share-1-row-0-word-0'
  ).inputValue();
  const corrupt =
    artifacts.fullPayload.slice(0, -1) +
    (artifacts.fullPayload.endsWith('0') ? '1' : '0');
  await page.fill('#recover-payload-1', corrupt);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/invalid/);
  await expect(page.locator('#recover-share-1-row-0-word-0'))
    .toHaveValue(committedWord);

  await page.fill('#recover-payload-1', artifacts.compactPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#share-container-1 .payload-derived-label'))
    .toHaveCount(8);
  await page.fill(
    '#recover-share-1-row-0-word-0',
    modifyShareValue(share.words[0])
  );
  await page.locator('#recover-share-1-row-0-word-0').blur();
  await expect(page.locator('[data-validation-kind="audit-payload-agreement"]'))
    .toHaveAttribute('data-status', 'mixed');
});

test('Manifest evidence works before or after the Share payload', async ({ page }) => {
  const { artifacts } = await createArtifacts(page);
  await leaveCreateForAudit(page);
  await page.fill('#recover-audit-evidence-1', artifacts.fullHash);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('Waiting for a Share payload');
  await page.fill('#recover-manifest-header-payload', artifacts.fullSb);
  await page.locator('#recover-manifest-header-payload').blur();
  await page.fill('#recover-payload-1', artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-manifest-header-payload')).toHaveClass(/valid/);

  await page.fill('#recover-audit-evidence-1', artifacts.fullSa);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/valid/);

  await page.fill('#recover-audit-evidence-1', artifacts.compactSa);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/invalid/);
  await expect(page.locator('[data-meter-kind="audit"]'))
    .toHaveAttribute('data-state', 'problems');

  await page.fill('#recover-payload-1', artifacts.compactPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/valid/);

  const unsupportedSa =
    `${artifacts.compactSa.slice(0, 4)}02${artifacts.compactSa.slice(6)}`;
  await page.fill('#recover-audit-evidence-1', unsupportedSa);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('Unsupported Share Audit payload version');

  const batchNibble = artifacts.fullSb[8] === '0' ? '1' : '0';
  const conflictingSb =
    `${artifacts.fullSb.slice(0, 8)}${batchNibble}${artifacts.fullSb.slice(9)}`;
  await page.fill('#recover-manifest-header-payload', conflictingSb);
  await page.locator('#recover-manifest-header-payload').blur();
  await expect(page.locator('#recover-manifest-header-payload'))
    .toHaveClass(/invalid/);
});

test('Whole-Key MAT remains optional and validates independently', async ({ page }) => {
  const whole = await createArtifacts(page, { matMode: 'dual' });
  const wholeKeys = await manifestKeys(page, whole.share.shareNumber);
  await leaveCreateForAudit(page);
  await page.click('#audit-btn-12-words');
  await fillManualAuditShare(page, whole.share);
  await expect(page.locator('[data-validation-kind="audit-mat"]'))
    .toHaveAttribute('data-status', 'blank');
  await fillMat(page, whole.share, wholeKeys[0], 0);
  await expect(page.locator('[data-validation-kind="audit-mat"]'))
    .toHaveAttribute('data-pass', '4');
});

test('Split-Key MAT waits for both halves before validating', async ({ page }) => {
  const split = await createArtifacts(page, {
    matMode: 'dual',
    custody: 'split'
  });
  const keysA = await manifestKeys(
    page,
    split.share.shareNumber,
    'split-a'
  );
  const keysB = await manifestKeys(
    page,
    split.share.shareNumber,
    'split-b'
  );
  await leaveCreateForAudit(page);
  await page.click('#audit-btn-12-words');
  await fillManualAuditShare(page, split.share);
  await fillMat(page, split.share, keysA[0], 0, 'primary');
  await page.fill('#recover-mat-key-1-0-secondary-weight-0', '0001');
  await page.locator('#recover-share-1-gic').focus();
  await expect(page.locator('[data-validation-kind="audit-mat"]'))
    .toHaveAttribute('data-pass', '0');

  await fillMat(page, split.share, keysB[0], 0, 'secondary');
  await expect(page.locator('[data-validation-kind="audit-mat"]'))
    .toHaveAttribute('data-pass', '4');
  await expect(page.locator('[data-validation-kind="audit-mat"]'))
    .toHaveAttribute('data-fail', '0');
});

test('all six evidence families pass together on a complete Audit', async ({ page }) => {
  const complete = await createArtifacts(page, { matMode: 'dual' });
  const keys = await manifestKeys(page, complete.share.shareNumber);
  await leaveCreateForAudit(page);

  await page.fill(
    '#recover-manifest-header-payload',
    complete.artifacts.fullSb
  );
  await page.locator('#recover-manifest-header-payload').blur();
  await page.fill(
    '#recover-audit-evidence-1',
    complete.artifacts.fullSa
  );
  await page.locator('#recover-audit-evidence-1').blur();
  await page.fill('#recover-payload-1', complete.artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await fillMat(page, complete.share, keys[0], 0);
  await fillMat(page, complete.share, keys[1], 1);

  for (const kind of [
    'audit-payload-integrity',
    'audit-payload-agreement',
    'audit-checksums',
    'audit-manifest',
    'audit-manifest-header',
    'audit-mat'
  ]) {
    await expect(page.locator(`[data-validation-kind="${kind}"]`))
      .toHaveAttribute('data-status', 'pass');
  }
  const meter = page.locator('[data-meter-kind="audit"]');
  await expect(meter).toHaveAttribute('data-state', 'consistent');
  await expect(meter.locator('.recovery-meter-state'))
    .toHaveText('NO DISCREPANCIES DETECTED');
  await expect(meter).toHaveAttribute('data-coverage', '6');
  await expect(meter).toHaveAttribute('data-coverage-total', '6');
});

test('payload overwrites all arithmetic fields but preserves MAT and Manifest evidence', async ({ page }) => {
  const complete = await createArtifacts(page, { matMode: 'dual' });
  const keys = await manifestKeys(page, complete.share.shareNumber);
  await leaveCreateForAudit(page);
  await page.click('#audit-btn-12-words');
  await fillManualAuditShare(page, complete.share);
  await fillMat(page, complete.share, keys[0], 0);
  await page.fill(
    '#recover-manifest-header-payload',
    complete.artifacts.fullSb
  );
  await page.fill(
    '#recover-audit-evidence-1',
    complete.artifacts.fullHash
  );
  const savedTag = await page.locator(
    '#recover-share-1-row-0-mat-a'
  ).inputValue();
  const savedWeight = await page.locator(
    '#recover-mat-key-1-0-primary-weight-0'
  ).inputValue();

  await page.fill('#recover-x-1', '4');
  await page.fill('#recover-share-1-row-0-word-0', '0001');
  await page.fill('#recover-share-1-row-0-checksum', '0002');
  await page.fill('#recover-share-1-column-0', '0003');
  await page.fill('#recover-share-1-gic', '0004');
  await page.fill('#recover-payload-1', complete.artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);

  await expect(page.locator('#recover-x-1'))
    .toHaveValue(complete.share.shareNumber);
  await expect(page.locator('#recover-share-1-row-0-word-0'))
    .toHaveValue(new RegExp(`^${complete.share.words[0].padStart(4, '0')}-`));
  await expect(page.locator('#recover-share-1-row-0-checksum'))
    .toHaveValue(new RegExp(`^${complete.share.checksums[0].padStart(4, '0')}-`));
  await expect(page.locator('#recover-share-1-column-0'))
    .toHaveValue(new RegExp(`^${complete.share.columnChecksums[0].padStart(4, '0')}-`));
  await expect(page.locator('#recover-share-1-gic'))
    .toHaveValue(new RegExp(`^${complete.share.globalIntegrityCheck.padStart(4, '0')}-`));
  await expect(page.locator('#recover-share-1-row-0-mat-a'))
    .toHaveValue(savedTag);
  await expect(page.locator('#recover-mat-key-1-0-primary-weight-0'))
    .toHaveValue(savedWeight);
  await expect(page.locator('#recover-manifest-header-payload'))
    .toHaveValue(complete.artifacts.fullSb);
  await expect(page.locator('#recover-audit-evidence-1'))
    .toHaveValue(complete.artifacts.fullHash);
});

test('threshold and word-count changes after import invalidate payload agreement', async ({ page }) => {
  const { artifacts } = await createArtifacts(page);
  await leaveCreateForAudit(page);
  await page.fill('#recover-payload-1', artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  const agreement = page.locator(
    '[data-validation-kind="audit-payload-agreement"]'
  );
  await expect(agreement).toHaveAttribute('data-status', 'pass');

  await page.click('label[for="audit-k-3"]');
  await expect(agreement).toHaveAttribute('data-status', 'mixed');
  await page.click('label[for="audit-k-2"]');
  await expect(agreement).toHaveAttribute('data-status', 'pass');

  await page.click('#audit-btn-24-words');
  await expect(agreement).toHaveAttribute('data-status', 'mixed');
  await page.click('#audit-btn-12-words');
  await expect(agreement).toHaveAttribute('data-status', 'pass');
});

test('wrong raw Hash and same-metadata SA commitment fail the Audit assessment', async ({ page }) => {
  const { artifacts } = await createArtifacts(page);
  await leaveCreateForAudit(page);
  await page.fill('#recover-payload-1', artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);

  const wrongHash =
    artifacts.fullHash.slice(0, -1) +
    (artifacts.fullHash.endsWith('0') ? '1' : '0');
  await page.fill('#recover-audit-evidence-1', wrongHash);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('[data-validation-kind="audit-manifest"]'))
    .toHaveAttribute('data-status', 'fail');
  await expect(page.locator('[data-meter-kind="audit"]'))
    .toHaveAttribute('data-state', 'problems');

  const wrongSa =
    artifacts.fullSa.slice(0, -1) +
    (artifacts.fullSa.endsWith('0') ? '1' : '0');
  await page.fill('#recover-audit-evidence-1', wrongSa);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('SA Audit Hash does not match');
  await expect(page.locator('[data-validation-kind="audit-manifest"]'))
    .toHaveAttribute('data-status', 'fail');
});

test('wrong and malformed MAT evidence fail without affecting other families', async ({ page }) => {
  const complete = await createArtifacts(page, { matMode: 'dual' });
  const keys = await manifestKeys(page, complete.share.shareNumber);
  await leaveCreateForAudit(page);
  await page.click('#audit-btn-12-words');
  await fillManualAuditShare(page, complete.share);
  await fillMat(page, complete.share, keys[0], 0);
  await fillMat(page, complete.share, keys[1], 1);
  const mat = page.locator('[data-validation-kind="audit-mat"]');
  await expect(mat).toHaveAttribute('data-pass', '8');

  await page.fill(
    '#recover-share-1-row-0-mat-a',
    modifyShareValue(complete.share.matTags[0][0])
  );
  await page.locator('#recover-share-1-row-0-mat-a').blur();
  await expect(mat).toHaveAttribute('data-fail', '1');
  await expect(page.locator('[data-validation-kind="audit-checksums"]'))
    .toHaveAttribute('data-status', 'pass');

  await page.fill(
    '#recover-share-1-row-0-mat-a',
    complete.share.matTags[0][0]
  );
  await page.fill(
    '#recover-mat-key-1-1-primary-pad-0',
    modifyShareValue(keys[1].rowPads[0])
  );
  await page.locator('#recover-mat-key-1-1-primary-pad-0').blur();
  await expect(mat).toHaveAttribute('data-fail', '1');

  await page.fill('#recover-mat-key-1-1-primary-pad-0', '2053');
  await page.locator('#recover-mat-key-1-1-primary-pad-0').blur();
  await expect(page.locator('#recover-mat-key-1-1-primary-pad-0'))
    .toHaveClass(/invalid/);
  await expect(mat).toHaveAttribute('data-fail', '1');
});

for (const auditCase of [
  {
    wordCount: 24,
    scheme: '3of5',
    payload: 'fullPayload',
    expectedThreshold: 3,
    expectedRows: 8,
    expectedDerived: 0
  },
  {
    wordCount: 15,
    scheme: '2of3',
    payload: 'compactPayload',
    expectedThreshold: 2,
    expectedRows: 5,
    expectedDerived: 9
  }
]) {
  test(`${auditCase.wordCount}-word ${auditCase.scheme} payload configures Audit correctly`, async ({ page }) => {
    const { artifacts } = await createArtifacts(page, auditCase);
    await leaveCreateForAudit(page);
    await page.fill('#recover-payload-1', artifacts[auditCase.payload]);
    await page.locator('#recover-payload-1').blur();
    await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
    await expect(page.locator(`#audit-k-${auditCase.expectedThreshold}`))
      .toBeChecked();
    await expect(page.locator(`#audit-btn-${auditCase.wordCount}-words`))
      .toHaveClass(/btn-primary/);
    await expect(page.locator('#share-container-1 input[data-slot="checksum"]'))
      .toHaveCount(auditCase.expectedRows);
    await expect(page.locator('#share-container-1 .payload-derived-label'))
      .toHaveCount(auditCase.expectedDerived);
    await expect(page.locator('[data-validation-kind="audit-payload-agreement"]'))
      .toHaveAttribute('data-status', 'pass');
  });
}

test('Audit interactions never invoke recovery or interpolation', async ({ page }) => {
  const { artifacts } = await createArtifacts(page);
  await leaveCreateForAudit(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const original = api.recoverAndValidate;
    globalThis.__auditRecoveryCalls = 0;
    api.recoverAndValidate = (...args) => {
      globalThis.__auditRecoveryCalls++;
      return original(...args);
    };
  });

  await page.fill('#recover-payload-1', artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await page.fill('#recover-audit-evidence-1', artifacts.fullSa);
  await page.locator('#recover-audit-evidence-1').blur();
  await page.fill('#recover-manifest-header-payload', artifacts.fullSb);
  await page.locator('#recover-manifest-header-payload').blur();
  await expect(page.locator('[data-meter-kind="audit"]'))
    .toHaveAttribute('data-state', 'consistent');
  expect(await page.evaluate(() => globalThis.__auditRecoveryCalls)).toBe(0);
  await expect(page.locator('#pageRecover2')).not.toBeVisible();
});

test('Clear Audit wipes the isolated Audit state and stays on the page', async ({ page }) => {
  const { artifacts } = await createArtifacts(page);
  await leaveCreateForAudit(page);
  await page.fill('#recover-manifest-header-payload', artifacts.fullSb);
  await page.fill('#recover-audit-evidence-1', artifacts.fullHash);
  await page.fill('#recover-payload-1', artifacts.fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await page.click('#btn-clear-audit');
  await page.click('#modal-confirm');

  await expect(page.locator('#pageAudit')).toBeVisible();
  await expect(page.locator('#recover-payload-1')).toHaveValue('');
  await expect(page.locator('#recover-audit-evidence-1')).toHaveValue('');
  await expect(page.locator('#recover-manifest-header-payload')).toHaveValue('');
  await expect(page.locator('#recover-x-1')).toHaveValue('');
  await expect(page.locator('[data-meter-kind="audit"]'))
    .toHaveAttribute('data-state', 'not-assessed');
});
