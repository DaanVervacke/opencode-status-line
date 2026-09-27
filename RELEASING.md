# Releasing

Publishing is automated in [`.github/workflows/publish.yml`](.github/workflows/publish.yml):
pushing the `v*` tag that `npm version` creates publishes the tagged version to
npm and creates the GitHub Release with generated notes, in one run.
Authentication is npm **trusted publishing** (OIDC) — no `NPM_TOKEN` secret
exists, and npm attaches a provenance attestation automatically.

## One-time npm setup

npm only offers its trusted-publisher settings page once the package exists, so
the first version is published by hand (this is how `0.1.0` is bootstrapped).
That is the only time publishing happens outside CI, and every step of the
workflow skips what already exists, so the bootstrap tag or Release is safe to
create afterwards. The npm account needs two-factor authentication enabled —
npm requires it to configure trusted publishers.

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

For the bootstrap version, give it a Release once npm has it — the workflow
finds the version already published and only creates the Release:

```sh
gh release create v0.1.0 --generate-notes
```

A hand-published version carries no provenance attestation; every version
published by CI does.

## Cutting a release

From a clean `main`:

```sh
git switch main && git pull
npm version minor                  # or patch / major; commits package.json and tags vX.Y.Z
git push origin main --follow-tags
```

That is the whole release. Pushing the tag triggers `publish.yml`, which:

1. checks out the tag and verifies it matches `package.json`;
2. runs the test suite;
3. publishes with `--tag latest` — or `--tag next` when the version has a
   pre-release suffix — and skips with a notice if that version is already on
   the registry;
4. creates the GitHub Release with notes generated from the commits, marked as
   a pre-release for a pre-release version, unless the Release already exists;
5. lets npm attach provenance, visible on the package page.

Creating the Release by hand (`gh release create …` or the web UI) runs the same
workflow; every step skips what already exists, so the tag and the Release can
never publish the same version twice.

No changelog file is maintained: the GitHub Release notes, generated from the
commits, are the changelog. Verify what is live after a release:

```sh
npm view opencode-status-line version dist-tags
gh release view "v$(node -p "require('./package.json').version")"
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
- **Re-run**: Actions → Publish → the failed run → *Re-run jobs* is safe; every
  step checks the registry and the Release instead of assuming.
