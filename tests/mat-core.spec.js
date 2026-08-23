import { test, expect } from '@playwright/test';
import { openApp } from './test-helpers.js';

const CANONICAL_ROWS = [
  1681, 1470, 1343,
  1, 2048, 850,
  0, 2052, 415,
  812, 1966, 509
];

function syntheticShare(shareNumber, wordValue = 1) {
  return {
    shareNumber,
    wordShares: new Array(12).fill(wordValue),
    checksumShares: new Array(4).fill(0),
    columnChecksumShares: new Array(3).fill(0),
    globalIntegrityCheckShare: 0
  };
}

test('canonical v0.7.0 dual-MAT sample matches expected tags', async ({ page }) => {
  await openApp(page);

  const tags = await page.evaluate(({ rows }) => {
    const api = globalThis.DuraShare;
    return {
      columnA: api.computeMatTags(rows, {
        weights: [2, 4, 7],
        rowPads: [6, 8, 10, 12]
      }),
      columnB: api.computeMatTags(rows, {
        weights: [11, 13, 17],
        rowPads: [19, 23, 29, 31]
      })
    };
  }, { rows: CANONICAL_ROWS });

  expect(tags.columnA).toEqual([172, 1834, 858, 745]);
  expect(tags.columnB).toEqual([914, 48, 912, 61]);
});

test('optional MAT audit checks complete rows and computes matching matrix rank', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate((rows) => {
    const api = globalThis.DuraShare;
    const key = {
      weights: [2, 4, 7],
      rowPads: [6, 8, 10, 12]
    };
    const tags = api.computeMatTags(rows, key);
    const rankThreeTags = [...tags];
    rankThreeTags[3] = (rankThreeTags[3] + 1) % 2053;
    const partialTags = [tags[0], undefined, undefined, undefined];
    const partialPads = [6, undefined, undefined, undefined];
    return {
      rankThree: api.auditMatColumn(rows, rankThreeTags, key),
      partial: api.auditMatColumn(rows, partialTags, {
        weights: key.weights,
        rowPads: partialPads
      })
    };
  }, CANONICAL_ROWS);

  expect(result.rankThree.matchedRows).toEqual([0, 1, 2]);
  expect(result.rankThree.failedRows).toEqual([3]);
  expect(result.rankThree.matchingRank).toBe(3);
  expect(result.partial).toEqual({
    checkedRows: [0],
    matchedRows: [0],
    failedRows: [],
    matchingRank: 1
  });
});

test('optional MAT audit reports rank-deficient matches', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const rows = new Array(12).fill(1);
    const key = {
      weights: [2, 4, 7],
      rowPads: [6, 8, 10, 12]
    };
    const tags = api.computeMatTags(rows, key);
    tags[3] = (tags[3] + 1) % 2053;
    return api.auditMatColumn(rows, tags, key);
  });

  expect(result.matchedRows).toEqual([0, 1, 2]);
  expect(result.failedRows).toEqual([3]);
  expect(result.matchingRank).toBe(1);
});

test('optional MAT audit clears partial normalized weights when validation throws', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const originalPush = Array.prototype.push;
    const temporaryArrays = new Set();
    Array.prototype.push = function(...items) {
      temporaryArrays.add(this);
      return originalPush.apply(this, items);
    };
    const key = {
      weights: [2, 'invalid', 7],
      rowPads: [6]
    };
    let message = '';
    try {
      globalThis.DuraShare.auditMatColumn([1, 2, 3], [19], key);
    } catch (error) {
      message = error.message;
    } finally {
      Array.prototype.push = originalPush;
    }
    return {
      message,
      temporaryLengths: Array.from(temporaryArrays, array => array.length),
      sourceWeights: [...key.weights]
    };
  });

  expect(result.message).toContain('must be an integer');
  expect(result.temporaryLengths).toEqual([0]);
  expect(result.sourceWeights).toEqual([2, 'invalid', 7]);
});

test('optional MAT audit rejects malformed supplied values even when a row is incomplete', async ({ page }) => {
  await openApp(page);

  const messages = await page.evaluate(() => {
    const api = globalThis.DuraShare;
    const key = {
      weights: [2, 4, 7],
      rowPads: [undefined]
    };
    const capture = (words, tags) => {
      try {
        api.auditMatColumn(words, tags, key);
        return '';
      } catch (error) {
        return error.message;
      }
    };
    return {
      malformedTag: capture([1, 2, 3], ['bad']),
      malformedWord: capture([1, 'bad', 3], [undefined])
    };
  });

  expect(messages.malformedTag).toContain('MAT audit row 1 tag must be an integer');
  expect(messages.malformedWord).toContain('MAT audit word 2 must be an integer');
});

