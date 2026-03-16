# Changelog

All notable changes to the **HTML implementation** will be documented in this file.

Protocol/spec changes belong in the canonical repo:
- [schiavinato-sharing](https://github.com/GRIFORTIS/schiavinato-sharing)

## Unreleased

### Added
- Word-count support: 12/15/18/21/24, with an expandable word-count selector (More/Less) in both Create and Recover flows.
- Canonical conformance coverage: `tests/canonical-vectors.v0.4.1.spec.js` (recovery-only) against the spec repo vectors.
- CI/release parity: workflows now check out canonical vectors (`GRIFORTIS/schiavinato-sharing@v0.4.1`) and set `SCHIAVINATO_SHARING_SPEC_REPO_PATH` for conformance tests.
- Per-share pre-flight validation (row checksum + GIC) and a Lagrange sanity check for share numbers, with targeted UI highlighting.

### Changed
- Share display format to `0001-word` while keeping input parsing backward compatible (also accepts `word-0001`).
- Transport parsing and validation rules to match the v0.4.1 canonical vectors expectations.

### Fixed
- Share generation: enforce non-zero highest polynomial coefficients in GF(2053) (prevents degree collapse when entropy source fails).
- Inline Global Integrity Check (GIC) binding now uses the entered share number and validates against both word sum and checksum sum.

### Removed
- Repo-local `.github/SECURITY.md` and `.github/CONTRIBUTING.md` duplicates in favor of org-wide defaults in `GRIFORTIS/.github`.

## 0.4.0 - 2026-01-31

This repo begins at **v0.4.0**. Earlier history for the HTML reference implementation lived in the canonical repo under `reference-implementation/`.

### Added
- Repo reorg: migrated the single-file HTML implementation and Playwright test suite into `schiavinato-sharing-html/`.
- DevSecOps automation: CI, CodeQL, and signed release workflows.

### Changed
- Implemented dual-path checksum validation and explicit path mismatch surfacing (implementation behavior; see canonical changelog for the normative spec notes).
- Implemented Global Integrity Check (GIC) binding to share number `x` (printed GIC = sum + x mod 2053).
- Terminology alignment: "Global Checksum" → "Global Integrity Check (GIC)".

