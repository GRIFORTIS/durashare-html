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
  navigateToRecover,
  extractShareData,
  setupRecovery,
  fillRecoveryShare
} from './test-helpers.js';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function prepareSharing(page) {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, MNEMONIC);
  await selectScheme(page, '2of3');
}

async function expectCryptoFailure(page) {
  await page.click('#btn-generate-shares');
  await expect(page.locator('#custom-modal')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('Cryptographic Runtime Failed');
  await expect(page.locator('#modal-text')).toContainText('Cryptographic runtime failed');
  await expect(page.locator('#pageCreate1')).toBeVisible();
  await expect(page.locator('#pageCreate2')).toBeHidden();
}

test('Sharing renders both profile payloads and complete Manifest audit data on screen only', async ({ page }) => {
  await prepareSharing(page);
  await page.selectOption('#wallet-profile', '2');
  await page.click('label[for="passphrase-required"]');
  await page.fill('#passphrase-hint', 'Stored in separate instructions');
  await page.fill('#recovery-verification-address', 'bc1qar0s...zzwf5mdq');
  await generateShares(page);

  const shares = page.locator('#shares-output > .share-card');
  await expect(shares).toHaveCount(3);
  const firstShare = shares.first();
  await expect(firstShare.locator('.share-digital-artifacts')).toHaveCount(1);
  await expect(firstShare.locator('.digital-profile')).toHaveCount(2);
  await expect(firstShare).toContainText('BIP84 — Native SegWit');
  await expect(firstShare).toContainText('Stored in separate instructions');
  await expect(firstShare).toContainText('bc1qar0s...zzwf5mdq');

  const fullBatch = await firstShare.locator(
    '[data-digital-field="full-session-batch-id"]'
  ).textContent();
  const compactBatch = await firstShare.locator(
    '[data-digital-field="compact-session-batch-id"]'
  ).textContent();
  expect(fullBatch).toMatch(/^[0-9A-F]{16}$/);
  expect(compactBatch).toMatch(/^[0-9A-F]{8}$/);
  expect(fullBatch.startsWith(compactBatch)).toBe(true);

  await expect(firstShare.locator('[data-digital-field="full-rbt"]'))
    .toHaveText(/^[0-9A-F]{24}$/);
  await expect(firstShare.locator('[data-digital-field="compact-rbt"]'))
    .toHaveText(/^[0-9A-F]{12}$/);
  await expect(firstShare.locator('[data-digital-field="full-transport-hash"]'))
    .toHaveText(/^[0-9A-F]{32}$/);
  await expect(firstShare.locator('[data-digital-field="full-share-payload"]'))
    .toHaveText(/^5346[0-9A-F]{146}$/);
  await expect(firstShare.locator('[data-digital-field="compact-share-payload"]'))
    .toHaveText(/^5343[0-9A-F]{66}$/);

  for (let index = 0; index < 3; index++) {
    await expect(shares.nth(index).locator(
      '[data-digital-field="full-session-batch-id"]'
    )).toHaveText(fullBatch);
    await expect(shares.nth(index).locator(
      '[data-digital-field="compact-session-batch-id"]'
    )).toHaveText(compactBatch);
  }

  const manifest = page.locator('#shares-output > .manifest-card');
  await expect(manifest).toHaveCount(1);
  await expect(manifest.locator('.manifest-digital-headers')).toHaveCount(1);
  await expect(manifest.locator('[data-digital-field="manifest-full-header-payload"]'))
    .toHaveText(/^5342[0-9A-F]{44}$/);
  await expect(manifest.locator('[data-digital-field="manifest-compact-header-payload"]'))
    .toHaveText(/^5342[0-9A-F]{24}$/);
  await expect(manifest.locator('.manifest-digital-audit')).toHaveCount(3);
  await expect(manifest.locator('[data-digital-field="full-audit-hash"]'))
    .toHaveCount(3);
  await expect(manifest.locator('[data-digital-field="compact-audit-hash"]'))
    .toHaveCount(3);
  await expect(manifest.locator('[data-digital-field="full-audit-payload"]').first())
    .toHaveText(/^5341[0-9A-F]{76}$/);
  await expect(manifest.locator('[data-digital-field="compact-audit-payload"]').first())
    .toHaveText(/^5341[0-9A-F]{40}$/);

  await expect(page.locator('#print-output .digital-artifacts')).toHaveCount(0);
  await expect(page.locator('#pageRecover1 [data-digital-field]')).toHaveCount(0);
});

test('Split-Key Manifests are complete digital counterparts', async ({ page }) => {
  await prepareSharing(page);
  await selectMatMode(page, 'single');
  await selectMatCustody(page, 'split');
  await generateShares(page);

  const manifests = page.locator('#shares-output > .manifest-card');
  await expect(manifests).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await expect(manifests.nth(index).locator('.manifest-digital-headers')).toHaveCount(1);
    await expect(manifests.nth(index).locator('.manifest-digital-audit')).toHaveCount(3);
  }
  const headerA = await manifests.nth(0).locator(
    '[data-digital-field="manifest-full-header-payload"]'
  ).textContent();
  await expect(manifests.nth(1).locator(
    '[data-digital-field="manifest-full-header-payload"]'
  )).toHaveText(headerA);
});

