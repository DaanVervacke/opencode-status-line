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

Bun is the only requirement. The tests import only local modules, so they need
no install and no build; the typechecker is the one command that wants the
development dependencies pinned by `bun.lock`:

```sh
git clone https://github.com/rashidrazak/opencode-status-line.git
cd opencode-status-line
bun test                    # the whole suite — no install needed
bun test test/rate.test.ts  # one module — no install needed
bun install                 # once, for the typechecker
bun run typecheck           # src/, the tests and the entry
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
- Keep `bun run typecheck` green: it covers what the suite never imports,
  including `src/tui.tsx`.
- A new setting means `Config` + `DEFAULT_CONFIG` + validation in
  `src/config.ts`, plus the settings chapter and the summary table in
  `MANUAL.md`.
- User-visible changes reach `README.md` only if the feature list or quick
  start changed; the manual carries the detail.
- User-visible changes get a bullet under `## [Unreleased]` in `CHANGELOG.md`;
  each release's section becomes its GitHub Release body.
- `npm run check:pack` must stay green: every module the entry imports has to
  be packed, and the package must not grow a build step or a lockfile. Keep
  `/** @jsxImportSource @opentui/solid */` first in `src/tui.tsx`: npm
  consumers transpile the entry at runtime, where the packed `tsconfig.json`
  is never read.

### Code and comments

Keep a change focused on one idea, and avoid broad refactors unless that is the
point of the pull request. Comments explain the "why" the way the surrounding
files do: they are the project's memory of decisions tried and reverted, so
keep new ones equally honest and delete any the change makes false.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <subject>`, for example
`feat(config): let the cache segment be hidden`.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`. Pick the type that describes the change, not the file
touched; `feat` and `fix` are for user-visible behaviour.

A scope names the area when the change sits in one — `config`, `rate`,
`render`, `format`, `diff`, `palette`, `tui`, `tests`, `docs`, `release`,
`deps`, `ci` — and is omitted for cross-cutting changes. The history mostly
goes without one, so use it only where it adds signal.

- Write the subject in the imperative mood (`add`, not `added`), lowercase
  after the colon, with no trailing period.
- Use a body when the reason is not obvious: what the change does and why,
  wrapped like the surrounding history. This is where a decision tried and
  reverted is recorded, so the body is often the valuable part.
- Mark a breaking change with `!` after the type or scope, plus a
  `BREAKING CHANGE:` footer saying what breaks and how to migrate.

## Pull requests

- Keep the pull request to one problem or feature.
- Add or update tests for behaviour changes, and the docs above where the
  change is user-visible.
- Do not include secrets, credentials, real session transcripts, or config
  files containing personal paths.
- If the change touches `src/tui.tsx`, load it in a real OpenCode session and
  say what you saw; no test can cover the event wiring.

Before opening the pull request:

```sh
bun run typecheck
bun test
npm run check:pack
git diff --check
```

CI must pass — the suite on Linux, macOS and Windows, a typecheck of `src/`,
the tests and the entry, a transpile of `src/tui.tsx`, and the tarball check —
and `main` needs one approving review from a maintainer before merge. A new
push dismisses an existing approval, so ask for a re-review once you have
addressed the feedback.

## Releasing

Releases are cut by maintainers from `main` — see [RELEASING.md](RELEASING.md).

## License

By contributing you agree that your work is licensed under the project's
[MIT license](LICENSE).
