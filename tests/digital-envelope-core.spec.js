import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  openApp,
  getBip39WordlistForTest
} from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveSpecRepoRoot() {
  const envPath =
    process.env.DURASHARE_SPEC_REPO_PATH ||
    process.env.SCHIAVINATO_SHARING_SPEC_REPO_PATH;
  if (envPath) return envPath;

  for (const name of ['durashare', 'schiavinato-sharing']) {
    const siblingPath = resolve(__dirname, '..', '..', name);
    if (fs.existsSync(siblingPath)) return siblingPath;
  }

  throw new Error(
    'Canonical vectors not found. Set DURASHARE_SPEC_REPO_PATH to the spec repo ' +
    'or clone durashare next to durashare-html.'
  );
}

const VECTORS_PATH = join(
  resolveSpecRepoRoot(),
  'test_vectors',
  'vectors.json'
);

function loadMainVector() {
  const data = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'));
  const vector = data.vectors.find(entry =>
    entry.id === 'tv-v0.7.0-gf2053-2of3-12w-full-compact'
  );
  if (!vector) {
    throw new Error(`Missing v0.7.0 digital-envelope vector at ${VECTORS_PATH}`);
  }
  return vector;
}

const VECTOR = loadMainVector();

function asPayloadShare(share) {
  return {
    shareNumber: share.x,
    wordShares: share.word_values,
    checksumShares: share.row_checksums,
    columnChecksumShares: share.column_checksums,
    globalIntegrityCheckShare: share.printed_gic
  };
}

test('v0.7 arithmetic generation matches the canonical vector', async ({ page }) => {
  await openApp(page);
  const actual = await page.evaluate(async ({ mnemonic, coefficients, wordlist }) => {
    const api = globalThis.DuraShare;
    let smokeCall = 0;
    const pending = [...coefficients];
    api.configureEnvironment({
      randomSource: {
        getRandomValues(buffer) {
          if (buffer instanceof Uint8Array) {
            smokeCall += 1;
            for (let i = 0; i < buffer.length; i++) {
              buffer[i] = (i + smokeCall * 37) & 0xff;
            }
            if (buffer.length > 1) buffer[buffer.length - 1] ^= smokeCall;
            return;
          }
          const value = pending.shift();
          if (!Number.isInteger(value)) {
            throw new Error('Canonical coefficient sequence exhausted.');
          }
          buffer[0] = value;
        }
      }
    });
    return api.splitBip39(
      mnemonic,
      2,
      3,
      wordlist
    );
  }, {
    mnemonic: VECTOR.mnemonic.words.join(' '),
    coefficients: VECTOR.coefficients,
    wordlist: getBip39WordlistForTest()
  });

  expect(actual.shares).toEqual(VECTOR.shares.map(asPayloadShare));
});