test('RVA accepts arbitrary free text without interpretation', async ({ page }) => {
  await prepareSharing(page);
  const freeText =
    'Any address, derivation witness, family note, or future format the user chooses.';
  await page.fill(
    '#recovery-verification-address',
    freeText
  );
  await generateShares(page);
  await expect(page.locator('#shares-output > .share-card').first())
    .toContainText(freeText);
  await expect(page.locator('#shares-output > .manifest-card').first())
    .toContainText(freeText);
});

test('missing WebCrypto hard-stops Sharing without partial artifacts', async ({ page }) => {
  await prepareSharing(page);
  await page.evaluate(() => {
    globalThis.DuraShare.configureEnvironment({ subtleSource: null });
  });
  await expectCryptoFailure(page);
});

test('WebCrypto known-answer mismatch hard-stops Sharing', async ({ page }) => {
  await prepareSharing(page);
  await page.evaluate(() => {
    globalThis.DuraShare.configureEnvironment({
      subtleSource: {
        async digest() {
          return new Uint8Array(32).buffer;
        },
        async importKey() {
          return {};
        },
        async deriveBits() {
          return new Uint8Array(32).buffer;
        }
      }
    });
  });
  await expectCryptoFailure(page);
  await expect(page.locator('#modal-text')).toContainText(
    'SHA-256 known-answer test did not match'
  );
});

test('PBKDF2 known-answer mismatch hard-stops Sharing', async ({ page }) => {
  await prepareSharing(page);
  await page.evaluate(() => {
    const shaKat = globalThis.DuraShare.hexToBytes(
      'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD'
    );
    globalThis.DuraShare.configureEnvironment({
      subtleSource: {
        async digest() {
          return new Uint8Array(shaKat).buffer;
        },
        async importKey() {
          return {};
        },
        async deriveBits() {
          return new Uint8Array(32).buffer;
        }
      }
    });
  });
  await expectCryptoFailure(page);
  await expect(page.locator('#modal-text')).toContainText(
    'PBKDF2-HMAC-SHA512 known-answer test did not match'
  );
});

test('rendered digital bytes are cleared from owned artifact buffers after display', async ({ page }) => {
  await prepareSharing(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const originalCreate = api.createSharingArtifacts;
    globalThis.__digitalCleanupSnapshot = null;
    api.createSharingArtifacts = async (...args) => {
      const artifacts = await originalCreate(...args);
      const buffers = [
        artifacts.session.full.batchId,
        artifacts.session.full.rbt,
        artifacts.session.full.manifestHeaderPayload,
        artifacts.session.compact.batchId,
        artifacts.session.compact.rbt,
        artifacts.session.compact.manifestHeaderPayload
      ];
      artifacts.shares.forEach((share) => {
        buffers.push(
          share.digital.full.payload,
          share.digital.full.transportHash,
          share.digital.full.auditHash,
          share.digital.full.auditPayload,
          share.digital.compact.payload,
          share.digital.compact.auditHash,
          share.digital.compact.auditPayload
        );
      });
      globalThis.__digitalCleanupSnapshot = { artifacts, buffers };
      return artifacts;
    };
  });

  await generateShares(page);
  const cleanup = await page.evaluate(() => {
    const snapshot = globalThis.__digitalCleanupSnapshot;
    return {
      shareCount: snapshot.artifacts.shares.length,
      manifestCount: snapshot.artifacts.manifests.length,
      sessionCleared: snapshot.artifacts.session === null,
      allBuffersZeroed: snapshot.buffers.every(buffer =>
        Array.from(buffer).every(value => value === 0)
      )
    };
  });
  expect(cleanup).toEqual({
    shareCount: 0,
    manifestCount: 0,
    sessionCleared: true,
    allBuffersZeroed: true
  });
});

