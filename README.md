# DuraShare (HTML)

[![Security: Unaudited](https://img.shields.io/badge/Security-Unaudited-orange)](https://github.com/GRIFORTIS/.github/blob/main/SECURITY.md)
[![CI](https://github.com/GRIFORTIS/durashare-html/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GRIFORTIS/durashare-html/actions/workflows/ci.yml)
[![CodeQL](https://github.com/GRIFORTIS/durashare-html/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/GRIFORTIS/durashare-html/actions/workflows/codeql.yml)
[![CI Toolchain: Node.js 24](https://img.shields.io/badge/CI%20toolchain-Node.js%2024-339933)](https://github.com/GRIFORTIS/durashare-html/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## DuraShare

**DuraShare: BIP39-Native Threshold Backup over GF(2053) with Full Manual Fallback and Per-Share Audit**

DuraShare is a human-first, software-assisted **k-of-n** threshold secret sharing protocol for BIP39 mnemonics with one arithmetic layer and two operational paths: a recommended computational deployment and a **full manual fallback**. It applies Shamir Secret Sharing over the prime field GF(2053) directly to the 1-indexed BIP39 word indices (1..2048), word by word, producing durable, human-readable shares that can be validated and recovered either by hand (modular arithmetic + precomputed Lagrange coefficients) or via an air-gapped tool (with a digital envelope). It also allows **individual geographically distributed shares to be verified** before recovery, without gathering a threshold or revealing the secret.

Key features (see [What it does and how on the spec repo](https://github.com/GRIFORTIS/durashare#what-it-does-and-how) for details):
- One math, two paths: software or fully manual (no black box, no lock-in)
- BIP39-native: split the seed you already have (no new word list, no moving funds)
- Flexible k-of-n, from common 2-of-3 setups to advanced high-threshold schemes; fewer than k shares reveal nothing
- Optional nesting: groups of groups with individual k-of-n each (up to 4 layers)
- Human-readable shares: print secret-bearing material only to an offline, non-network printer, or copy by hand
- Built-in error detection: detects any passive copy mistake or damage affecting up to 3 cells per share
- Per-share audit: authenticate one share where it lives, without gathering the others or revealing the secret
- Post-recovery checks including wallet derivation and BIP39 passphrase (passphrase is not stored and demands its own backup)

DuraShare **modifies existing, well-established cryptographic techniques** for human-friendly threshold backup. Reference implementations are thoroughly tested, published in good faith **as is**, and have **not** been independently audited. See [Disclaimer](#disclaimer).

> **HTML implementation status:** This implementation is a work in progress. The DuraShare overview above describes the protocol as a whole; not every listed feature is currently available here. See [Compatibility](#compatibility) for the exact supported scope.

## What is this?

**Single-file, air-gapped HTML implementation of DuraShare**

A single-file, air-gapped tool for splitting a Bitcoin recovery phrase into **k-of-n** threshold shares and recovering it. Software guides Sharing and Recovery with no installation, no internet connection, and no vendor account required. Open the verified file on any air-gapped computer and run.

For high-security environments, run from a [Tails OS](https://tails.boum.org/) session booted from a USB stick.

---

**In this HTML implementation, you can:**

- Split a BIP39 mnemonic into \(k\)-of-\(n\) shares
- Recover the original BIP39 mnemonic from \(k\) shares
- Validate inputs and share integrity during split/recovery to prevent silent mistakes

**Key properties:**
- Single file (all CSS/JS inline)
- No external dependencies at runtime
- Offline-capable by design

---

## Links

- **Canonical specification**: [durashare](https://github.com/GRIFORTIS/durashare)
  - Standing review guide: [docs/review](https://github.com/GRIFORTIS/durashare/blob/main/docs/review.md)
- **Whitepaper**: [PDF (latest)](https://github.com/GRIFORTIS/durashare/releases/latest/download/WHITEPAPER.pdf) | [Releases](https://github.com/GRIFORTIS/durashare/releases) | [LaTeX](https://github.com/GRIFORTIS/durashare/blob/main/whitepaper/WHITEPAPER.tex)
- **Test vectors**: [TEST_VECTORS](https://github.com/GRIFORTIS/durashare/blob/main/test_vectors/README.md)
- **Related implementations**:
  - JavaScript/TypeScript: [durashare-js](https://github.com/GRIFORTIS/durashare-js)
  - Python: [durashare-py](https://github.com/GRIFORTIS/durashare-py)
- **Security**: [SECURITY](https://github.com/GRIFORTIS/.github/blob/main/SECURITY.md)

---

## Security

This tool implements well-established cryptographic principles but has **NOT** been professionally audited.

**Use only for**: testing, learning, experimentation.

**Canonical security posture**: [SECURITY](https://github.com/GRIFORTIS/.github/blob/main/SECURITY.md)

---

## Verify Before Use (Required)

**CRITICAL**: Before using with real crypto seeds, verify the HTML file hasn't been tampered with.

### 1. Import GRIFORTIS Public Key (One-Time)

```bash
curl -fsSL https://raw.githubusercontent.com/GRIFORTIS/durashare/main/GRIFORTIS-PGP-PUBLIC-KEY.asc | gpg --import
```

**Verify fingerprint:**
```bash
gpg --fingerprint security@grifortis.com
```

**Expected**: `7921 FD56 9450 8DA4 020E  671F 4CFE 6248 C57F 15DF`

### 2. Download Release Files

```bash
# Replace VERSION with actual release (e.g., v0.5.0)
VERSION="v0.5.0"
curl -fsSL -O "https://github.com/GRIFORTIS/durashare-html/releases/download/${VERSION}/durashare.html"
curl -fsSL -O "https://github.com/GRIFORTIS/durashare-html/releases/download/${VERSION}/durashare.html.asc"
```

> **Note:** HTML **v0.4.1** release assets used the filename `schiavinato_sharing.html`. From **v0.5.0** the artifact is `durashare.html`.

### 3. Verify GPG Signature

```bash
gpg --verify durashare.html.asc durashare.html
```

**Expected output**: `Good signature from "GRIFORTIS <security@grifortis.com>"`

### 4. Verify Checksum (Optional but Recommended)

```bash
curl -fsSL -O "https://github.com/GRIFORTIS/durashare-html/releases/download/${VERSION}/CHECKSUMS.txt"
curl -fsSL -O "https://github.com/GRIFORTIS/durashare-html/releases/download/${VERSION}/CHECKSUMS.txt.asc"
gpg --verify CHECKSUMS.txt.asc CHECKSUMS.txt
sha256sum --check CHECKSUMS.txt --ignore-missing
```

---

## Usage

1. Open `durashare.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Follow on-screen instructions to split or recover mnemonics
3. **Use offline only** — disconnect from all networks before proceeding

**No installation, no dependencies, no network connection required.**

**For maximum security**, run from a [Tails OS](https://tails.boum.org/) session booted from a USB drive. Tails leaves no traces on the host computer, ensures a clean trusted environment, and works on any laptop without installation. Copy the verified HTML file onto the USB stick, boot Tails, open the file locally, and run the ceremony fully air-gapped. When finished: **clear on-screen fields or close the page** everywhere; **on Tails, also shut down** — OS memory wipe on shutdown is the real amnesia control. The page cannot guarantee erasure of secrets from browser RAM.

---

## For Developers

See [`TESTING`](./TESTING.md) for local test commands (CI parity), including Playwright installation and optional UI mode.

Maintainers: see [`RELEASE.md`](./RELEASE.md) for the signed-tag release process and automated verify gate.

---

## Conformance Validation

This implementation is validated against canonical test vectors:
- [TEST_VECTORS](https://github.com/GRIFORTIS/durashare/blob/main/test_vectors/README.md)

Tests run automatically in CI on every push/PR.

---

## Compatibility

- **HTML tool version**: v0.5.0 (`package.json` / UI footer)
- **What this tool is**: the **arithmetic share-table subset** (split/recover with position-bound row/column checksums and printed GIC), validated against frozen `previous_versions/v0.5.0/` vectors
- **What this tool is not**: the complete DuraShare protocol — no digital envelope / Bech32m QR payloads, no MAT, no Manifest Audit Hash, no RBT/RVA, and other living-spec surfaces remain out of scope here
- **BIP39 word counts**: 12, 15, 18, 21, 24
- **Threshold schemes**: 2-of-3, 2-of-4, 3-of-5
- **Breaking vs HTML v0.4.1**: v0.4.1 shares need the **v0.4.1 tool** (`schiavinato_sharing.html`, still published on that release). New releases ship `durashare.html`
- **Browser requirements**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

---

## Contributing

See [CONTRIBUTING](https://github.com/GRIFORTIS/.github/blob/main/CONTRIBUTING.md).

## People

### Renato Schiavinato Lopez — Founder & Protocol Author
- Creator of DuraShare.
- [LinkedIn](https://www.linkedin.com/in/renato-agile-coach/) · [GitHub](https://github.com/renatoslopes)

### Jeroen van de Graaf — Chief Scientist; Advisory Board
- Professor, DCC–UFMG. Cryptographer (ZK, MPC, privacy, applied protocols); PhD, Université de Montréal (1997).
- [DCC/UFMG](https://dcc.ufmg.br/professor/jeroen-van-de-graaf/) · [DBLP](https://dblp.org/pid/27/6925.html) · [Lattes](http://lattes.cnpq.br/0069989873499216) · [Google Scholar](https://scholar.google.com.br/citations?user=-w8olWwAAAAJ)

## License

[MIT License](LICENSE)

## Disclaimer

Software has been thoroughly tested and is not known to contain errors. It is made available in good faith, as is, so use at your own risk. The author does not assume any responsibility for any damage, financial or other, that may result from using this software. Reference implementations have not been independently audited. **Do not use with real funds.** See [SECURITY](https://github.com/GRIFORTIS/.github/blob/main/SECURITY.md).

---

**Maintained by**: [GRIFORTIS](https://github.com/GRIFORTIS)