test('Full and Compact payload primitives match v0.7 vectors exactly', async ({ page }) => {
  await openApp(page);
  const share = VECTOR.shares[0];
  const result = await page.evaluate(async ({ vector, payloadShare }) => {
    const api = globalThis.DuraShare;
    const canonical = api.hexToBytes(vector.rbt.canonical_secret_material_hex);
    const inputSymbols = vector.mnemonic.indices_1_based;
    const fullBatchId = api.hexToBytes(vector.rbt.full_session_batch_id_hex);
    const compactBatchId = api.hexToBytes(vector.rbt.compact_session_batch_id_hex);
    const packed = api.packFieldElements12(inputSymbols);
    const fullRbt = await api.deriveRbt(canonical, fullBatchId, 12);
    const compactRbt = await api.deriveRbt(canonical, compactBatchId, 6);
    const full = await api.buildFullSharePayload({
      share: payloadShare,
      threshold: vector.params.threshold.k,
      wordCount: vector.params.word_count,
      walletProfileCode: 5,
      sessionBatchId: fullBatchId,
      rbt: fullRbt
    });
    const compact = api.buildCompactSharePayload({
      share: payloadShare,
      threshold: vector.params.threshold.k,
      wordCount: vector.params.word_count,
      walletProfileCode: 5,
      sessionBatchId: compactBatchId,
      rbt: compactRbt
    });
    const fullAuditHash = await api.computeSha256(full.payload);
    const compactAuditHash = await api.computeSha256(compact.payload);
    const fullHeader = api.buildManifestHeaderPayload({
      profile: 'full',
      wordCount: vector.params.word_count,
      sessionBatchId: fullBatchId,
      rbt: fullRbt
    });
    const compactHeader = api.buildManifestHeaderPayload({
      profile: 'compact',
      wordCount: vector.params.word_count,
      sessionBatchId: compactBatchId,
      rbt: compactRbt
    });
    const fullAuditPayload = api.buildShareAuditPayload({
      profile: 'full',
      wordCount: vector.params.word_count,
      threshold: vector.params.threshold.k,
      shareNumber: payloadShare.shareNumber,
      auditHash: fullAuditHash
    });
    const compactAuditPayload = api.buildShareAuditPayload({
      profile: 'compact',
      wordCount: vector.params.word_count,
      threshold: vector.params.threshold.k,
      shareNumber: payloadShare.shareNumber,
      auditHash: compactAuditHash
    });
    return {
      packed: api.bytesToHex(packed),
      fullRbt: api.bytesToHex(fullRbt),
      compactRbt: api.bytesToHex(compactRbt),
      fullPayload: api.bytesToHex(full.payload),
      compactPayload: api.bytesToHex(compact.payload),
      transportHash: api.bytesToHex(full.transportHash),
      fullAuditHash: api.bytesToHex(fullAuditHash),
      compactAuditHash: api.bytesToHex(compactAuditHash),
      fullHeader: api.bytesToHex(fullHeader),
      compactHeader: api.bytesToHex(compactHeader),
      fullAuditPayload: api.bytesToHex(fullAuditPayload),
      compactAuditPayload: api.bytesToHex(compactAuditPayload)
    };
  }, {
    vector: VECTOR,
    payloadShare: asPayloadShare(share)
  });

  expect(result.packed).toBe(
    VECTOR.rbt.canonical_secret_material_hex.slice(2)
  );
  expect(result.fullRbt).toBe(VECTOR.rbt.full_rbt_hex);
  expect(result.compactRbt).toBe(VECTOR.rbt.compact_rbt_hex);
  expect(result.fullPayload).toBe(share.full_payload.payload_hex);
  expect(result.compactPayload).toBe(share.compact_payload.payload_hex);
  expect(result.transportHash).toBe(share.full_payload.transport_hash_hex);
  expect(result.fullAuditHash).toBe(
    share.full_payload.manifest_audit_hash_hex
  );
  expect(result.compactAuditHash).toBe(
    share.compact_payload.manifest_audit_hash_hex
  );
  expect(result.fullHeader).toBe(
    `53420120${VECTOR.rbt.full_session_batch_id_hex}${VECTOR.rbt.full_rbt_hex}`
  );
  expect(result.compactHeader).toBe(
    `53420100${VECTOR.rbt.compact_session_batch_id_hex}${VECTOR.rbt.compact_rbt_hex}`
  );
  expect(result.fullAuditPayload).toBe(
    `5341012002000100${share.full_payload.manifest_audit_hash_hex}`
  );
  expect(result.compactAuditPayload).toBe(
    `534101000201${share.compact_payload.manifest_audit_hash_hex.slice(0, 32)}`
  );
});

test('every canonical Share payload and Audit Hash matches v0.7 vectors', async ({ page }) => {
  await openApp(page);
  const actual = await page.evaluate(async ({ vector, shares }) => {
    const api = globalThis.DuraShare;
    const canonical = api.hexToBytes(vector.rbt.canonical_secret_material_hex);
    const fullBatchId = api.hexToBytes(vector.rbt.full_session_batch_id_hex);
    const compactBatchId = api.hexToBytes(vector.rbt.compact_session_batch_id_hex);
    const fullRbt = await api.deriveRbt(canonical, fullBatchId, 12);
    const compactRbt = await api.deriveRbt(canonical, compactBatchId, 6);
    const results = [];
    for (const share of shares) {
      const full = await api.buildFullSharePayload({
        share,
        threshold: vector.params.threshold.k,
        wordCount: vector.params.word_count,
        walletProfileCode: 5,
        sessionBatchId: fullBatchId,
        rbt: fullRbt
      });
      const compact = api.buildCompactSharePayload({
        share,
        threshold: vector.params.threshold.k,
        wordCount: vector.params.word_count,
        walletProfileCode: 5,
        sessionBatchId: compactBatchId,
        rbt: compactRbt
      });
      results.push({
        fullPayload: api.bytesToHex(full.payload),
        compactPayload: api.bytesToHex(compact.payload),
        fullAuditHash: api.bytesToHex(await api.computeSha256(full.payload)),
        compactAuditHash: api.bytesToHex(await api.computeSha256(compact.payload))
      });
    }
    return results;
  }, {
    vector: VECTOR,
    shares: VECTOR.shares.map(asPayloadShare)
  });

  expect(actual).toEqual(VECTOR.shares.map(share => ({
    fullPayload: share.full_payload.payload_hex,
    compactPayload: share.compact_payload.payload_hex,
    fullAuditHash: share.full_payload.manifest_audit_hash_hex,
    compactAuditHash: share.compact_payload.manifest_audit_hash_hex
  })));
});