test('Full and Compact payloads populate Recovery atomically and produce RBT PASS', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const fullPayload = await page.locator(
    '#shares-output > .share-card'
  ).nth(0).locator('[data-digital-field="full-share-payload"]').textContent();
  const compactPayload = await page.locator(
    '#shares-output > .share-card'
  ).nth(1).locator('[data-digital-field="compact-share-payload"]').textContent();

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-btn-12-words')).toHaveClass(/btn-primary/);
  await expect(page.locator('#recover-x-1')).toHaveValue('1');
  await expect(page.locator('#share-container-1 .payload-derived-label')).toHaveCount(0);

  await page.fill('#recover-payload-2', compactPayload);
  await page.locator('#recover-payload-2').blur();
  await expect(page.locator('#recover-payload-2')).toHaveClass(/valid/);
  await expect(page.locator('#recover-x-2')).toHaveValue('2');
  await expect(page.locator('#share-container-2 .payload-derived-label')).toHaveCount(8);
  await expect(page.locator('#share-container-2 .recovery-share-payload-status'))
    .toContainText('were derived');

  await page.click('#btn-recover-wallet');
  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('[data-meter-kind="confidence"]'))
    .toHaveAttribute('data-state', 'confirmed');
  const rbt = page.locator('[data-validation-kind="rbt"]');
  await expect(rbt).toHaveAttribute('data-status', 'pass');
  await expect(rbt.locator('.recovery-evidence-status')).toHaveText('MATCH');
  await expect(rbt).toContainText('Full (96-bit) and Compact (48-bit)');
  await expect(page.locator('[data-meter-kind="kit-health"]'))
    .toHaveAttribute('data-state', 'consistent');
  const payloadIntegrity = page.locator(
    '[data-validation-kind="payload-integrity"]'
  );
  await expect(payloadIntegrity).toHaveAttribute('data-pass', '2');
  await expect(payloadIntegrity).toHaveAttribute('data-fail', '0');
});

test('first payload auto-configures a 3-share Recovery form when empty', async ({ page }) => {
  await prepareSharing(page);
  await selectScheme(page, '3of5');
  await generateShares(page);
  const payload = await page.locator(
    '#shares-output > .share-card'
  ).first().locator('[data-digital-field="full-share-payload"]').textContent();

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', payload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-k-3')).toBeChecked();
  await expect(page.locator('#recover-shares-container > .share-input-container'))
    .toHaveCount(3);
  await expect(page.locator('#recover-x-1')).toHaveValue('1');
});

test('session conflict rejects a later payload without overwriting its Share fields', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const fullPayload = await page.locator(
    '#shares-output > .share-card'
  ).nth(0).locator('[data-digital-field="full-share-payload"]').textContent();
  const compactPayload = await page.locator(
    '#shares-output > .share-card'
  ).nth(1).locator('[data-digital-field="compact-share-payload"]').textContent();
  const replacement = compactPayload.slice(14, 16) === '00' ? '01' : '00';
  const unrelatedCompact =
    compactPayload.slice(0, 14) + replacement + compactPayload.slice(16);

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-x-1')).toHaveValue('1');

  await page.fill('#recover-payload-2', unrelatedCompact);
  await page.locator('#recover-payload-2').blur();
  await expect(page.locator('#recover-payload-2')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-2 .recovery-share-payload-status'))
    .toContainText('same session family');
  await expect(page.locator('#recover-x-2')).toHaveValue('');
});

test('invalid Full Transport Hash leaves manual Recovery fields untouched', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const payload = await page.locator(
    '#shares-output > .share-card'
  ).first().locator('[data-digital-field="full-share-payload"]').textContent();
  const corruptPayload =
    payload.slice(0, -1) + (payload.endsWith('0') ? '1' : '0');

  await navigateToRecover(page);
  await page.fill('#recover-x-1', '4');
  await page.fill('#recover-payload-1', corruptPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 .recovery-share-payload-status'))
    .toContainText('Transport Hash mismatch');
  await expect(page.locator('#recover-x-1')).toHaveValue('4');
});

