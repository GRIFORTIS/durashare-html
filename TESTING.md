# Testing Guide (HTML)

This document explains how to run the HTML implementation test suite locally and how conformance is validated.

---

## Quick start

```bash
npm ci
npx playwright install chromium
npm test
```

---

## Full local check (CI parity)

```bash
npm ci
npx playwright install chromium
npm test
npm run lint
```

Optional:

```bash
# Run with UI
npm run test:ui
```

---

## Conformance validation (canonical test vectors)

Conformance is defined by the canonical vectors in the specification repo:
- [TEST_VECTORS](https://github.com/GRIFORTIS/schiavinato-sharing/blob/main/test_vectors/README.md)

The Playwright suite loads `test_vectors/v0.4.1/vectors.json` from the spec repo at runtime.
Local options:
- Clone `schiavinato-sharing` next to `schiavinato-sharing-html`, or
- Set `SCHIAVINATO_SHARING_SPEC_REPO_PATH=/abs/path/to/schiavinato-sharing`.

The test suite exercises word counts **12/15/18/21/24** across supported schemes and validates both `0001-word` and `word-0001` input formats.

When changing behavior, update tests so the implementation remains compatible with the vectors version it claims to support.

---

## Troubleshooting

### Playwright browser install

If browser install fails, rerun:

```bash
npx playwright install chromium
```