test('all supported word counts produce exact profile lengths and MAT-independent bytes', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const api = globalThis.DuraShare;
    const expected = {
      12: [75, 35],
      15: [81, 40],
      18: [87, 44],
      21: [93, 49],
      24: [99, 53]
    };
    const rows = [];
    for (const [wordCountText, lengths] of Object.entries(expected)) {
      const wordCount = Number(wordCountText);
      const share = {
        shareNumber: 1,
        wordShares: Array.from({ length: wordCount }, (_, index) => (index + 1) % 2053),
        checksumShares: new Array(wordCount / 3).fill(0),
        columnChecksumShares: [0, 0, 0],
        globalIntegrityCheckShare: 0,
        matTags: [[1, 2, 3], [4, 5, 6]]
      };
      const withoutMat = {
        ...share,
        matTags: []
      };
      const fullBatchId = new Uint8Array(8);
      const compactBatchId = new Uint8Array(4);
      const fullRbt = new Uint8Array(12);
      const compactRbt = new Uint8Array(6);
      const full = await api.buildFullSharePayload({
        share,
        threshold: 2,
        wordCount,
        walletProfileCode: 5,
        sessionBatchId: fullBatchId,
        rbt: fullRbt
      });
      const fullWithoutMat = await api.buildFullSharePayload({
        share: withoutMat,
        threshold: 2,
        wordCount,
        walletProfileCode: 5,
        sessionBatchId: fullBatchId,
        rbt: fullRbt
      });
      const compact = api.buildCompactSharePayload({
        share,
        threshold: 2,
        wordCount,
        walletProfileCode: 5,
        sessionBatchId: compactBatchId,
        rbt: compactRbt
      });
      const compactWithoutMat = api.buildCompactSharePayload({
        share: withoutMat,
        threshold: 2,
        wordCount,
        walletProfileCode: 5,
        sessionBatchId: compactBatchId,
        rbt: compactRbt
      });
      rows.push({
        wordCount,
        fullLength: full.payload.length,
        compactLength: compact.payload.length,
        expectedFullLength: lengths[0],
        expectedCompactLength: lengths[1],
        fullMatIndependent:
          api.bytesToHex(full.payload) === api.bytesToHex(fullWithoutMat.payload),
        compactMatIndependent:
          api.bytesToHex(compact.payload) === api.bytesToHex(compactWithoutMat.payload)
      });
    }
    return rows;
  });

  for (const row of result) {
    expect(row.fullLength).toBe(row.expectedFullLength);
    expect(row.compactLength).toBe(row.expectedCompactLength);
    expect(row.fullMatIndependent).toBe(true);
    expect(row.compactMatIndependent).toBe(true);
  }
});

test('wallet profile codes occupy only share flag bits 3 through 5', async ({ page }) => {
  await openApp(page);
  const flags = await page.evaluate(async () => {
    const api = globalThis.DuraShare;
    const share = {
      shareNumber: 1,
      wordShares: new Array(12).fill(1),
      checksumShares: new Array(4).fill(0),
      columnChecksumShares: [0, 0, 0],
      globalIntegrityCheckShare: 0
    };
    const values = [];
    for (let walletProfileCode = 0; walletProfileCode <= 5; walletProfileCode++) {
      const full = await api.buildFullSharePayload({
        share,
        threshold: 2,
        wordCount: 12,
        walletProfileCode,
        sessionBatchId: new Uint8Array(8),
        rbt: new Uint8Array(12)
      });
      const compact = api.buildCompactSharePayload({
        share,
        threshold: 2,
        wordCount: 12,
        walletProfileCode,
        sessionBatchId: new Uint8Array(4),
        rbt: new Uint8Array(6)
      });
      values.push([full.payload[3], compact.payload[3]]);
    }
    return values;
  });

  expect(flags).toEqual([
    [0x00, 0x00],
    [0x08, 0x08],
    [0x10, 0x10],
    [0x18, 0x18],
    [0x20, 0x20],
    [0x28, 0x28]
  ]);
});

