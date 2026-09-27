# Releasing

Publishing is automated in [`.github/workflows/publish.yml`](.github/workflows/publish.yml):
publishing a GitHub Release publishes the tagged version to npm. Authentication
is npm **trusted publishing** (OIDC) — no `NPM_TOKEN` secret exists, and npm
attaches a provenance attestation automatically.

## One-time npm setup

npm only offers its trusted-publisher settings page once the package exists, so
the first version is published by hand (this is how `0.1.0` is bootstrapped).
That is the only time publishing happens outside CI, and the workflow skips
versions the registry already has, so the bootstrap Release is safe to create
afterwards. The npm account needs two-factor authentication enabled — npm
requires it to configure trusted publishers.

1. **Claim the package name** (once, for the bootstrap release) from a checkout
   of `main`:

   ```sh
   npm login
   npm publish
   ```

   `prepublishOnly` runs the suite and `check-pack` first, so a broken tree
   cannot ship.

2. **Trust this repository** on npmjs.com: *package → Settings → Trusted
   Publisher → Add trusted publisher → GitHub Actions*:

   | Field                | Value                                          |
   | -------------------- | ---------------------------------------------- |
   | Organization or user | `rashidrazak`                                  |
   | Repository           | `opencode-status-line`                         |
   | Workflow filename    | `publish.yml`                                  |
   | Environment name     | *(leave empty — the workflow uses no environment)* |
   | Allowed actions      | enable **npm publish** (direct publishing)     |

   The values are case-sensitive and are checked when the workflow publishes,
   not when you save. `npm stage publish` is always allowed; direct
   `npm publish` is opt-in, and this workflow uses the direct path.

3. **Recommended**: *Settings → Publishing access → Require two-factor
   authentication and disallow tokens*. Trusted publishers keep working while
   long-lived tokens stop being able to publish; delete any token you no longer
   need.

A hand-published version carries no provenance attestation; every version
published by CI does.

## Cutting a release

From a clean `main`:

```sh
git switch main && git pull
npm version minor                  # or patch / major; commits package.json and tags vX.Y.Z
git push origin main --follow-tags
gh release create "v$(node -p "require('./package.json').version")" \
  --generate-notes --verify-tag
```

Publishing the GitHub Release triggers `publish.yml`, which:

1. checks out the tag and verifies it matches `package.json`;
2. runs the test suite;
3. publishes with `--tag latest` (or `--tag next` for a release marked as a
   pre-release) — or skips with a notice if that version is already on the
   registry;
4. lets npm attach provenance, visible on the package page.

No changelog file is maintained: the GitHub Release notes, generated from the
commits, are the changelog. Verify what is live after a release:

```sh
npm view opencode-status-line version dist-tags
```

## If publishing fails

- **`ENEEDAUTH` / 401**: the trusted-publisher fields must match exactly —
  user, repository, workflow filename (`publish.yml`, including extension),
  and the environment (empty). Re-check on npmjs.com; a saved configuration is
  not validated until a publish uses it.
- **Wrong version**: the tag and `package.json` disagree; the check runs before
  anything is uploaded.
- **Version already exists**: the workflow treats this as success and skips.
  Bump the version for new contents.
- **Re-run**: Actions → Publish → the failed run → *Re-run jobs* is safe; the
  registry check makes the workflow idempotent.