test('dual Whole-Key MAT uses the specified draw order and keeps keys separate', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate((shares) => {
    let next = 1;
    let draws = 0;
    globalThis.DuraShare.configureEnvironment({
      randomSource: {
        getRandomValues(buffer) {
          buffer[0] = next++;
          draws++;
        }
      }
    });

    const artifacts = globalThis.DuraShare.generateMatArtifacts(shares, {
      matMode: 'dual',
      matCustody: 'whole'
    });
    const firstTagBuffer = artifacts.shares[0].matTags[0];
    const firstWeightBuffer = artifacts.manifests[0].shareKeys[0].columns[0].weights;
    const snapshot = {
      draws,
      matModes: artifacts.shares.map(share => share.matMode),
      tagShapes: artifacts.shares.map(share => share.matTags.map(column => column.length)),
      shareHasKeys: artifacts.shares.some(share => 'weights' in share || 'rowPads' in share),
      manifestKinds: artifacts.manifests.map(manifest => manifest.kind),
      keyShapes: artifacts.manifests[0].shareKeys.map(entry =>
        entry.columns.map(column => [column.weights.length, column.rowPads.length])
      ),
      firstWeights: [...artifacts.manifests[0].shareKeys[0].columns[0].weights],
      firstPads: [...artifacts.manifests[0].shareKeys[0].columns[0].rowPads],
      manifestHasShareValues: artifacts.manifests.some(manifest =>
        manifest.shareKeys.some(entry =>
          'wordShares' in entry || 'matTags' in entry || 'globalIntegrityCheckShare' in entry
        )
      )
    };
    globalThis.DuraShare.clearSharingArtifacts(artifacts);
    snapshot.cleanup = {
      shareCount: artifacts.shares.length,
      manifestCount: artifacts.manifests.length,
      tagsZeroed: firstTagBuffer.every(value => value === 0),
      weightsZeroed: firstWeightBuffer.every(value => value === 0)
    };
    return snapshot;
  }, [syntheticShare(1), syntheticShare(2, 2)]);

  expect(result.draws).toBe(28);
  expect(result.matModes).toEqual(['dual', 'dual']);
  expect(result.tagShapes).toEqual([[4, 4], [4, 4]]);
  expect(result.shareHasKeys).toBe(false);
  expect(result.manifestKinds).toEqual(['whole']);
  expect(result.keyShapes).toEqual([
    [[3, 4], [3, 4]],
    [[3, 4], [3, 4]]
  ]);
  expect(result.firstWeights).toEqual([1, 2, 3]);
  expect(result.firstPads).toEqual([4, 5, 6, 7]);
  expect(result.manifestHasShareValues).toBe(false);
  expect(result.cleanup).toEqual({
    shareCount: 0,
    manifestCount: 0,
    tagsZeroed: true,
    weightsZeroed: true
  });
});

test('Split-Key MAT doubles draws and recombines to the tag keys', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate((shares) => {
    let next = 1;
    let draws = 0;
    globalThis.DuraShare.configureEnvironment({
      randomSource: {
        getRandomValues(buffer) {
          buffer[0] = next++;
          draws++;
        }
      }
    });

    const api = globalThis.DuraShare;
    const artifacts = api.generateMatArtifacts(shares, {
      matMode: 'dual',
      matCustody: 'split'
    });
    const firstShare = artifacts.shares[0];
    const firstKeyA = artifacts.manifests[0].shareKeys[0].columns[0];
    const firstKeyB = artifacts.manifests[1].shareKeys[0].columns[0];
    const combined = api.recombineMatKeySets(firstKeyA, firstKeyB, 4);
    const recomputedTags = api.computeMatTags(firstShare.wordShares, combined);
    const snapshot = {
      draws,
      manifestKinds: artifacts.manifests.map(manifest => manifest.kind),
      recomputedTags,
      actualTags: [...firstShare.matTags[0]],
      combinedWeights: [...combined.weights],
      combinedPads: [...combined.rowPads]
    };
    combined.weights.fill(0);
    combined.rowPads.fill(0);
    api.clearSharingArtifacts(artifacts);
    return snapshot;
  }, [syntheticShare(1), syntheticShare(2, 2)]);

  expect(result.draws).toBe(56);
  expect(result.manifestKinds).toEqual(['split-a', 'split-b']);
  expect(result.recomputedTags).toEqual(result.actualTags);
  expect(result.combinedWeights).toEqual([1, 2, 3]);
  expect(result.combinedPads).toEqual([4, 5, 6, 7]);
});