test('decoder validates and parses every canonical Full and Compact payload', async ({ page }) => {
  await openApp(page);
  const decoded = await page.evaluate(async (shares) => {
    const api = globalThis.DuraShare;
    const results = [];
    for (const share of shares) {
      const full = await api.decodeSharePayloadHex(share.full_payload.payload_hex);
      const compact = await api.decodeSharePayloadHex(
        share.compact_payload.payload_hex.toLowerCase().replace(/(.{8})/g, '$1 ')
      );
      results.push({
        full,
        compact
      });
    }
    return results;
  }, VECTOR.shares);

  decoded.forEach(({ full, compact }, index) => {
    const expected = VECTOR.shares[index];
    expect(full.profile).toBe('full');
    expect(full.wordShares).toEqual(expected.word_values);
    expect(full.checksumShares).toEqual(expected.row_checksums);
    expect(full.columnChecksumShares).toEqual(expected.column_checksums);
    expect(full.globalIntegrityCheckShare).toBe(expected.printed_gic);
    expect(full.checksDerived).toBe(false);
    expect(compact.profile).toBe('compact');
    expect(compact.wordShares).toEqual(expected.word_values);
    expect(compact.checksumShares).toEqual(expected.row_checksums);
    expect(compact.columnChecksumShares).toEqual(expected.column_checksums);
    expect(compact.globalIntegrityCheckShare).toBe(expected.printed_gic);
    expect(compact.checksDerived).toBe(true);
  });
});

test('decoder rejects Transport Hash, prefix, and Compact padding corruption atomically', async ({ page }) => {
  await openApp(page);
  const messages = await page.evaluate(async ({ vector, share }) => {
    const api = globalThis.DuraShare;
    const capture = async (payload) => {
      try {
        await api.decodeSharePayloadHex(payload);
        return '';
      } catch (error) {
        return error.message;
      }
    };
    const full = share.full_payload.payload_hex;
    const corruptFull = `${full.slice(0, -1)}${full.endsWith('0') ? '1' : '0'}`;
    const wrongPrefix = `5342${full.slice(4)}`;
    const synthetic = {
      shareNumber: 1,
      wordShares: new Array(15).fill(1),
      checksumShares: new Array(5).fill(0),
      columnChecksumShares: [0, 0, 0],
      globalIntegrityCheckShare: 0
    };
    const compact = api.buildCompactSharePayload({
      share: synthetic,
      threshold: 2,
      wordCount: 15,
      walletProfileCode: 5,
      sessionBatchId: new Uint8Array(4),
      rbt: new Uint8Array(6)
    });
    const paddedHex = api.bytesToHex(compact.payload);
    const corruptPadding = `${paddedHex.slice(0, -1)}1`;
    return {
      transport: await capture(corruptFull),
      prefix: await capture(wrongPrefix),
      padding: await capture(corruptPadding),
      vectorVersion: vector.version
    };
  }, {
    vector: { version: 'v0.7.0' },
    share: VECTOR.shares[0]
  });

  expect(messages.transport).toContain('Transport Hash mismatch');
  expect(messages.prefix).toContain('Only SF (Full) and SC (Compact)');
  expect(messages.padding).toContain('non-zero padding bits');
  expect(messages.vectorVersion).toBe('v0.7.0');
});

