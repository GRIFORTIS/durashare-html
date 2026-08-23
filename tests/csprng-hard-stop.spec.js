import { test, expect } from '@playwright/test';
import {
  openApp,
  navigateToCreateShares,
  select12Words,
  fillMnemonic,
  selectScheme,
  generateShares,
  configureMockRandomSource,
  extractShareData
} from './test-helpers.js';

const VALID_12 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function expectSecureRandomnessModal(page) {
  const modal = page.locator('#custom-modal:has-text("Secure Randomness Failed")');
  await expect(modal).toBeVisible();
  await expect(page.locator('#modal-text')).toContainText('Secure randomness failed');
  // Must not advance to the shares page (static example .share-card exists in hidden DOM).
  await expect(page.locator('#pageCreate2')).toBeHidden();
  await expect(page.locator('#pageCreate1')).toBeVisible();
  await page.click('#modal-confirm');
  await expect(modal).toBeHidden();
}

async function prepareCreateForm(page) {
  await openApp(page);
  await navigateToCreateShares(page);
  await select12Words(page);
  await fillMnemonic(page, VALID_12);
  await selectScheme(page, '2of3');
}

test('CSPRNG smoke: constant-zero getRandomValues hard-stops create', async ({ page }) => {
  await prepareCreateForm(page);
  await configureMockRandomSource(page, 'arr.fill(0);');
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('CSPRNG smoke: constant 0xFF getRandomValues hard-stops create', async ({ page }) => {
  await prepareCreateForm(page);
  await configureMockRandomSource(page, 'arr.fill(0xFF);');
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('CSPRNG smoke: no-op getRandomValues hard-stops create', async ({ page }) => {
  await prepareCreateForm(page);
  // Leave buffer unchanged (sentinel / no-op).
  await configureMockRandomSource(page, '/* no-op */');
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('CSPRNG smoke: identical dual bursts hard-stop create', async ({ page }) => {
  await prepareCreateForm(page);
  await configureMockRandomSource(
    page,
    `
    for (let i = 0; i < arr.length; i++) {
      arr[i] = (i * 17 + 3) & 0xff;
    }
    `
  );
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('coefficient canary: all-identical field draws hard-stop after passing smoke', async ({ page }) => {
  await prepareCreateForm(page);
  // Varying byte bursts for smoke; every Uint32 draw is 0 → all coeffs identical.
  await configureMockRandomSource(
    page,
    `
    if (!globalThis.__dsRngCall) globalThis.__dsRngCall = 0;
    globalThis.__dsRngCall += 1;
    if (arr instanceof Uint8Array) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = (i + globalThis.__dsRngCall * 31) & 0xff;
      }
      if (arr.length > 1) arr[arr.length - 1] ^= 1;
    } else {
      arr.fill(0);
    }
    `
  );
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('coefficient canary: max frequency >= 6 hard-stops create (sparse repeats)', async ({ page }) => {
  await prepareCreateForm(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    let call = 0;
    // 12 coeffs: value 7 appears six times interleaved — not a contiguous run.
    const sequence = [7, 100, 7, 101, 7, 102, 7, 103, 7, 104, 7, 105];
    for (let i = 0; i < 20; i++) sequence.push(200 + i);
    api.configureEnvironment({
      randomSource: {
        getRandomValues(arr) {
          call += 1;
          if (arr instanceof Uint8Array) {
            for (let i = 0; i < arr.length; i++) {
              arr[i] = (i + call * 31) & 0xff;
            }
            if (arr.length > 1) arr[arr.length - 1] ^= 1;
            return;
          }
          const v = sequence.shift();
          arr[0] = typeof v === 'number' ? v : (call * 9973 + 13);
        }
      }
    });
  });
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('coefficient canary: a single pair of equals still allows create', async ({ page }) => {
  await prepareCreateForm(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    let call = 0;
    // 12 coeffs: one pair of 42s, rest unique — must pass canary.
    const sequence = [42, 42, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11];
    api.configureEnvironment({
      randomSource: {
        getRandomValues(arr) {
          call += 1;
          if (arr instanceof Uint8Array) {
            for (let i = 0; i < arr.length; i++) {
              arr[i] = (i + call * 31) & 0xff;
            }
            if (arr.length > 1) arr[arr.length - 1] ^= 1;
            return;
          }
          // Rejection sampling may call multiple times; supply values in-range for GF draws.
          if (sequence.length > 0) {
            arr[0] = sequence.shift();
          } else {
            arr[0] = (call * 7919) >>> 0;
          }
        }
      }
    });
  });
  await generateShares(page);
  const share1 = await extractShareData(page, 0);
  expect(share1.words).toHaveLength(12);
});

test('CSPRNG smoke: throwing getRandomValues hard-stops as RngHardStopError modal', async ({ page }) => {
  await prepareCreateForm(page);
  await configureMockRandomSource(page, 'throw new Error("simulated CSPRNG fault");');
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('CSPRNG smoke: unavailable getRandomValues hard-stops as RngHardStopError', async ({ page }) => {
  await prepareCreateForm(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const broken = {
      getRandomValues() {
        /* replaced below after configureEnvironment accepts the shape */
      }
    };
    api.configureEnvironment({ randomSource: broken });
    // Invalidate the configured source and the platform fallback so resolveRandomSource fails closed.
    broken.getRandomValues = undefined;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true
    });
  });
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
});

test('rejection sampling: permanently rejected Uint32 values hard-stop after bounded attempts', async ({ page }) => {
  await prepareCreateForm(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    let smokeCall = 0;
    globalThis.__dsFieldDrawCalls = 0;
    api.configureEnvironment({
      randomSource: {
        getRandomValues(arr) {
          if (arr instanceof Uint8Array) {
            smokeCall += 1;
            for (let i = 0; i < arr.length; i++) {
              arr[i] = (i + smokeCall * 31) & 0xff;
            }
            if (arr.length > 1) arr[arr.length - 1] ^= 1;
            return;
          }
          // 2^32 - 1 is above the GF(2053) rejection limit.
          globalThis.__dsFieldDrawCalls += 1;
          arr[0] = 0xffffffff;
        }
      }
    });
  });
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
  expect(await page.evaluate(() => globalThis.__dsFieldDrawCalls)).toBe(8);
});

test('rejection sampling: accepts a valid value on the eighth and final attempt', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const api = globalThis.DuraShare;
    let fieldDrawCalls = 0;
    api.configureEnvironment({
      randomSource: {
        getRandomValues(arr) {
          fieldDrawCalls += 1;
          arr[0] = fieldDrawCalls < 8 ? 0xffffffff : 123;
        }
      }
    });
    return {
      value: api.getRandomFieldElement(),
      fieldDrawCalls
    };
  });
  expect(result.value).toBe(123);
  expect(result.fieldDrawCalls).toBe(8);
});

test('coefficient generation: mid-polynomial RNG throw hard-stops with no shares', async ({ page }) => {
  await prepareCreateForm(page);
  await page.evaluate(() => {
    const api = globalThis.DuraShare;
    let smokeCall = 0;
    globalThis.__dsFieldDrawCalls = 0;
    api.configureEnvironment({
      randomSource: {
        getRandomValues(arr) {
          if (arr instanceof Uint8Array) {
            smokeCall += 1;
            for (let i = 0; i < arr.length; i++) {
              arr[i] = (i + smokeCall * 31) & 0xff;
            }
            if (arr.length > 1) arr[arr.length - 1] ^= 1;
            return;
          }
          globalThis.__dsFieldDrawCalls += 1;
          if (globalThis.__dsFieldDrawCalls === 3) {
            throw new Error('simulated mid-polynomial CSPRNG fault');
          }
          arr[0] = globalThis.__dsFieldDrawCalls;
        }
      }
    });
  });
  await page.click('#btn-generate-shares');
  await expectSecureRandomnessModal(page);
  expect(await page.evaluate(() => globalThis.__dsFieldDrawCalls)).toBe(3);
});

test('healthy CSPRNG path still creates shares', async ({ page }) => {
  await prepareCreateForm(page);
  await generateShares(page);
  const share1 = await extractShareData(page, 0);
  expect(share1.words).toHaveLength(12);
  await expect(page.locator('#custom-modal')).toBeHidden();
});

test('manual sharding Random Again: constant RNG shows Secure Randomness Failed modal', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-manual-sharding-helper');
  await page.waitForSelector('#pageManualSharding', { state: 'visible' });
  await configureMockRandomSource(page, 'arr.fill(0);');
  await page.click('#btn-random-again');
  const modal = page.locator('#custom-modal:has-text("Secure Randomness Failed")');
  await expect(modal).toBeVisible();
  await page.click('#modal-confirm');
});

test('assertCoefficientBatchHealthy / isRngHardStopError unit: pair ok, freq rules, typed errors', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const out = {
      pairOk: false,
      freq5Ok: false,
      freq6ContiguousThrows: false,
      freq6SparseThrows: false,
      allIdenticalThrows: false,
      forgedNameRejected: false,
      isRngHelperFalseOnGeneric: false,
      throwingFillMapsToRngHardStop: false
    };
    try {
      api.assertCoefficientBatchHealthy([1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      out.pairOk = true;
    } catch (e) {
      out.pairOk = false;
    }
    try {
      api.assertCoefficientBatchHealthy([9, 9, 9, 9, 9, 1, 2, 3, 4, 5, 6, 7]);
      out.freq5Ok = true;
    } catch (e) {
      out.freq5Ok = false;
    }
    try {
      api.assertCoefficientBatchHealthy([9, 9, 9, 9, 9, 9, 1, 2, 3, 4]);
      out.freq6ContiguousThrows = false;
    } catch (e) {
      out.freq6ContiguousThrows = api.isRngHardStopError(e);
    }
    try {
      api.assertCoefficientBatchHealthy([9, 1, 9, 2, 9, 3, 9, 4, 9, 5, 9, 6]);
      out.freq6SparseThrows = false;
    } catch (e) {
      out.freq6SparseThrows = api.isRngHardStopError(e);
    }
    try {
      api.assertCoefficientBatchHealthy([5, 5, 5]);
      out.allIdenticalThrows = false;
    } catch (e) {
      out.allIdenticalThrows = api.isRngHardStopError(e) && String(e.message).includes('identical');
    }
    out.forgedNameRejected =
      api.isRngHardStopError({ name: 'RngHardStopError', message: 'forged' }) === false;
    out.isRngHelperFalseOnGeneric = api.isRngHardStopError(new Error('Secure randomness failed: forged')) === false;
    try {
      api.configureEnvironment({
        randomSource: {
          getRandomValues() {
            throw new Error('simulated CSPRNG fault');
          }
        }
      });
      api.assertCsprngHealthy();
      out.throwingFillMapsToRngHardStop = false;
    } catch (e) {
      out.throwingFillMapsToRngHardStop = api.isRngHardStopError(e);
    }
    return out;
  });
  expect(result.pairOk).toBe(true);
  expect(result.freq5Ok).toBe(true);
  expect(result.freq6ContiguousThrows).toBe(true);
  expect(result.freq6SparseThrows).toBe(true);
  expect(result.allIdenticalThrows).toBe(true);
  expect(result.forgedNameRejected).toBe(true);
  expect(result.isRngHelperFalseOnGeneric).toBe(true);
  expect(result.throwingFillMapsToRngHardStop).toBe(true);
});
