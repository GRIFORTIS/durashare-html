# Changelog

All notable changes to the **HTML implementation** will be documented in this file.

Protocol/spec changes belong in the canonical repo:
- [schiavinato-sharing](https://github.com/GRIFORTIS/schiavinato-sharing)

## Unreleased

### Changed
- Conformance tests use frozen `previous_versions/v0.5.0/test_vectors/vectors.json` (position-bound row checksums, column checksums, printed GIC in table footer).
- Recovery helpers fill and extract Col1–Col3 and GIC table cells; GIC binding tests cover all three cross-check paths.
- Share generation allows zero highest polynomial coefficients (mocked RNG tests verify split/recover still works).
- Ignore `release-assets/` in git (local signing staging only; published files live on GitHub Releases).

## 0.4.1 - 2026-05-16

### Added
- Word-count support: 12/15/18/21/24, with an expandable word-count selector (More/Less) in both Create and Recover flows.
- Canonical conformance coverage: `tests/canonical-vectors.v0.4.1.spec.js` (recovery-only) against the spec repo vectors.
- CI pins `GRIFORTIS/schiavinato-sharing@v0.5.0` for frozen v0.4.1 vectors under `previous_versions/v0.4.1/`; `SCHIAVINATO_SHARING_SPEC_REPO_PATH` set in workflows.
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
- Repo reorg: migrated the single-file HTML implementation and Playwright test suite into `schiavinato-sharing-html/`.
- DevSecOps automation: CI, CodeQL, and signed release workflows.

### Changed
- Implemented dual-path checksum validation and explicit path mismatch surfacing (implementation behavior; see canonical changelog for the normative spec notes).
- Implemented Global Integrity Check (GIC) binding to share number `x` (printed GIC = sum + x mod 2053).
- Terminology alignment: "Global Checksum" → "Global Integrity Check (GIC)".
