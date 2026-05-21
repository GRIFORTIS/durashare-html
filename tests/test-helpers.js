import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HTML_PATH = resolve(__dirname, '..', 'schiavinato_sharing.html');

const FIELD_PRIME = 2053;
const COLUMN_TAGS = [10, 20, 30];
const COLUMN_TOTAL = 60;

let cachedWordlist = null;

function mod(n) {
  return ((n % FIELD_PRIME) + FIELD_PRIME) % FIELD_PRIME;
}

function computeRowTotal(rowCount) {
  return (rowCount * (rowCount + 1)) / 2;
}

/**
 * v0.5.0 position-bound row checksums: (w1 + w2 + w3 + rowNumber) mod 2053.
 */
export function computeRowChecksums(wordValues) {
  const rowCount = wordValues.length / 3;
  const checksums = [];
  for (let row = 0; row < rowCount; row++) {
    let sum = 0;
    for (let w = 0; w < 3; w++) {
      sum = mod(sum + Number(wordValues[row * 3 + w]));
    }
    checksums.push(mod(sum + (row + 1)));
  }
  return checksums;
}

/**
 * v0.5.0 column checksums: sum(column words) + tag (10/20/30) mod 2053.
 */
export function computeColumnChecksums(wordValues) {
  const rowCount = wordValues.length / 3;
  const checksums = [];
  for (let col = 0; col < 3; col++) {
    let sum = 0;
    for (let row = 0; row < rowCount; row++) {
      sum = mod(sum + Number(wordValues[row * 3 + col]));
    }
    checksums.push(mod(sum + COLUMN_TAGS[col]));
  }
  return checksums;
}

/**
 * v0.5.0 printed GIC: (sum(words) + rowTotal + columnTotal + shareNumber) mod 2053.
 */
export function computePrintedGic(wordValues, shareNumber) {
  const rowCount = wordValues.length / 3;
  const wordSum = wordValues.reduce((acc, v) => mod(acc + Number(v)), 0);
  const unbound = mod(wordSum + computeRowTotal(rowCount) + COLUMN_TOTAL);
  return mod(unbound + Number(shareNumber));
}

function getWordlist() {
  if (cachedWordlist) return cachedWordlist;
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/const BIP39_WORDLIST = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('Could not locate BIP39_WORDLIST in schiavinato_sharing.html');
  }
  cachedWordlist = JSON.parse(`[${match[1]}]`);
  return cachedWordlist;
}

export function getDeterministicMnemonic(wordCount) {
  const allowedCounts = [12, 15, 18, 21, 24];
  if (!allowedCounts.includes(wordCount)) {
    throw new Error(`Unsupported word count for test mnemonic: ${wordCount}`);
  }
  const entropyBits = (wordCount / 3) * 32;
  const checksumBits = entropyBits / 32;
  const entropyBytes = Buffer.alloc(entropyBits / 8, 0);
  const hash = crypto.createHash('sha256').update(entropyBytes).digest();
  const bits = Array.from(entropyBytes)
    .map(byte => byte.toString(2).padStart(8, '0'))
    .join('') +
    Array.from(hash)
      .map(byte => byte.toString(2).padStart(8, '0'))
      .join('')
      .slice(0, checksumBits);

  const wordlist = getWordlist();
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    const start = i * 11;
    const index = parseInt(bits.slice(start, start + 11), 2);
    words.push(wordlist[index]);
  }
  return words.join(' ');
}

/**
 * Open the app and accept the disclaimer
 */
export async function openApp(page) {
  const fileUrl = `file://${HTML_PATH}`;

  await page.goto(fileUrl);
  await page.waitForSelector('#pageLanding', { state: 'visible' });
  await page.click('label[for="disclaimer-checkbox"]');
  await page.waitForTimeout(100);
  await page.click('#btn-continue-to-home');
  await page.waitForSelector('#pageHome', { state: 'visible' });
}

export async function navigateToCreateShares(page) {
  await page.click('#btn-go-to-create');
  await page.waitForSelector('#pageCreate1', { state: 'visible' });
}

export async function navigateToRecoverFromHome(page) {
  await page.click('#btn-go-to-recover');
  await page.waitForSelector('#pageRecover1', { state: 'visible' });
}

