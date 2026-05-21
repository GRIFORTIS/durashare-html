# Release Process

Maintainer release flow for `schiavinato-sharing-html`. Not part of the Schiavinato Sharing protocol specification.

## Trust model

- The authoritative source-state attestation is a **locally created signed git tag**.
- Release assets are **built and signed locally** on the maintainer machine.
- **GitHub Actions must not hold private signing keys** for this repository.
- The **Release Verify** workflow (`release.yml`) is a fail-closed gate: it refuses a published release unless CI, signatures, checksums, and conformance tests all pass on the tagged commit.
- GitHub Releases are a distribution channel, not the root of trust.

## Release preflight (automated + manual)

On the target commit (normally `main` after merge):

1. **CI must be green** on GitHub (`ci.yml` + `codeql.yml`). Branch ruleset enforces this for merges.
2. `CHANGELOG.md` has the dated release section for this version.
3. `package.json` `version`, user-facing strings in `schiavinato_sharing.html`, and the git tag all match (e.g. `0.4.1` / `v0.4.1`).
4. Conformance tests pass locally (`npm ci`, Playwright). Spec checkout: `GRIFORTIS/schiavinato-sharing@v0.5.0` (frozen v0.4.1 vectors at `previous_versions/v0.4.1/test_vectors/vectors.json`).

Signing identity:

- Fingerprint: `7921 FD56 9450 8DA4 020E 671F 4CFE 6248 C57F 15DF`
- UID: `GRIFORTIS <security@grifortis.com>`

## Local release asset build

Build into `release-assets/` at the repository root. That directory is **gitignored** (maintainer staging only). Do not commit signed artifacts; upload them to the GitHub Release after signing.

From a clean checkout at the release commit:

```bash
export VERSION="v0.4.1"
mkdir -p release-assets
cp schiavinato_sharing.html "release-assets/schiavinato_sharing.html"

python3 - <<'PY'
import hashlib, json
from datetime import datetime, timezone
from pathlib import Path

version = __import__("os").environ["VERSION"]
files = ["schiavinato_sharing.html"]
generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

root = Path("release-assets")
lines = [
    "# SHA256 Checksums - Schiavinato Sharing (HTML)",
    "",
    f"Version: {version}",
    f"Generated: {generated.replace('T', ' ').replace('Z', ' UTC')}",
    "",
]
for name in files:
    digest = sha256(root / name)
    lines.append(f"{digest}  {name}")
lines.extend(["", "## Verification", "", "sha256sum -c CHECKSUMS.txt --ignore-missing", ""])
(root / "CHECKSUMS.txt").write_text("\n".join(lines), encoding="utf-8")

payload = {
    "version": version,
    "generated": generated,
    "checksums": {name: sha256(root / name) for name in files},
}
(root / "CHECKSUMS.json").write_text(
    json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
)
PY
```

## Local detached signatures

```bash
cd release-assets
gpg --armor --detach-sign schiavinato_sharing.html
gpg --armor --detach-sign CHECKSUMS.txt
gpg --armor --detach-sign CHECKSUMS.json
gpg --verify schiavinato_sharing.html.asc schiavinato_sharing.html
gpg --verify CHECKSUMS.txt.asc CHECKSUMS.txt
gpg --verify CHECKSUMS.json.asc CHECKSUMS.json
sha256sum -c CHECKSUMS.txt --ignore-missing
cd ..
```

## Signed tag

Only after preflight and local asset verification:

```bash
# Force OpenPGP (GRIFORTIS key). Do not use SSH-signed tags.
git -c gpg.format=openpgp -c user.signingkey=4CFE6248C57F15DF tag -s "${VERSION}" -m "Release ${VERSION}"
git -c gpg.ssh.allowedSignersFile=/dev/null tag -v "${VERSION}"
git push origin "${VERSION}"
```

Wait for **CI on the tag** (`ci.yml` runs on `v*` tags) to finish green before publishing.

## GitHub publishing

1. Create a **draft** GitHub Release from the pushed signed tag (do not announce yet).
2. Upload from `release-assets/`:
   - `schiavinato_sharing.html`
   - `schiavinato_sharing.html.asc`
   - `CHECKSUMS.txt`
   - `CHECKSUMS.txt.asc`
   - `CHECKSUMS.json`
   - `CHECKSUMS.json.asc`
3. **Publish** the release. `release.yml` runs automatically and must pass.
4. If verify fails, treat the release as **blocked**: fix assets or tag, do not point users to the download.

Manual re-verify:

```bash
gh workflow run release.yml -f tag=v0.4.1
```

## Final spot-check

See [`docs/release-verification.md`](docs/release-verification.md).

## Failure handling

- CI red on `main` → fix commit, re-run CI, do not tag.
- Local signing fails → do not push tag.
- Release Verify fails → do not announce; re-upload the **same** signed files from `release-assets/`, or revoke the release and cut a new tag from a fixed commit.