test('payload metadata enables mixed-profile RBT verification and detects mismatches', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async ({ vector, wordlist }) => {
    const api = globalThis.DuraShare;
    const full = await api.decodeSharePayloadHex(
      vector.shares[0].full_payload.payload_hex
    );
    const compact = await api.decodeSharePayloadHex(
      vector.shares[1].compact_payload.payload_hex
    );
    // Canonical public vectors use independent profile Session IDs. Build a
    // Compact payload in the Full session family for the mixed-profile test.
    const canonical = api.hexToBytes(vector.rbt.canonical_secret_material_hex);
    const compactBatch = api.hexToBytes(
      vector.rbt.full_session_batch_id_hex.slice(0, 8)
    );
    const compactRbt = await api.deriveRbt(canonical, compactBatch, 6);
    const compactSameSession = api.buildCompactSharePayload({
      share: {
        shareNumber: vector.shares[1].x,
        wordShares: vector.shares[1].word_values,
        checksumShares: vector.shares[1].row_checksums,
        columnChecksumShares: vector.shares[1].column_checksums,
        globalIntegrityCheckShare: vector.shares[1].printed_gic
      },
      threshold: 2,
      wordCount: 12,
      walletProfileCode: 5,
      sessionBatchId: compactBatch,
      rbt: compactRbt
    });
    const mixedCompact = await api.decodeSharePayloadHex(
      api.bytesToHex(compactSameSession.payload)
    );
    const shares = [
      { shareNumber: full.shareNumber, wordShares: full.wordShares },
      {
        shareNumber: mixedCompact.shareNumber,
        wordShares: mixedCompact.wordShares
      }
    ];
    const passed = await api.recoverAndValidate(shares, 12, wordlist, {
      payloadMetadata: [full, mixedCompact]
    });
    const badFull = { ...full, rbtHex: '00'.repeat(12) };
    const badCompact = { ...mixedCompact, rbtHex: '00'.repeat(6) };
    const failed = await api.recoverAndValidate(shares, 12, wordlist, {
      payloadMetadata: [badFull, badCompact]
    });
    let unrelatedSessionMessage = '';
    try {
      api.validateRecoveryPayloadSet([full, compact]);
    } catch (error) {
      unrelatedSessionMessage = error.message;
    }
    return {
      passed: passed.validation.rbt,
      failed: failed.validation.rbt,
      unrelatedSessionMessage
    };
  }, {
    vector: VECTOR,
    wordlist: getBip39WordlistForTest()
  });

  expect(result.passed.status).toBe('pass');
  expect(result.passed.checkedProfiles).toEqual(['full', 'compact']);
  expect(result.failed.status).toBe('fail');
  expect(result.unrelatedSessionMessage).toContain('same session family');
});

test('SB, SA, and raw Audit Hash evidence decode with canonical metadata', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(({ vector, share }) => {
    const api = globalThis.DuraShare;
    const fullHeader = api.buildManifestHeaderPayload({
      profile: 'full',
      wordCount: 12,
      sessionBatchId: api.hexToBytes(vector.rbt.full_session_batch_id_hex),
      rbt: api.hexToBytes(vector.rbt.full_rbt_hex)
    });
    const compactHeader = api.buildManifestHeaderPayload({
      profile: 'compact',
      wordCount: 12,
      sessionBatchId: api.hexToBytes(vector.rbt.compact_session_batch_id_hex),
      rbt: api.hexToBytes(vector.rbt.compact_rbt_hex)
    });
    const fullAudit = api.buildShareAuditPayload({
      profile: 'full',
      wordCount: 12,
      threshold: 2,
      shareNumber: 1,
      auditHash: api.hexToBytes(share.full_payload.manifest_audit_hash_hex)
    });
    const compactAudit = api.buildShareAuditPayload({
      profile: 'compact',
      wordCount: 12,
      threshold: 2,
      shareNumber: 1,
      auditHash: api.hexToBytes(share.compact_payload.manifest_audit_hash_hex)
    });
    return {
      fullHeader: api.decodeManifestHeaderPayloadHex(
        api.bytesToHex(fullHeader)
      ),
      compactHeader: api.decodeManifestHeaderPayloadHex(
        api.bytesToHex(compactHeader)
      ),
      fullAudit: api.decodeManifestAuditEvidenceHex(api.bytesToHex(fullAudit)),
      compactAudit: api.decodeManifestAuditEvidenceHex(
        api.bytesToHex(compactAudit)
      ),
      rawHash: api.decodeManifestAuditEvidenceHex(
        share.full_payload.manifest_audit_hash_hex
      )
    };
  }, {
    vector: VECTOR,
    share: VECTOR.shares[0]
  });

  expect(result.fullHeader).toMatchObject({
    profile: 'full',
    wordCount: 12,
    sessionBatchIdHex: VECTOR.rbt.full_session_batch_id_hex,
    rbtHex: VECTOR.rbt.full_rbt_hex
  });
  expect(result.compactHeader).toMatchObject({
    profile: 'compact',
    wordCount: 12,
    sessionBatchIdHex: VECTOR.rbt.compact_session_batch_id_hex,
    rbtHex: VECTOR.rbt.compact_rbt_hex
  });
  expect(result.fullAudit).toMatchObject({
    kind: 'sa',
    profile: 'full',
    threshold: 2,
    shareNumber: 1,
    committedHashBytes: 32,
    committedHashHex: VECTOR.shares[0].full_payload.manifest_audit_hash_hex
  });
  expect(result.compactAudit).toMatchObject({
    kind: 'sa',
    profile: 'compact',
    threshold: 2,
    shareNumber: 1,
    committedHashBytes: 16,
    committedHashHex:
      VECTOR.shares[0].compact_payload.manifest_audit_hash_hex.slice(0, 32)
  });
  expect(result.rawHash).toEqual({
    kind: 'hash',
    auditHashHex: VECTOR.shares[0].full_payload.manifest_audit_hash_hex,
    committedHashHex: VECTOR.shares[0].full_payload.manifest_audit_hash_hex,
    committedHashBytes: 32
  });
});