export async function select12Words(page) {
  await selectCreateWordCount(page, 12);
}

export async function select24Words(page) {
  await selectCreateWordCount(page, 24);
}

async function ensureWordCountButtonVisible(page, buttonSelector, toggleSelector) {
  const visible = await page.isVisible(buttonSelector).catch(() => false);
  if (!visible) {
    await page.click(toggleSelector);
    await page.waitForSelector(buttonSelector, { state: 'visible' });
  }
}

export async function selectCreateWordCount(page, wordCount) {
  const buttonSelector = `#btn-${wordCount}-words`;
  if ([15, 18, 21].includes(wordCount)) {
    await ensureWordCountButtonVisible(page, buttonSelector, '#btn-wordcount-toggle-create');
  }
  await page.click(buttonSelector);
  await page.waitForSelector(`#word-${wordCount}`, { state: 'visible' });
}

export async function fillMnemonic(page, mnemonic) {
  const words = mnemonic.split(' ');

  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new Error(`Expected 12, 15, 18, 21, or 24 words, got ${words.length}`);
  }

  for (let i = 0; i < words.length; i++) {
    const inputId = `#word-${i + 1}`;
    await page.waitForSelector(inputId, { state: 'visible' });
    await page.fill(inputId, words[i]);
  }
}

export async function selectScheme(page, scheme) {
  await page.click(`label[for="scheme-${scheme}"]`);
}

export async function generateShares(page) {
  await page.click('#btn-generate-shares');
  await page.waitForSelector('#pageCreate2', { state: 'visible' });
  await page.waitForSelector('.share-card', { state: 'visible' });
}

/**
 * Pin the HTML tool's random source. Pass the body of getRandomValues, e.g. `arr.fill(0);`.
 */
export async function configureMockRandomSource(page, fillStatement) {
  await page.evaluate((statement) => {
    const api =
      globalThis.SchiavinatoSharing ??
      globalThis.Function(
        'return (typeof SchiavinatoSharing !== "undefined") ? SchiavinatoSharing : undefined;'
      )();

    if (!api?.configureEnvironment) {
      throw new Error('SchiavinatoSharing.configureEnvironment not available in page context');
    }

    api.configureEnvironment({
      randomSource: {
        getRandomValues: new Function('arr', statement)
      }
    });
  }, fillStatement);
}

function extractNumericFromShareText(text) {
  if (!text) return '';
  const normalized = text.trim();
  const parts = normalized.split('-').map(part => part.trim());
  if (parts.length === 2) {
    if (/^\d+$/.test(parts[0])) return parts[0];
    if (/^\d+$/.test(parts[1])) return parts[1];
  }
  const match = normalized.match(/(\d+)/);
  return match ? match[1] : '';
}

/**
 * Extract share data from a share card (v0.5.0 table: words, row checksums, Col1–3, GIC).
 */
export async function extractShareData(page, shareIndex) {
  const shareCards = await page.$$('.share-card');
  const shareCard = shareCards[shareIndex];

  if (!shareCard) {
    throw new Error(`Share card ${shareIndex} not found`);
  }

  const metadataTexts = await shareCard.$$eval('.share-metadata p', elements =>
    elements.map(el => el.textContent)
  );

  const shareNumberLine = metadataTexts.find(text => text.includes('Share Number (X):'));
  const shareNumber = shareNumberLine.match(/:\s*(\d+)/)[1];

  const wordItems = await shareCard.$$('.share-word-item');
  const words = [];
  const checksums = [];
  const columnChecksums = [];
  let globalIntegrityCheck = null;

  for (const item of wordItems) {
    const label = await item.$eval('label', el => el.textContent);
    const codeText = await item.$eval('code', el => el.textContent);
    const code = extractNumericFromShareText(codeText);

    if (label.startsWith('GIC')) {
      globalIntegrityCheck = code;
    } else if (label.startsWith('Col')) {
      columnChecksums.push(code);
    } else if (label.startsWith('C')) {
      checksums.push(code);
    } else {
      words.push(code);
    }
  }

  if (globalIntegrityCheck === null) {
    throw new Error(`Share card ${shareIndex} is missing a GIC table cell`);
  }
  if (columnChecksums.length !== 3) {
    throw new Error(`Share card ${shareIndex} expected 3 column checksums, got ${columnChecksums.length}`);
  }

  return {
    shareNumber,
    globalIntegrityCheck,
    words,
    checksums,
    columnChecksums
  };
}

