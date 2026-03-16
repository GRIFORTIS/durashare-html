# Schiavinato Sharing (HTML)

[![Security: Experimental](https://img.shields.io/badge/Security-⚠️%20EXPERIMENTAL%20⚠️-red)](https://github.com/GRIFORTIS/.github/blob/main/SECURITY.md)
[![CI](https://github.com/GRIFORTIS/schiavinato-sharing-html/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GRIFORTIS/schiavinato-sharing-html/actions/workflows/ci.yml)
[![CodeQL](https://github.com/GRIFORTIS/schiavinato-sharing-html/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/GRIFORTIS/schiavinato-sharing-html/actions/workflows/codeql.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> ## ⚠️ WARNING: EXPERIMENTAL SOFTWARE ⚠️
> 
>DO NOT USE IT FOR REAL FUNDS!
>
> Schiavinato Sharing specification and implementations have NOT been audited. Use for testing, learning, and experimentation only. See [SECURITY](https://github.com/GRIFORTIS/.github/blob/main/SECURITY.md) for details.
>
>We invite **cryptographers** and **developers** to review the spec and software. See [CONTRIBUTING](https://github.com/GRIFORTIS/.github/blob/main/CONTRIBUTING.md) to know more.

**Single-file, air-gapped HTML implementation of Schiavinato Sharing**

Human-executable secret sharing for BIP39 mnemonics using GF(2053). Runs entirely offline in any modern browser with no installation or network connection required.

---

## What is this?

**Schiavinato Sharing** is a dual-mode (**manual + software**) \(k\)-of-\(n\) threshold secret sharing scheme for **BIP39 mnemonics**. It operates directly on the **1-indexed BIP39 word indices** over the prime field **GF(2053)**, so the recovered secret is a standard BIP39 mnemonic compatible with modern wallets.

**In this HTML implementation, you can:**

- Split a BIP39 mnemonic into \(k\)-of-\(n\) shares
- Recover the original BIP39 mnemonic from \(k\) shares
- Validate inputs and share integrity during split/recovery to prevent silent mistakes

It is a self-contained HTML/JavaScript application implementing the Schiavinato Sharing scheme. Designed for offline/air-gapped environments where computational convenience is preferred over manual math, but network access or software dependencies are unavailable or untrusted.

**Key properties:**
- Single file (all CSS/JS inline)
- No external dependencies at runtime
- Offline-capable by design

---

## Links

- **Canonical protocol + specs**: [schiavinato-sharing](https://github.com/GRIFORTIS/schiavinato-sharing)
- **Whitepaper**: [PDF (latest)](https://github.com/GRIFORTIS/schiavinato-sharing/releases/latest/download/WHITEPAPER.pdf) | [Releases (versioned PDF)](https://github.com/GRIFORTIS/schiavinato-sharing/releases) | [LaTeX](https://github.com/GRIFORTIS/schiavinato-sharing/blob/main/whitepaper/WHITEPAPER.tex)
- **Test Vectors**: [TEST_VECTORS](https://github.com/GRIFORTIS/schiavinato-sharing/blob/main/test_vectors/README.md)
- **JavaScript library**: [schiavinato-sharing-js](https://github.com/GRIFORTIS/schiavinato-sharing-js)
- **Python library**: [schiavinato-sharing-py](https://github.com/GRIFORTIS/schiavinato-sharing-py)

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
curl -fsSL https://raw.githubusercontent.com/GRIFORTIS/schiavinato-sharing/main/GRIFORTIS-PGP-PUBLIC-KEY.asc | gpg --import
```

**Verify fingerprint:**
```bash
gpg --fingerprint security@grifortis.com
```

**Expected**: `7921 FD56 9450 8DA4 020E  671F 4CFE 6248 C57F 15DF`

### 2. Download Release Files

```bash
# Replace VERSION with actual release (e.g., v0.4.0)
VERSION="v0.4.0"
curl -fsSL -O "https://github.com/GRIFORTIS/schiavinato-sharing-html/releases/download/${VERSION}/schiavinato_sharing.html"
curl -fsSL -O "https://github.com/GRIFORTIS/schiavinato-sharing-html/releases/download/${VERSION}/schiavinato_sharing.html.asc"
```

### 3. Verify GPG Signature

```bash
gpg --verify schiavinato_sharing.html.asc schiavinato_sharing.html
```

**Expected output**: `Good signature from "GRIFORTIS <security@grifortis.com>"`

### 4. Verify Checksum (Optional but Recommended)

```bash
curl -fsSL -O "https://github.com/GRIFORTIS/schiavinato-sharing-html/releases/download/${VERSION}/CHECKSUMS.txt"
curl -fsSL -O "https://github.com/GRIFORTIS/schiavinato-sharing-html/releases/download/${VERSION}/CHECKSUMS.txt.asc"
gpg --verify CHECKSUMS.txt.asc CHECKSUMS.txt
sha256sum --check CHECKSUMS.txt --ignore-missing
```

---

## Usage

1. Open `schiavinato_sharing.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Follow on-screen instructions to split or recover mnemonics
3. **Use offline only** — disconnect from all networks before proceeding

**No installation, no dependencies, no network connection required.**

---

## For Developers

See [`TESTING`](./TESTING.md) for local test commands (CI parity), including Playwright installation and optional UI mode.

---

## Conformance Validation

This implementation is validated against canonical test vectors:
- [TEST_VECTORS](https://github.com/GRIFORTIS/schiavinato-sharing/blob/main/test_vectors/README.md)

Tests run automatically in CI on every push/PR.

---

## Compatibility

- **Spec version**: v0.4.1 (non-digital-payload subset)
- **BIP39 word counts**: 12, 15, 18, 21, 24
- **Threshold schemes**: 2-of-3, 2-of-4, 3-of-5
- **Digital payload (Bech32m/QR/Identity+Transport locks)**: not implemented in the HTML tool
- **Browser requirements**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

---

## Contributing

When contributing:
- Maintain single-file, self-contained design
- Add/update tests for any behavioral changes
- Run full test suite before submitting PR

See [CONTRIBUTING](https://github.com/GRIFORTIS/.github/blob/main/CONTRIBUTING.md) to know more.

---

## License

[MIT License](LICENSE)

---

**Made by [GRIFORTIS](https://github.com/GRIFORTIS)** — Open-source tools for sovereign crypto self-custody