test('zero MAT weights and pads are valid field elements', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate((share) => {
    globalThis.DuraShare.configureEnvironment({
      randomSource: {
        getRandomValues(buffer) {
          buffer.fill(0);
        }
      }
    });
    const artifacts = globalThis.DuraShare.generateMatArtifacts([share], {
      matMode: 'single',
      matCustody: 'whole'
    });
    const snapshot = {
      tags: [...artifacts.shares[0].matTags[0]],
      weights: [...artifacts.manifests[0].shareKeys[0].columns[0].weights],
      pads: [...artifacts.manifests[0].shareKeys[0].columns[0].rowPads]
    };
    globalThis.DuraShare.clearSharingArtifacts(artifacts);
    return snapshot;
  }, syntheticShare(1, 2052));

  expect(result.tags).toEqual([0, 0, 0, 0]);
  expect(result.weights).toEqual([0, 0, 0]);
  expect(result.pads).toEqual([0, 0, 0, 0]);
});

test('MAT verification rejects a modified tag', async ({ page }) => {
  await openApp(page);

  const message = await page.evaluate((share) => {
    let next = 1;
    const api = globalThis.DuraShare;
    api.configureEnvironment({
      randomSource: {
        getRandomValues(buffer) {
          buffer[0] = next++;
        }
      }
    });
    const artifacts = api.generateMatArtifacts([share], {
      matMode: 'single',
      matCustody: 'whole'
    });
    artifacts.shares[0].matTags[0][0] =
      (artifacts.shares[0].matTags[0][0] + 1) % 2053;
    let errorMessage = '';
    try {
      api.verifyMatBindings(
        artifacts.shares,
        artifacts.manifests[0].shareKeys,
        'single'
      );
    } catch (error) {
      errorMessage = error.message;
    } finally {
      api.clearSharingArtifacts(artifacts);
    }
    return errorMessage;
  }, syntheticShare(1, 42));

  expect(message).toContain('MAT consistency check failed');
  expect(message).toContain('Share 1');
  expect(message).toContain('row 1');
});

test('MAT verification fails closed for malformed modes, shapes, order, and field values', async ({ page }) => {
  await openApp(page);

  const messages = await page.evaluate((share) => {
    let next = 1;
    const api = globalThis.DuraShare;
    api.configureEnvironment({
      randomSource: {
        getRandomValues(buffer) {
          buffer[0] = next++;
        }
      }
    });

    function verifyMutation(mutate, { mode = 'dual', omitMode = false } = {}) {
      const artifacts = api.generateMatArtifacts([share], {
        matMode: 'dual',
        matCustody: 'whole'
      });
      const testShares = structuredClone(artifacts.shares);
      const testKeys = structuredClone(artifacts.manifests[0].shareKeys);
      try {
        mutate(testShares, testKeys);
        if (omitMode) {
          api.verifyMatBindings(testShares, testKeys);
        } else {
          api.verifyMatBindings(testShares, testKeys, mode);
        }
        return '';
      } catch (error) {
        return error.message;
      } finally {
        api.clearSharingArtifacts(artifacts);
        api.clearSharingArtifacts({
          shares: testShares,
          manifests: [{ shareKeys: testKeys }]
        });
      }
    }

    return {
      missingMode: verifyMutation(() => {}, { omitMode: true }),
      wrongMode: verifyMutation((shares) => {
        shares[0].matMode = 'single';
      }),
      truncatedColumns: verifyMutation((shares, keys) => {
        shares[0].matTags.length = 0;
        keys[0].columns.length = 0;
      }),
      nonArrayTags: verifyMutation((shares) => {
        shares[0].matTags = null;
      }),
      nonArrayColumns: verifyMutation((_shares, keys) => {
        keys[0].columns = null;
      }),
      wrongColumnOrder: verifyMutation((_shares, keys) => {
        keys[0].columns[0].column = 2;
      }),
      shortTagColumn: verifyMutation((shares) => {
        shares[0].matTags[0].pop();
      }),
      unsafeIntegerAlias: verifyMutation((shares) => {
        shares[0].matTags[0][0] += 2 ** 32;
      }),
      stringTag: verifyMutation((shares) => {
        shares[0].matTags[0][0] = String(shares[0].matTags[0][0]);
      }),
      invalidWeight: verifyMutation((_shares, keys) => {
        keys[0].columns[0].weights[0] = 2053;
      }),
      fractionalPad: verifyMutation((_shares, keys) => {
        keys[0].columns[0].rowPads[0] = 0.5;
      }),
      invalidShareNumber: verifyMutation((shares) => {
        shares[0].shareNumber = 0;
      })
    };
  }, syntheticShare(1, 42));

  expect(messages.missingMode).toContain('explicit expected MAT mode');
  expect(messages.wrongMode).toContain('does not match');
  expect(messages.truncatedColumns).toContain('metadata do not match');
  expect(messages.nonArrayTags).toContain('must be arrays');
  expect(messages.nonArrayColumns).toContain('must be arrays');
  expect(messages.wrongColumnOrder).toContain('canonical order');
  expect(messages.shortTagColumn).toContain('length mismatch');
  expect(messages.unsafeIntegerAlias).toContain('between 0 and 2052');
  expect(messages.stringTag).toContain('must be an integer');
  expect(messages.invalidWeight).toContain('between 0 and 2052');
  expect(messages.fractionalPad).toContain('must be an integer');
  expect(messages.invalidShareNumber).toContain('between 1 and 2052');
});

