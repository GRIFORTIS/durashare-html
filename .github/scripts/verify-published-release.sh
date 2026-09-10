#!/usr/bin/env bash
# Fail-closed verification for a draft or published GitHub Release.
set -euo pipefail

TAG="${TAG:?TAG is required (e.g. v0.6.0)}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
RELEASE_ROOT="${RELEASE_ROOT:-$GITHUB_WORKSPACE}"
WORKDIR="${VERIFY_WORKDIR:-$RUNNER_TEMP/release-verify}"
EXPECTED_FP="7921FD5694508DA4020E671F4CFE6248C57F15DF"

if [[ "$TAG" == v0.5.* ]]; then
  COMMIT_REQUIRED_CHECKS=(
    "Secret Scanning"
    "Test on Node.js 18.x"
    "Test on Node.js 20.x"
    "Test on Node.js 22.x"
    "Analyze JavaScript"
  )
else
  COMMIT_REQUIRED_CHECKS=(
    "Secret Scanning"
    "CI Gate"
    "Analyze JavaScript"
  )
fi
PR_REQUIRED_CHECKS=(
  "CodeQL"
)

latest_check_conclusion() {
  local checks_file="$1"
  local context="$2"
  jq -r --arg n "$context" '
    [.check_runs[] | select(.name == $n)]
    | if length == 0 then
        "missing"
      else
        (sort_by(.completed_at // .started_at // "") | last | .conclusion // "pending")
      end
  ' "$checks_file"
}

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
gh api "repos/${REPO}/commits/${COMMIT_SHA}/check-runs?per_page=100" >"$CHECK_RUNS_JSON"
for ctx in "${COMMIT_REQUIRED_CHECKS[@]}"; do
  conclusion="$(latest_check_conclusion "$CHECK_RUNS_JSON" "$ctx")"
  if [[ "$conclusion" != "success" ]]; then
    echo "Required check not successful on tag commit: ${ctx} (${conclusion})" >&2
    exit 1
  fi
  echo "  OK: ${ctx}"
done

echo "==> Verifying tag-specific CI workflow"
TAG_CI_RUNS_JSON="$(mktemp)"
gh api \
  "repos/${REPO}/actions/workflows/ci.yml/runs?branch=${TAG}&event=push&per_page=100" \
  >"$TAG_CI_RUNS_JSON"
tag_ci_conclusion="$(jq -r --arg tag "$TAG" --arg sha "$COMMIT_SHA" '
  [.workflow_runs[]
    | select(.head_branch == $tag and .head_sha == $sha and .event == "push")]
  | if length == 0 then
      "missing"
    else
      (sort_by(.run_started_at // .created_at // "") | last | .conclusion // "pending")
    end
' "$TAG_CI_RUNS_JSON")"
if [[ "$tag_ci_conclusion" != "success" ]]; then
  echo "Tag-specific CI is not successful for ${TAG}: ${tag_ci_conclusion}" >&2
  exit 1
fi
echo "  OK: CI workflow for ${TAG}"

echo "==> Verifying PR-only required checks"
ASSOCIATED_PRS_JSON="$(mktemp)"
gh api \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/commits/${COMMIT_SHA}/pulls" \
  >"$ASSOCIATED_PRS_JSON"
PR_HEAD_SHA="$(jq -r --arg sha "$COMMIT_SHA" '
  [.[] | select(
    .merge_commit_sha == $sha and
    .merged_at != null and
    .base.ref == "main"
  )]
  | sort_by(.merged_at)
  | last
  | .head.sha // empty
' "$ASSOCIATED_PRS_JSON")"
if [[ -z "$PR_HEAD_SHA" ]]; then
  COMMIT_JSON="$(mktemp)"
  gh api "repos/${REPO}/commits/${COMMIT_SHA}" >"$COMMIT_JSON"
  parent_count="$(jq -r '.parents | length' "$COMMIT_JSON")"
  if [[ "$parent_count" == "2" ]]; then
    PR_HEAD_SHA="$(jq -r '.parents[1].sha' "$COMMIT_JSON")"
  else
    echo "No merged main PR is associated with tag commit ${COMMIT_SHA}" >&2
    exit 1
  fi
fi
PR_CHECK_RUNS_JSON="$(mktemp)"
gh api "repos/${REPO}/commits/${PR_HEAD_SHA}/check-runs?per_page=100" >"$PR_CHECK_RUNS_JSON"
for ctx in "${PR_REQUIRED_CHECKS[@]}"; do
  conclusion="$(latest_check_conclusion "$PR_CHECK_RUNS_JSON" "$ctx")"
  if [[ "$conclusion" != "success" ]]; then
    echo "Required PR check not successful: ${ctx} (${conclusion})" >&2
    exit 1
  fi
  echo "  OK: ${ctx}"
done

EXPECTED_FILES=(
  durashare.html
  durashare.html.asc
  CHECKSUMS.txt
  CHECKSUMS.txt.asc
  CHECKSUMS.json
  CHECKSUMS.json.asc
)

echo "==> Resolving draft or published release"
RELEASE_JSON="$(mktemp)"
if ! gh release view "$TAG" \
  --repo "$REPO" \
  --json tagName,isDraft,assets \
  >"$RELEASE_JSON"; then
  echo "No draft or published GitHub Release found for ${TAG}" >&2
  exit 1
fi

echo "==> Downloading release assets"
mkdir -p assets
for f in "${EXPECTED_FILES[@]}"; do
  asset_count="$(jq -r --arg name "$f" '
    [.assets[] | select(.name == $name)] | length
  ' "$RELEASE_JSON")"
  if [[ "$asset_count" != "1" ]]; then
    echo "Missing release asset: ${f}" >&2
    exit 1
  fi
  asset_url="$(jq -r --arg name "$f" '
    [.assets[] | select(.name == $name)] | first | .apiUrl
  ' "$RELEASE_JSON")"
  asset_id="${asset_url##*/}"
  gh api \
    -H "Accept: application/octet-stream" \
    "repos/${REPO}/releases/assets/${asset_id}" \
    >"assets/${f}"
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
