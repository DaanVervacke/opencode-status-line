# Contributing

Thanks for wanting to make the status line better. This is a small plugin and
the process is light: run the tests, keep the pure modules pure, open a pull
request. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

For a bug, open an issue with the bug report form — a screenshot of the line
and the settings in play usually explains more than a paragraph. For a feature
that adds a setting or changes a default, open a feature request first; the
segments are deliberately small and a quick chat saves a rewrite. Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Working on the plugin

Bun is the only requirement — there is no install step, no build step and no
lockfile, because the tests import only local modules. A bare checkout runs:

```sh
git clone https://github.com/rashidrazak/opencode-status-line.git
cd opencode-status-line
bun test                    # the whole suite
bun test test/rate.test.ts  # one module
npm run check:pack          # the tarball consumers install
```

`src/tui.tsx` is the plugin entry: the only file that imports
`@opencode/plugin`, `solid-js` or host APIs. Everything it leans on lives in
pure modules (`rate.ts`, `render.ts`, `format.ts`, `diff.ts`, `palette.ts`,
`config.ts`) with a test file each, and new logic belongs there with tests —
not in the entry. **[AGENTS.md](AGENTS.md) is the codebase guide**: it
documents the host-API traps that have each cost a TUI restart to learn, so
read it before touching the entry.

To see a change live, point `cli.json` at your checkout — OpenCode transpiles
the TSX on load and reloads the plugin when a file it imports is saved:

```json
{ "plugins": ["/path/to/opencode-status-line"] }
```

### Tests and docs

- Add or extend a test in `test/<module>.test.ts` for every behaviour change
  in a pure module.
- A new setting means `Config` + `DEFAULT_CONFIG` + validation in
  `src/config.ts`, plus the settings chapter and the summary table in
  `MANUAL.md`.
- User-visible changes reach `README.md` only if the feature list or quick
  start changed; the manual carries the detail.
- `npm run check:pack` must stay green: every module the entry imports has to
  be packed, and the package must not grow a build step or a lockfile.

### Style

Commits follow the existing conventional style — `feat:`, `fix:`, `docs:`,
`chore:`, `ci:` — with a lower-case summary line. Keep a pull request to one
idea. Comments explain the "why" the way the surrounding files do: they are
the project's memory of decisions tried and reverted, so keep new ones equally
honest and delete any the change makes false.

## Pull requests

1. Fork the repository and branch from `main`.
2. Make the change, run `bun test` and `npm run check:pack`.
3. Open the pull request — the template asks what changed and how it was
   checked.
4. CI must pass: the suite on Linux, macOS and Windows, a transpile of
   `src/tui.tsx`, and the tarball check. A maintainer reviews and merges.

If the change touches `src/tui.tsx`, load it in a real OpenCode session and say
what you saw; no test can cover the event wiring.

## Releasing

Releases are cut by maintainers from `main` — see [RELEASING.md](RELEASING.md).

## License

By contributing you agree that your work is licensed under the project's
[MIT license](LICENSE).