test('computeMatTags clears normalized keys and partial tags when a later row fails', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const originalPush = Array.prototype.push;
    const temporaryArrays = new Set();
    Array.prototype.push = function(...items) {
      temporaryArrays.add(this);
      return originalPush.apply(this, items);
    };

    const words = [1, 2, 3, 4, 'invalid', 6];
    const keySet = {
      weights: [7, 8, 9],
      rowPads: [10, 11]
    };
    let message = '';
    try {
      globalThis.DuraShare.computeMatTags(words, keySet);
    } catch (error) {
      message = error.message;
    } finally {
      Array.prototype.push = originalPush;
    }

    return {
      message,
      capturedCount: temporaryArrays.size,
      temporaryLengths: Array.from(temporaryArrays, array => array.length),
      sourceUnchanged: {
        words: [...words],
        weights: [...keySet.weights],
        rowPads: [...keySet.rowPads]
      }
    };
  });

  expect(result.message).toContain('must be an integer');
  expect(result.capturedCount).toBe(3);
  expect(result.temporaryLengths).toEqual([0, 0, 0]);
  expect(result.sourceUnchanged).toEqual({
    words: [1, 2, 3, 4, 'invalid', 6],
    weights: [7, 8, 9],
    rowPads: [10, 11]
  });
});

test('recombineMatKeySets clears normalized A and partial B when Manifest B is malformed', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const originalPush = Array.prototype.push;
    const temporaryArrays = new Set();
    Array.prototype.push = function(...items) {
      temporaryArrays.add(this);
      return originalPush.apply(this, items);
    };

    const keyA = {
      weights: [1, 2, 3],
      rowPads: [4, 5]
    };
    const keyB = {
      weights: [6, 7, 8],
      rowPads: [9, 'invalid']
    };
    let message = '';
    try {
      globalThis.DuraShare.recombineMatKeySets(keyA, keyB, 2);
    } catch (error) {
      message = error.message;
    } finally {
      Array.prototype.push = originalPush;
    }

    return {
      message,
      capturedCount: temporaryArrays.size,
      temporaryLengths: Array.from(temporaryArrays, array => array.length),
      sourceUnchanged: {
        keyA: {
          weights: [...keyA.weights],
          rowPads: [...keyA.rowPads]
        },
        keyB: {
          weights: [...keyB.weights],
          rowPads: [...keyB.rowPads]
        }
      }
    };
  });

  expect(result.message).toContain('Manifest B MAT key set Row Pad b2 must be an integer');
  expect(result.capturedCount).toBe(4);
  expect(result.temporaryLengths).toEqual([0, 0, 0, 0]);
  expect(result.sourceUnchanged).toEqual({
    keyA: {
      weights: [1, 2, 3],
      rowPads: [4, 5]
    },
    keyB: {
      weights: [6, 7, 8],
      rowPads: [9, 'invalid']
    }
  });
});