test('invalid Transport Hash immediately invalidates matching Manifest Audit evidence', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const payload = await page.locator('#shares-output > .share-card').first()
    .locator('[data-digital-field="full-share-payload"]').textContent();
  const auditHash = await page.locator('#shares-output > .manifest-card')
    .locator('.manifest-digital-audit[data-share-number="1"]')
    .locator('[data-digital-field="full-audit-hash"]').textContent();
  const corruptPayload =
    payload.slice(0, -1) + (payload.endsWith('0') ? '1' : '0');

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', payload);
  await page.locator('#recover-payload-1').blur();
  await page.fill('#recover-audit-evidence-1', auditHash);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/valid/);
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('matches the Share payload');

  await page.fill('#recover-payload-1', corruptPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 .recovery-share-payload-status'))
    .toContainText('Transport Hash mismatch');
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('invalid Share payload');

  await page.locator('#recover-audit-evidence-1').focus();
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('invalid Share payload');
});

test('invalid Share payload damages kit health but manual recovery continues', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const share1 = await extractShareData(page, 0);
  const share2 = await extractShareData(page, 1);
  const payload = await page.locator(
    '#shares-output > .share-card'
  ).first().locator('[data-digital-field="full-share-payload"]').textContent();
  const corruptPayload =
    payload.slice(0, -1) + (payload.endsWith('0') ? '1' : '0');

  await navigateToRecover(page);
  await setupRecovery(page, 12, 2);
  await fillRecoveryShare(page, 1, share1);
  await fillRecoveryShare(page, 2, share2);
  await page.fill('#recover-payload-1', corruptPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/invalid/);

  await page.click('#btn-recover-wallet');
  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('[data-meter-kind="confidence"]'))
    .toHaveAttribute('data-state', 'plausible');
  await expect(page.locator('[data-meter-kind="kit-health"]'))
    .toHaveAttribute('data-state', 'problems');
  const payloadIntegrity = page.locator(
    '[data-validation-kind="payload-integrity"]'
  );
  await expect(payloadIntegrity).toHaveAttribute('data-fail', '1');
  await expect(payloadIntegrity).toHaveAttribute('data-blank', '1');
});

test('SB header plus raw and SA Audit evidence cross-check during Recovery', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const shareCards = page.locator('#shares-output > .share-card');
  const manifest = page.locator('#shares-output > .manifest-card');
  const fullPayload = await shareCards.nth(0)
    .locator('[data-digital-field="full-share-payload"]').textContent();
  const compactPayload = await shareCards.nth(1)
    .locator('[data-digital-field="compact-share-payload"]').textContent();
  const manifestHeader = await manifest
    .locator('[data-digital-field="manifest-full-header-payload"]').textContent();
  const rawAuditHash = await manifest
    .locator('.manifest-digital-audit[data-share-number="1"]')
    .locator('[data-digital-field="full-audit-hash"]').textContent();
  const compactSa = await manifest
    .locator('.manifest-digital-audit[data-share-number="2"]')
    .locator('[data-digital-field="compact-audit-payload"]').textContent();

  await navigateToRecover(page);
  await page.fill('#recover-manifest-header-payload', manifestHeader);
  await page.locator('#recover-manifest-header-payload').blur();
  await expect(page.locator('#recover-manifest-header-payload')).toHaveClass(/valid/);

  await page.fill('#recover-payload-1', fullPayload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-manifest-header-status'))
    .toContainText('session cross-check passed');
  await page.fill('#recover-audit-evidence-1', rawAuditHash);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('matches the Share payload');

  await page.fill('#recover-payload-2', compactPayload);
  await page.locator('#recover-payload-2').blur();
  await page.fill('#recover-audit-evidence-2', compactSa);
  await page.locator('#recover-audit-evidence-2').blur();
  await expect(page.locator('#share-container-2 .recovery-audit-status'))
    .toContainText('Compact SA payload matches');

  await page.click('#btn-recover-wallet');
  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('[data-meter-kind="confidence"]'))
    .toHaveAttribute('data-state', 'confirmed');
  await expect(page.locator('[data-meter-kind="kit-health"]'))
    .toHaveAttribute('data-state', 'consistent');
  await expect(page.locator('[data-validation-kind="rbt"]'))
    .toHaveAttribute('data-status', 'pass');
  await expect(page.locator('[data-validation-kind="manifest-header"]'))
    .toHaveAttribute('data-status', 'pass');
  const manifestAudit = page.locator('[data-validation-kind="manifest-audit"]');
  await expect(manifestAudit).toHaveAttribute('data-total', '2');
  await expect(manifestAudit).toHaveAttribute('data-pass', '2');
  await expect(manifestAudit).toHaveAttribute('data-blank', '0');
  const recoveryContext = page.locator('#recovery-payload-metadata');
  await expect(recoveryContext).toContainText('BIP39 Language: English');
  await expect(recoveryContext).toContainText(
    'Wallet / Derivation Profile: Generic / Custom'
  );
  await expect(recoveryContext).toContainText(
    'BIP39 Passphrase Requirement / Hint: Not encoded'
  );
  await expect(page.locator('#pageRecover2')).toContainText(
    'CHECK THE STORED ARTIFACTS'
  );
});

