# Changelog

All notable changes to the **HTML implementation** will be documented in this file.

Protocol/spec changes belong in the canonical repo:
- [durashare](https://github.com/GRIFORTIS/durashare)

## 0.5.0 - 2026-07-27

HTML **v0.5.0** is the **arithmetic share-table subset** validated against frozen
`previous_versions/v0.5.0/test_vectors/` (position-bound row checksums, column
checksums, and printed GIC). It is **not** full protocol **v0.7.0** (no digital
envelope / Bech32m QR, MAT, Manifest Audit Hash, RBT/RVA, etc.).

**Breaking vs HTML v0.4.1:** v0.4.1 shares need the **v0.4.1 tool**
(`schiavinato_sharing.html`). Keep that GitHub Release published under the old
filenames. From v0.5.0 the published artifact is `durashare.html`. Do not mix
versions; recreate shares with this tool only if migrating deliberately.

### Changed
- Renamed brand from Schiavinato Sharing to **DuraShare**: tool file `durashare.html`, UI/docs, repo URLs (`GRIFORTIS/durashare-html`), CI env `DURASHARE_SPEC_REPO_PATH`, and primary JS API `globalThis.DuraShare` (**temporary** `globalThis.SchiavinatoSharing` alias retained for this release / rename window).
- Conformance tests and recovery helpers target frozen `previous_versions/v0.5.0/test_vectors/vectors.json` (position-bound row checksums, column checksums, printed GIC in table footer).
- Recovery helpers fill and extract Col1–Col3 and GIC table cells; GIC binding tests cover all three cross-check paths.
- Share generation allows zero highest polynomial coefficients (mocked RNG tests verify split/recover still works).
- Ignore `release-assets/` in git (local signing staging only; published files live on GitHub Releases).
- Manual Sharding helper docs: BIP39 indices are one-indexed (abandon = 1 … 2048), matching `splitBip39`.
- Sensitive-data handling: removed ineffective `wipeString`; renamed array clear to `clearSensitiveArray` with honest best-effort wording; clear create-flow seed inputs after share generation and recover-flow inputs after seed display; document clear/close when finished everywhere, plus Tails shutdown for OS memory wipe.
- Add a restrictive Content-Security-Policy meta (`default-src 'none'`, inline script/style only, `connect-src 'none'`) for air-gapped single-file hardening.
- Publish `DuraShare` on `globalThis` so Playwright mock-RNG injection does not depend on classic-script lexical scope.

### Fixed
- `getRandomIntInclusive` rejects `max > 2^32 - 1` to avoid a rejection-sampling hang when `limit === 0`.
- CI `npm audit --audit-level=high`: pin transitive `js-yaml@4.3.0` and `brace-expansion@5.0.8` via `package.json` overrides (devDependency chain only; does not affect `durashare.html`).
- CI/release workflows pin `GRIFORTIS/durashare@v0.6.0` so `previous_versions/v0.5.0/` vectors exist (absent on tag `v0.5.0` itself).

## 0.4.1 - 2026-05-16

### Added
- Word-count support: 12/15/18/21/24, with an expandable word-count selector (More/Less) in both Create and Recover flows.
- Canonical conformance coverage: `tests/canonical-vectors.v0.4.1.spec.js` (recovery-only) against the spec repo vectors.
- CI pins `GRIFORTIS/schiavinato-sharing@v0.5.0` for frozen v0.4.1 vectors under `previous_versions/v0.4.1/`; `SCHIAVINATO_SHARING_SPEC_REPO_PATH` set in workflows (pre-rename identifiers).
- Per-share pre-flight validation (row checksum + GIC) and a Lagrange sanity check for share numbers, with targeted UI highlighting.
- `RELEASE.md`, `docs/release-verification.md`, and fail-closed **Release Verify** workflow (no CI signing keys).
- Published `GRIFORTIS-PGP-PUBLIC-KEY.asc` for offline signature verification.

### Changed
- Share display format to `0001-word` while keeping input parsing backward compatible (also accepts `word-0001`).
- Transport parsing and validation rules to match the v0.4.1 canonical vectors expectations.
- Release model: local GPG sign + manual upload; GitHub Actions verifies CI gates, signatures, checksums, and re-runs conformance tests.

### Fixed
- Share generation: enforce non-zero highest polynomial coefficients in GF(2053) (prevents degree collapse when entropy source fails).
- Inline Global Integrity Check (GIC) binding now uses the entered share number and validates against both word sum and checksum sum.

### Removed
- Repo-local `.github/SECURITY.md` and `.github/CONTRIBUTING.md` duplicates in favor of org-wide defaults in `GRIFORTIS/.github`.
- CI-based GPG signing and automated release uploads from GitHub Actions.

## 0.4.0 - 2026-01-31

This repo begins at **v0.4.0**. Earlier history for the HTML reference implementation lived in the canonical repo under `reference-implementation/`.

### Added
- Repo reorg: migrated the single-file HTML implementation and Playwright test suite into `schiavinato-sharing-html/` (repository later renamed to `durashare-html`).
- DevSecOps automation: CI, CodeQL, and signed release workflows.

### Changed
- Implemented dual-path checksum validation and explicit path mismatch surfacing (implementation behavior; see canonical changelog for the normative spec notes).
- Implemented Global Integrity Check (GIC) binding to share number `x` (printed GIC = sum + x mod 2053).
- Terminology alignment: "Global Checksum" → "Global Integrity Check (GIC)".
