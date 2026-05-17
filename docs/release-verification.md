# Release Verification

What release signatures and checksums prove, and how to verify a published HTML release.

## Signed artifacts

For tag `vX.Y.Z`:

| File | Signature |
|------|-----------|
| `schiavinato_sharing.html` | `schiavinato_sharing.html.asc` |
| `CHECKSUMS.txt` | `CHECKSUMS.txt.asc` |
| `CHECKSUMS.json` | `CHECKSUMS.json.asc` |

The signed git tag authenticates the repository commit. Detached `.asc` files authenticate the downloadable blobs.

## Automated gate (maintainers)

Publishing a GitHub Release triggers **Release Verify** (`.github/workflows/release.yml`). It fails unless:

- The tag is signed and matches `package.json` / `schiavinato_sharing.html` version strings
- Required CI checks succeeded on the tagged commit
- All six release assets exist
- GPG signatures verify with the GRIFORTIS public key
- Checksums match the published HTML
- The downloaded HTML matches the file at the tagged commit
- Playwright conformance tests pass on the tag

Do not announce a release until this workflow is green.

## User verification

```bash
gpg --import GRIFORTIS-PGP-PUBLIC-KEY.asc
gpg --fingerprint security@grifortis.com
# Expected: 7921 FD56 9450 8DA4 020E 671F 4CFE 6248 C57F 15DF

export VERSION="v0.4.1"
# download schiavinato_sharing.html, .asc, CHECKSUMS.txt, CHECKSUMS.txt.asc

gpg --verify schiavinato_sharing.html.asc schiavinato_sharing.html
gpg --verify CHECKSUMS.txt.asc CHECKSUMS.txt
sha256sum -c CHECKSUMS.txt --ignore-missing
```

## What verification does not prove

- The tool is audited or safe for real funds
- Behavior matches Schiavinato Sharing v0.6.0 (see README compatibility)