test('mismatched Manifest Audit Hash damages kit health without blocking Recovery', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const shareCards = page.locator('#shares-output > .share-card');
  const payload1 = await shareCards.nth(0)
    .locator('[data-digital-field="full-share-payload"]').textContent();
  const payload2 = await shareCards.nth(1)
    .locator('[data-digital-field="compact-share-payload"]').textContent();
  const auditHash = await page.locator('#shares-output > .manifest-card')
    .locator('.manifest-digital-audit[data-share-number="1"]')
    .locator('[data-digital-field="full-audit-hash"]').textContent();
  const wrongHash = `${auditHash.slice(0, -1)}${auditHash.endsWith('0') ? '1' : '0'}`;

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', payload1);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await page.fill('#recover-audit-evidence-1', wrongHash);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/invalid/);
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toContainText('does not match');
  await page.fill('#recover-payload-2', payload2);
  await page.locator('#recover-payload-2').blur();

  await page.click('#btn-recover-wallet');
  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('#custom-modal')).not.toBeVisible();
  await expect(page.locator('[data-meter-kind="confidence"]'))
    .toHaveAttribute('data-state', 'confirmed');
  await expect(page.locator('[data-meter-kind="kit-health"]'))
    .toHaveAttribute('data-state', 'problems');
  const kitHealth = page.locator('[data-meter-kind="kit-health"]');
  await expect(kitHealth).toHaveAttribute('data-bar-pass', '3');
  await expect(kitHealth).toHaveAttribute('data-bar-fail', '1');
  await expect(kitHealth).toHaveAttribute('data-bar-blank', '2');
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.pass'))
    .toHaveCount(1);
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.fail'))
    .toHaveCount(1);
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.blank'))
    .toHaveCount(1);
  const manifestAudit = page.locator('[data-validation-kind="manifest-audit"]');
  await expect(manifestAudit).toHaveAttribute('data-total', '2');
  await expect(manifestAudit).toHaveAttribute('data-fail', '1');
  await expect(manifestAudit).toHaveAttribute('data-blank', '1');
  await expect(manifestAudit).toHaveAttribute('data-pass', '0');
});

