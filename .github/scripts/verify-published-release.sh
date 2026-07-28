#!/usr/bin/env bash
# Fail-closed verification for a published GitHub Release (local sign + uploaded assets).
set -euo pipefail

TAG="${TAG:?TAG is required (e.g. v0.4.1)}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
RELEASE_ROOT="${RELEASE_ROOT:-$GITHUB_WORKSPACE}"
WORKDIR="${VERIFY_WORKDIR:-$RUNNER_TEMP/release-verify}"
EXPECTED_FP="7921FD5694508DA4020E671F4CFE6248C57F15DF"

REQUIRED_CHECKS=(
  "Secret Scanning"
  "Test on Node.js 18.x"
  "Test on Node.js 20.x"
  "Test on Node.js 22.x"
  "Analyze JavaScript"
)

mkdir -p "$WORKDIR"
cd "$WORKDIR"

echo "==> Resolving tag ${TAG}"
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid tag format: ${TAG} (expected vX.Y.Z)" >&2
  exit 1
fi

REF_SHA="$(gh api "repos/${REPO}/git/ref/tags/${TAG}" --jq '.object.sha')"
REF_TYPE="$(gh api "repos/${REPO}/git/ref/tags/${TAG}" --jq '.object.type')"
if [[ "$REF_TYPE" == "commit" ]]; then
  COMMIT_SHA="$REF_SHA"
elif [[ "$REF_TYPE" == "tag" ]]; then
  COMMIT_SHA="$(gh api "repos/${REPO}/git/tags/${REF_SHA}" --jq '.object.sha')"
else
  echo "Unsupported tag ref type: ${REF_TYPE}" >&2
  exit 1
fi
echo "Tag ${TAG} -> commit ${COMMIT_SHA}"

echo "==> Verifying required CI checks on tag commit"
CHECK_RUNS_JSON="$(mktemp)"
gh api "repos/${REPO}/commits/${COMMIT_SHA}/check-runs" --paginate >"$CHECK_RUNS_JSON"
for ctx in "${REQUIRED_CHECKS[@]}"; do
  ok="$(jq -r --arg n "$ctx" '
    ([.check_runs[] | select(.name == $n and .conclusion == "success")] | length) > 0
  ' "$CHECK_RUNS_JSON")"
  if [[ "$ok" != "true" ]]; then
    echo "Required check not successful: ${ctx} (no successful run on this commit)" >&2
    exit 1
  fi
  echo "  OK: ${ctx}"
done

echo "==> Downloading release assets"
gh release download "$TAG" --repo "$REPO" --dir "$WORKDIR/assets"

EXPECTED_FILES=(
  durashare.html
  durashare.html.asc
  CHECKSUMS.txt
  CHECKSUMS.txt.asc
  CHECKSUMS.json
  CHECKSUMS.json.asc
)
for f in "${EXPECTED_FILES[@]}"; do
  if [[ ! -f "assets/${f}" ]]; then
    echo "Missing release asset: ${f}" >&2
    exit 1
  fi
done

echo "==> Importing GRIFORTIS public key"
gpg --batch --import "${RELEASE_ROOT}/GRIFORTIS-PGP-PUBLIC-KEY.asc"
actual_fp="$(gpg --with-colons --fingerprint security@grifortis.com 2>/dev/null | awk -F: '$1=="fpr" {print $10; exit}')"
if [[ "$actual_fp" != "$EXPECTED_FP" ]]; then
  echo "Unexpected GPG fingerprint: ${actual_fp:-missing} (expected ${EXPECTED_FP})" >&2
  exit 1
fi

echo "==> Verifying detached signatures"
gpg --batch --verify assets/durashare.html.asc assets/durashare.html
gpg --batch --verify assets/CHECKSUMS.txt.asc assets/CHECKSUMS.txt
gpg --batch --verify assets/CHECKSUMS.json.asc assets/CHECKSUMS.json

echo "==> Verifying checksums"
(
  cd assets
  sha256sum -c CHECKSUMS.txt --ignore-missing
)
python3 - <<'PY'
import hashlib, json, sys
from pathlib import Path
assets = Path("assets")
data = json.loads((assets / "CHECKSUMS.json").read_text(encoding="utf-8"))
for name, expected in data.get("checksums", {}).items():
    path = assets / name
    if not path.is_file():
        sys.exit(f"CHECKSUMS.json lists missing file: {name}")
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    got = h.hexdigest()
    if got != expected:
        sys.exit(f"Checksum mismatch for {name}: expected {expected}, got {got}")
print("CHECKSUMS.json OK")
PY

echo "==> Verifying release HTML matches tagged repository tree"
repo_html="${RELEASE_ROOT}/durashare.html"
if [[ ! -f "$repo_html" ]]; then
  echo "Missing durashare.html in tagged checkout" >&2
  exit 1
fi
repo_sum="$(sha256sum "$repo_html" | awk '{print $1}')"
asset_sum="$(sha256sum assets/durashare.html | awk '{print $1}')"
if [[ "$repo_sum" != "$asset_sum" ]]; then
  echo "Release asset durashare.html does not match tagged commit" >&2
  exit 1
fi

echo "Release verification passed for ${TAG}"
