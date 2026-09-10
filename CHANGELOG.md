# Changelog

All notable changes to the **HTML implementation** will be documented in this file.

Protocol/spec changes belong in the canonical repo:
- [durashare](https://github.com/GRIFORTIS/durashare)

## [Unreleased]

## 0.6.0 - 2026-09-10

HTML **v0.6.0** implements the arithmetic, Manual Authentication (MAT), and
hexadecimal Full/Compact digital-envelope subset validated against the frozen
DuraShare protocol **v0.7.0** vectors. It also preserves recovery-only
compatibility with frozen HTML v0.5.0 share-table vectors.

This release does **not** claim complete protocol v0.7.0 parity. Bech32m/QR
rendering and scanning are not implemented, and RVA is recorded as
human-readable recovery context rather than verified through wallet derivation.

### Security
- Hard-stop CSPRNG smoke tests before share generation and manual sharding Random Again: require working `crypto.getRandomValues`, reject sentinel no-ops, constant-filled byte bursts, and identical consecutive bursts. Never fall back to `Math.random`.
- Ceremony coefficient canary: refuse batches where all coefficients are identical (size ≥ 2) or any value repeats ≥ 6 times; no silent redraw — modal abort only.
- Failures surface via the Secure Randomness Failed modal; shares are not displayed.
- RNG failures use typed `RngHardStopError` (UI keys off `isRngHardStopError`, not message prefixes). Native `getRandomValues` throws are mapped to the same hard-stop.
- Rejection sampling hard-stops after 8 consecutive rejected draws instead of allowing a broken provider to hang the ceremony.
- Smoke / field-draw scratch buffers and ceremony coefficient scratch (including canary abort paths) are best-effort cleared in `finally`.
- Partial polynomial construction clears its own secret-bearing scratch if an RNG failure interrupts a draw.

### Changed
- Recovery Confidence and Backup Kit Health summary bars now show the same pass / problem / not-checked mix as their evidence families, instead of a single solid state color.
- Recovery Confidence now treats RBT as one any-match decision, while Backup Kit Health reports every supplied RBT-bearing Share payload and Manifest Header separately and identifies mismatching artifacts.
- Recovery now shows the interpolated candidate when all required Share inputs are valid, without a confirmation gate. Recovery Confidence evaluates RBT and BIP39; Backup Kit Health separately reports Manifest Audit, MAT, payload-integrity, Share-checksum, SB, and RBT-artifact consistency.
- CI and release workflows use minimally upgraded, SHA-pinned Node.js 24-native action releases; CI uses one Node.js 24 toolchain behind a stable `CI Gate` instead of version-specific required checks.
- CodeQL advanced setup uses SHA-pinned CodeQL Action v4.37.7 on Node.js 24 instead of deprecated v3.

### Added
- Single- or dual-column Manual Authentication (MAT), with Whole-Key and Split-Key Manifests and optional recovery-time auditing of complete tag/key rows.
- Full and Compact hexadecimal Share payloads, Manifest Session Headers (SB), Share Audit payloads (SA), Manifest Audit Hashes, Session Batch IDs, profile-length Recovery Binding Tags (RBT), and free-text RVA/verification notes.
- Recovery-time hexadecimal payload import, atomic population, Transport Hash and arithmetic validation, cross-Share session checks, and independent artifact-health reporting.

### Fixed
- Recovery Manifest Audit evidence no longer stays green after the Share payload fails Transport Hash (or other decode) checks; leaving the audit field does not re-mark it valid over an invalid payload.
- Published-release verification now requires the current stable `CI Gate`, Secret Scanning, and CodeQL analysis contexts instead of obsolete version-specific Node.js checks.
- CI test reliability: run each GIC-binding scheme as an independent case and read each rendered Share card in one validated browser pass, preserving the same UI assertions without exceeding the per-test timeout.
- CI dependency audit: update transitive `brace-expansion` to 5.0.9 and `js-yaml` to 4.3.2 (development tooling only; no change to the standalone `durashare.html` runtime).

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

### Added
- CI lints product JS: extract inline `<script>` from `durashare.html` and run ESLint (`npm run lint:html`).
- CI fails closed if the CodeQL workflow is not `active` (guards against silent `disabled_inactivity`).
- CodeQL workflow supports `workflow_dispatch` for manual re-runs.

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
