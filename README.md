# opencode-status-line

[![CI](https://github.com/rashidrazak/opencode-status-line/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rashidrazak/opencode-status-line/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/opencode-status-line)](https://www.npmjs.com/package/opencode-status-line)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/rashidrazak/opencode-status-line/blob/main/LICENSE)

A live status line for [OpenCode](https://opencode.ai) v2's terminal UI —
context window, cache, streaming speed, cost, elapsed time and uncommitted
changes in one configurable row.

```
██████▎····▏ 57% — 572.7k │ ⧉ 99.8% — 571.8k │ ████████▌·▏ ↯ 261 · μ 159 tok/s │ $0.75 │ 2h07m │ +42 -7
```

## What you get

- **Context window** — a pressure-coloured bar, the percentage used and the
  token count: green while there is room, red near the limit.
- **Cache** — how much of what the model read came from cache.
- **Speed** — a gauge with the rate right now (`↯`) and the turn's average
  (`μ`). A finished figure stays on screen, dimmed, so "happening now" and
  "last known" never blur together.
- **Cost and time** — the session's spend and how long it has been running.
- **Uncommitted changes** — `+42 -7` across staged, unstaged and untracked
  files, straight from OpenCode's own VCS registry, with no `git` process
  behind it.
- **Running shells** — how many commands are executing right now; click the
  count to open the composer's Shell tab.
- `/opencode-status-line` (alias `/tps`, also in the command palette) opens a
  dialog with the numbers behind the meter.

Put the line wherever you like — one slot or several at once, each placement
with its own segments: it wraps whole segments onto further rows when the
window is narrow, stacks them one per row in a sidebar, and dresses itself in
any of the bundled palettes — Catppuccin, Dracula, Gruvbox, Nord, Rosé Pine,
Tokyo Night, or the flat `grey` and `white`.

## Install

The plugin is CLI-only, so it belongs in `cli.json` (not `opencode.json`).
From npm:

```
~/.config/opencode/cli.json
{
  "plugins": ["opencode-status-line"]
}
```

From a checkout, point `cli.json` at the directory — an absolute path, a path
relative to the config directory, or a package name all work:

```
~/.config/opencode/cli.json
{
  "plugins": ["/path/to/opencode-status-line"]
}
```

No build step in either case: OpenCode transpiles `tui.tsx` on load, and edits
to a checkout hot-reload straight from it.

## Quick start

Settings are optional JSON. Put them in
`~/.config/opencode/opencode-status-line.json` for every project, or in
`.opencode-status-line.json` in a project folder; the project file wins where
both set a key. A first change:

```json
{
  "usage": { "labels": "words" },
  "colors": { "palette": "catppuccin" },
  "cap": { "gaugeWidth": 14 }
}
```

That switches the glyphs to words, dresses the line in Catppuccin, and draws a
wider speed gauge. Invalid files and values only warn — they never break the
line.

## Full manual

The [customization manual][manual] is the complete reference:

- [every setting, with its default and allowed values][settings]
- choosing and ordering the segments, per placement if you like
- placing the line in one slot or several at once, and padding it
- understanding and tuning the speed meter
- the bundled palettes, custom colours and per-segment opt-outs
- ready-made setups to copy
- common questions and fixes

## Development

```
bun test                    # the whole suite — no OpenCode needed
bun test test/rate.test.ts  # one module
npm run check:pack          # every module the entry imports is in the tarball
```

`src/tui.tsx` is the plugin entry; `src/rate.ts` is the speed maths,
`src/render.ts` the gauge and context-bar geometry, `src/format.ts` the
usage-line formatting, `src/diff.ts` the uncommitted-change counter,
`src/palette.ts` the bundled colour palettes, and `src/config.ts` the JSON
loader. The root `tui.tsx` re-exports the entry for OpenCode's directory plugin
resolution — it exists for checkouts loaded from `cli.json`; npm consumers
reach the entry through the exports map instead.

CI runs the suite on Linux, macOS and Windows for every pull request, alongside
a transpile of the entry and the tarball check. Contributions are welcome —
[CONTRIBUTING.md][contributing] has the workflow, and `AGENTS.md` documents the
host-API traps behind the entry.

## Publishing

The package ships source, not a bundle — OpenCode transpiles the TSX on load,
so there is nothing to build. `package.json` exposes `./tui` → `src/tui.tsx`
and its `files` allowlist carries the whole of `src/`, so the tarball holds the
entry and every module it imports. `@opencode/plugin` is a dependency; the
rendering peers (`@opentui/core`, `@opentui/solid`, `solid-js`) come from
OpenCode. `npm run check:pack` verifies every module the entry imports is
actually packed.

Publishing runs in CI, not from a laptop: publishing a GitHub Release triggers
`.github/workflows/publish.yml`, which publishes with npm trusted publishing
(OIDC) — no repository secret, and a provenance attestation is attached. The
release tag must match `package.json`, and a version already on the registry is
skipped rather than failed, so the workflow is safe to re-run and safe to point
at the hand-published bootstrap release. Maintainers: see [RELEASING.md][releasing].

[manual]: https://github.com/rashidrazak/opencode-status-line/blob/main/MANUAL.md
[settings]: https://github.com/rashidrazak/opencode-status-line/blob/main/MANUAL.md#10-all-settings-at-a-glance
[contributing]: https://github.com/rashidrazak/opencode-status-line/blob/main/CONTRIBUTING.md
[releasing]: https://github.com/rashidrazak/opencode-status-line/blob/main/RELEASING.md
