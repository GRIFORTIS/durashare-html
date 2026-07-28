# Testing Guide (HTML)

This document explains how to run the HTML implementation test suite locally and how conformance is validated.

---

## Quick start

```bash
npm ci
npm test
```

On **macOS**, tests use your installed **Google Chrome** (`channel: 'chrome'`). You do not need `npx playwright install` unless you run on Linux/Windows or in CI.

On Linux/Windows (or if Chrome is not installed), use bundled Chromium:

```bash
npx playwright install chromium
npm test
```

---

## Full local check (CI parity)

```bash
npm ci
npm test
npm run lint
```

On macOS, `npm test` uses Google Chrome. On Linux CI, workflows run `npx playwright install chromium` before tests.

Optional:

```bash
# Run with UI
npm run test:ui
```

---

## Conformance validation (canonical test vectors)

Conformance is defined by the canonical vectors in the specification repo:
- [TEST_VECTORS](https://github.com/GRIFORTIS/durashare/blob/main/test_vectors/README.md)

The Playwright suite loads the frozen v0.5.0 machine-readable vectors at `previous_versions/v0.5.0/test_vectors/vectors.json` in the [specification repo](https://github.com/GRIFORTIS/durashare). CI pins `GRIFORTIS/durashare@v0.5.0` for that path; locally, clone that tag or set `DURASHARE_SPEC_REPO_PATH`.
Local options:
- Clone `durashare` next to `durashare-html` (a local folder still named `schiavinato-sharing` is also detected), or
- Set `DURASHARE_SPEC_REPO_PATH=/abs/path/to/durashare`.

The test suite exercises word counts **12/15/18/21/24** across supported schemes and validates both `0001-word` and `word-0001` input formats.

When changing behavior, update tests so the implementation remains compatible with the vectors version it claims to support.

---

## Troubleshooting

### Playwright browser install

If browser install fails, rerun:

```bash
npx playwright install chromium
```