test('SB alone enables RBT verification for manually entered Share values', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async ({ vector, wordlist }) => {
    const api = globalThis.DuraShare;
    const headerBytes = api.buildManifestHeaderPayload({
      profile: 'full',
      wordCount: 12,
      sessionBatchId: api.hexToBytes(vector.rbt.full_session_batch_id_hex),
      rbt: api.hexToBytes(vector.rbt.full_rbt_hex)
    });
    const header = api.decodeManifestHeaderPayloadHex(
      api.bytesToHex(headerBytes)
    );
    const report = await api.recoverAndValidate(
      vector.shares.slice(0, 2).map(share => ({
        shareNumber: share.x,
        wordShares: share.word_values
      })),
      12,
      wordlist,
      { manifestHeaderMetadata: header }
    );
    return report.validation.rbt;
  }, {
    vector: VECTOR,
    wordlist: getBip39WordlistForTest()
  });

  expect(result.status).toBe('pass');
  expect(result.checkedProfiles).toEqual(['full']);
});

test('conflicting SB header still interpolates and leaves payload RBT in charge', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async ({ vector, wordlist }) => {
    const api = globalThis.DuraShare;
    const full = await api.decodeSharePayloadHex(
      vector.shares[0].full_payload.payload_hex
    );
    const canonical = api.hexToBytes(vector.rbt.canonical_secret_material_hex);
    const compactBatch = api.hexToBytes(
      vector.rbt.full_session_batch_id_hex.slice(0, 8)
    );
    const compactRbt = await api.deriveRbt(canonical, compactBatch, 6);
    const compactSameSession = api.buildCompactSharePayload({
      share: {
        shareNumber: vector.shares[1].x,
        wordShares: vector.shares[1].word_values,
        checksumShares: vector.shares[1].row_checksums,
        columnChecksumShares: vector.shares[1].column_checksums,
        globalIntegrityCheckShare: vector.shares[1].printed_gic
      },
      threshold: 2,
      wordCount: 12,
      walletProfileCode: 5,
      sessionBatchId: compactBatch,
      rbt: compactRbt
    });
    const mixedCompact = await api.decodeSharePayloadHex(
      api.bytesToHex(compactSameSession.payload)
    );
    const conflictingHeader = api.decodeManifestHeaderPayloadHex(
      api.bytesToHex(api.buildManifestHeaderPayload({
        profile: 'full',
        wordCount: 12,
        sessionBatchId: api.hexToBytes('00'.repeat(8)),
        rbt: api.hexToBytes('00'.repeat(12))
      }))
    );
    const report = await api.recoverAndValidate(
      [
        { shareNumber: full.shareNumber, wordShares: full.wordShares },
        {
          shareNumber: mixedCompact.shareNumber,
          wordShares: mixedCompact.wordShares
        }
      ],
      12,
      wordlist,
      {
        payloadMetadata: [full, mixedCompact],
        manifestHeaderMetadata: conflictingHeader
      }
    );
    return {
      mnemonic: report.recoveredMnemonic,
      generic: report.errors.generic,
      rbt: report.validation.rbt
    };
  }, {
    vector: VECTOR,
    wordlist: getBip39WordlistForTest()
  });

  expect(result.generic).toBeNull();
  expect(result.mnemonic).toBeTruthy();
  expect(result.rbt.status).toBe('pass');
  expect(result.rbt.hasConflict).toBe(true);
  expect(result.rbt.checkedProfiles).toEqual(['full', 'compact']);
  expect(result.rbt.outcomes).toEqual([
    {
      profile: 'full',
      sources: ['share-payload'],
      sourceLabel: 'Share #1 Full payload',
      status: 'pass'
    },
    {
      profile: 'compact',
      sources: ['share-payload'],
      sourceLabel: 'Share #2 Compact payload',
      status: 'pass'
    },
    {
      profile: 'full',
      sources: ['manifest-header'],
      sourceLabel: 'Manifest Header (SB)',
      status: 'fail'
    }
  ]);
});