test('one matching RBT confirms confidence while health identifies each conflicting artifact', async ({ page }) => {
  await prepareSharing(page);
  await selectScheme(page, '3of5');
  await generateShares(page);
  const shareCards = page.locator('#shares-output > .share-card');
  const payload1 = await shareCards.nth(0)
    .locator('[data-digital-field="full-share-payload"]').textContent();
  const payload2 = await shareCards.nth(1)
    .locator('[data-digital-field="compact-share-payload"]').textContent();
  const payload3 = await shareCards.nth(2)
    .locator('[data-digital-field="compact-share-payload"]').textContent();
  const share2 = await extractShareData(page, 1);
  const damagedPayload2 =
    payload2.slice(0, -1) + (payload2.endsWith('0') ? '1' : '0');
  const header = await page.locator('#shares-output > .manifest-card')
    .locator('[data-digital-field="manifest-full-header-payload"]').textContent();
  const conflictingHeader =
    `${header.slice(0, -1)}${header.endsWith('0') ? '1' : '0'}`;

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', payload1);
  await page.locator('#recover-payload-1').blur();
  await page.fill('#recover-payload-2', damagedPayload2);
  await page.locator('#recover-payload-2').blur();
  await expect(page.locator('#recover-payload-2')).toHaveClass(/valid/);
  await page.fill('#recover-share-2-row-3-word-2', share2.words[11]);
  await page.locator('#recover-share-2-row-3-word-2').blur();
  await page.fill('#recover-payload-3', payload3);
  await page.locator('#recover-payload-3').blur();
  await page.fill('#recover-manifest-header-payload', conflictingHeader);
  await page.locator('#recover-manifest-header-payload').blur();
  await expect(page.locator('#recover-manifest-header-payload'))
    .toHaveClass(/invalid/);

  await page.click('#btn-recover-wallet');
  await expect(page.locator('#pageRecover2')).toBeVisible();
  await expect(page.locator('[data-meter-kind="confidence"]'))
    .toHaveAttribute('data-state', 'confirmed');
  await expect(page.locator('[data-meter-kind="kit-health"]'))
    .toHaveAttribute('data-state', 'problems');
  const confidence = page.locator('[data-meter-kind="confidence"]');
  await expect(confidence).toHaveAttribute('data-bar-pass', '2');
  await expect(confidence).toHaveAttribute('data-bar-fail', '0');
  await expect(confidence).toHaveAttribute('data-bar-blank', '0');
  await expect(confidence.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.pass'))
    .toHaveCount(1);
  await expect(confidence.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.fail'))
    .toHaveCount(0);
  const kitHealth = page.locator('[data-meter-kind="kit-health"]');
  await expect(kitHealth).toHaveAttribute('data-bar-pass', '1');
  await expect(kitHealth).toHaveAttribute('data-bar-fail', '3');
  await expect(kitHealth).toHaveAttribute('data-bar-blank', '2');
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.fail'))
    .toHaveCount(1);
  await expect(kitHealth.locator(':scope > summary .recovery-meter-bar .recovery-evidence-segment.pass'))
    .toHaveCount(1);
  const confidenceRbt = page.locator('[data-validation-kind="rbt"]');
  await expect(confidenceRbt).toHaveAttribute('data-status', 'pass');
  await expect(confidenceRbt).toHaveAttribute('data-total', '1');
  await expect(confidenceRbt).toHaveAttribute('data-pass', '1');
  await expect(confidenceRbt).toHaveAttribute('data-fail', '0');
  await expect(confidenceRbt).toContainText(
    'artifact discrepancies are listed in Backup Kit Health'
  );
  await expect(page.locator('[data-validation-kind="manifest-header"]'))
    .toHaveAttribute('data-status', 'fail');
  const rbtArtifacts = page.locator('[data-validation-kind="rbt-agreement"]');
  await expect(rbtArtifacts).toHaveAttribute('data-status', 'mixed');
  await expect(rbtArtifacts).toHaveAttribute('data-total', '4');
  await expect(rbtArtifacts).toHaveAttribute('data-pass', '3');
  await expect(rbtArtifacts).toHaveAttribute('data-fail', '1');
  await expect(rbtArtifacts).toContainText('Manifest Header (SB)');
});

test('tabbing out of Share Number preserves valid Share and Audit evidence states', async ({ page }) => {
  await prepareSharing(page);
  await generateShares(page);
  const payload = await page.locator('#shares-output > .share-card').first()
    .locator('[data-digital-field="full-share-payload"]').textContent();
  const auditPayload = await page.locator('#shares-output > .manifest-card')
    .locator('.manifest-digital-audit[data-share-number="1"]')
    .locator('[data-digital-field="full-audit-payload"]').textContent();

  await navigateToRecover(page);
  await page.fill('#recover-payload-1', payload);
  await page.locator('#recover-payload-1').blur();
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await page.fill('#recover-audit-evidence-1', auditPayload);
  await page.locator('#recover-audit-evidence-1').blur();
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/valid/);

  await page.locator('#recover-x-1').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#recover-payload-1')).toHaveClass(/valid/);
  await expect(page.locator('#recover-audit-evidence-1')).toHaveClass(/valid/);
  await expect(page.locator('#share-container-1 .recovery-share-payload-status'))
    .toHaveClass(/pass/);
  await expect(page.locator('#share-container-1 .recovery-audit-status'))
    .toHaveClass(/pass/);
});