export async function navigateToRecover(page) {
  await page.click('#btn-start-over-create');
  await page.click('#modal-confirm');
  await page.waitForSelector('#pageLanding', { state: 'visible' });
  await page.click('label[for="disclaimer-checkbox"]');
  await page.waitForTimeout(100);
  await page.click('#btn-continue-to-home');
  await page.waitForSelector('#pageHome', { state: 'visible' });
  await page.click('#btn-go-to-recover');
  await page.waitForSelector('#pageRecover1', { state: 'visible' });
}

export async function setupRecovery(page, wordCount, k) {
  const buttonSelector = `#recover-btn-${wordCount}-words`;
  if ([15, 18, 21].includes(wordCount)) {
    await ensureWordCountButtonVisible(page, buttonSelector, '#btn-wordcount-toggle-recover');
  }
  await page.click(buttonSelector);
  await page.click(`label[for="recover-k-${k}"]`);
  await page.waitForTimeout(200);
  await page.waitForSelector('#recover-x-1', { state: 'visible' });
}

/**
 * Fill recovery share data (words, row checksums, column checksums, GIC footer cell).
 */
export async function fillRecoveryShare(page, shareIndex, shareData) {
  await page.fill(`#recover-x-${shareIndex}`, shareData.shareNumber);
  await page.fill(`#recover-share-${shareIndex}-gic`, shareData.globalIntegrityCheck);

  const numRows = shareData.words.length / 3;

  for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
    for (let wordIdx = 0; wordIdx < 3; wordIdx++) {
      const wordPosition = rowIndex * 3 + wordIdx;
      const inputId = `#recover-share-${shareIndex}-row-${rowIndex}-word-${wordIdx}`;
      await page.fill(inputId, shareData.words[wordPosition]);
    }

    const checksumId = `#recover-share-${shareIndex}-row-${rowIndex}-checksum`;
    await page.fill(checksumId, shareData.checksums[rowIndex]);
  }

  for (let col = 0; col < 3; col++) {
    const columnId = `#recover-share-${shareIndex}-column-${col}`;
    const columnValue = shareData.columnChecksums?.[col];
    if (columnValue === undefined) {
      throw new Error(`Share ${shareIndex} is missing column checksum Col${col + 1}`);
    }
    await page.fill(columnId, columnValue);
  }
}

export async function recoverWallet(page) {
  await page.click('#btn-recover-wallet');
  await page.waitForSelector('#pageRecover2', { state: 'visible' });
}

export async function getRecoveredMnemonic(page) {
  const codeElements = await page.$$('#pageRecover2 .share-word-item code');

  const words = [];
  for (const element of codeElements) {
    const text = await element.textContent();
    words.push(text.trim());
  }

  return words.join(' ');
}

export function modifyShareValue(value) {
  const num = parseInt(value, 10);
  const modified = (num + 1) % FIELD_PRIME;
  return modified.toString().padStart(4, '0');
}

/**
 * Build a share object for recovery tests. When checksums/GIC are omitted, v0.5.0 values are derived.
 */
export function createSyntheticShare(
  shareNumber,
  globalIntegrityCheck,
  wordValues,
  checksumValues = null,
  columnChecksumValues = null
) {
  const numericWords = wordValues.map(v => Number(v));
  const checksums = (checksumValues ?? computeRowChecksums(numericWords)).map(v =>
    String(v).padStart(4, '0')
  );
  const columnChecksums = (columnChecksumValues ?? computeColumnChecksums(numericWords)).map(v =>
    String(v).padStart(4, '0')
  );
  const gic =
    globalIntegrityCheck === null || globalIntegrityCheck === undefined
      ? String(computePrintedGic(numericWords, shareNumber)).padStart(4, '0')
      : String(globalIntegrityCheck).padStart(4, '0');

  return {
    shareNumber: String(shareNumber),
    globalIntegrityCheck: gic,
    words: numericWords.map(v => String(v).padStart(4, '0')),
    checksums,
    columnChecksums
  };
}
