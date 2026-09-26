# opencode-status-line

A live status line for [OpenCode](https://opencode.ai) v2's terminal UI — context
window, cache, streaming speed, cost, elapsed time and uncommitted changes in
one configurable row, wrapping to more rows when the window is narrow.

```
██████▎····▏ 57% — 572.7k │ ⧉ 99.8% — 571.8k │ ████████▌·▏ ↯ 261 · μ 159 tok/s │ $0.75 │ 2h07m │ +42 -7
```

- **Sliding (`↯`)** — streamed characters over the last few seconds: what is
  happening right now. When the stream stops the last reading stays on screen,
  dimmed, until new output replaces it (`window.hold`).
- **Cumulative (`avg` / `μ`)** — exact tokens from every finished step of the turn
  plus the step in flight, over their decode time: what the turn is averaging.
- **Settled (`avg` / `μ` / `✓`)** — when a step or turn finishes, its exact figure
  takes over the cumulative row and stays there; a step's own figure with folding
  off wears `✓`. A resumed session rebuilds it from the session's stored
  messages, so the meter comes back showing its last value.
- **Context window** — a pressure-coloured bar, the percentage used, and the
  token count: green while there is room, yellow as it fills, red near the limit.
  It wears the speed gauge's drawing — same cells, same trailing edge, same
  levels — unless `usage.contextWidth` picks its own cell count.
- **Cache (`cache` / `⧉`)** — how much of what the model read came from cache, and
  the cached token count.
- **Shells** — how many shell commands the session is running right now; click
  it to toggle the composer, whose Shell tab lists them and opens the host's
  output viewer. The segment hides itself when nothing is executing.
- **Uncommitted changes (`+12 -3`)** — additions and deletions in the working
  tree, green and red, straight from the host's VCS registry: staged, unstaged
  and untracked changes alike. A clean tree draws nothing. The counter is
  re-asked every `diff.refreshMs`, and again as soon as a turn closes, so it
  follows the agent's edits without a `git` process per repaint.
- **Cost and time** — the session's spend and elapsed time.
- **A steady line** — figures are drawn in a fixed three-character field
  (`8.3`, ` 47`, `198`), so nothing moves sideways as the numbers change.
- **A ratcheting gauge** — its upper bound is the session's high-water mark, so
  a fast burst sets the scale once and slower output never pulls it back down;
  the bar only reads full when a new high is actually being set.
- **Labels** — the fixed words are glyphs by default: `↯` for the live reading,
  `μ` for the average, `⧉` for cache. `usage.labels: "words"` spells `avg` and
  `cache` back out.
- **Themes** — the line follows the OpenCode theme's own colours by default;
  `colors.palette` can instead dress it in a bundled palette — Catppuccin,
  Dracula, Gruvbox, Nord, Rosé Pine, Tokyo Night, or the flat `grey` and
  `white` — with `colors.overrides` to recolour single tones and
  `colors.exclude` to opt a segment out. See [Themes](#themes).
- **Sidebar-aware** — a `sidebar.*` surface stacks the segments, one per row,
  each cut to the sidebar's width with an `…`; the footer surfaces join the
  same segments across one line.
- **Wraps when narrow** — a one-line surface (`app` and the footer slots) joins
  the segments across one line and moves whole segments that do not fit onto
  the next row, for as many rows as the width demands. It fits to the width the
  host actually deals the box — a footer row shares its width with OpenCode's
  own status text — and cuts with an `…` only a single segment wider than the
  box; the gauge and context bar keep their configured widths. Widening the
  window puts the line back on one row.

The pieces are `shells`, `context`, `cache`, `meter`, `cost`, `time`, and
`diff`; `usage.segments` sets which appear and in what order, and a segment with
nothing to say is skipped along with its separator. `/opencode-status-line` shows the numbers
behind the speed readings (rolling average, mean, p95).

Only the streaming speed is estimated: OpenCode reports exact token counts at
`session.step.ended`, and the live readings calibrate streamed characters
against them. Tool argument streaming (`session.tool.input.delta`) counts as
output, and the exact decode span starts at the first token, so TTFT is not
charged to the model. Context, cache, cost and time come straight from the
session's records, and the diff counter from the host's VCS registry.

A resumed session keeps its settled figure: the last turn's assistant messages
carry their exact token counts and decode spans — from the first reasoning
timestamp where the record kept one — and the plugin folds them back together,
so the meter segment shows its last figure again, dimmed, with `↯` resting at
`0.0` and the gauge empty. It is the same measurement from the same tokens, but
not bit-identical to the live reading: the live meter's span runs between two
event timestamps — the first stream delta and the step's end — that the record
does not keep, so the rebuilt figure can land around a percent away. The window
reading itself is the exception: it summarises the arrival times of individual
stream chunks, which no record keeps, so a real `↯` figure returns with the next
stream. The statistics (`/opencode-status-line`) are per-process for the same
reason.

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

## Configuration

Read from JSON, lowest precedence first:

1. `~/.config/opencode/opencode-status-line.json` — every project
2. `<project>/.opencode-status-line.json` — one project
3. plugin entry options — where the host passes them

Later sources win key by key; an invalid file or value is ignored with a
warning, never treated as fatal. Every key below is optional — delete a key to
inherit its default.

| Key | Default | Meaning |
| --- | --- | --- |
| `surface` | `"app"` | Slot to render in: `app` is the window's bottom row, below OpenCode's own footer (drawn with the composer's 2-column indent, a right margin, and two clear rows underneath); `prompt.footer` puts the line at the end of the footer row, right of OpenCode's own usage block (`… tokens · N% used · $0.42 spent`); `prompt.footer.status` puts it inside the status region, left of that block. Also: `sidebar.content`, `sidebar.footer`, `session.composer.top`, `home.footer.status` |
| `padding.<surface>` | surface defaults — `app` 2/2/0/2, others 0 | Per-surface `left`/`right`/`top`/`bottom` cell counts. The set follows `surface`, so moving the line between placements keeps each one's own padding |
| `readings` | `["sliding", "cumulative"]` | Live readings to show, in order. `[]` shows only settled figures |
| `window.ms` | `3000` | Sliding window length |
| `window.minSpanMs` | `800` | Shortest span trusted before a live figure is shown |
| `window.minTps` | `0.5` | Below this the speed reading is noise and hides |
| `window.bucketMs` | `100` | Character sample bucket size |
| `window.hold` | `true` | Keep the last sliding reading on screen (dimmed) after a stream stops |
| `calibration.enabled` | `true` | Let finished steps steer `charsPerToken` |
| `calibration.charsPerToken` | `4` | Seed ratio until calibration has data |
| `calibration.min` / `.max` | `2.5` / `7` | Bounds; samples outside are discarded |
| `turn.fold` | `true` | Fold a turn's exact steps into one weighted figure (off: per-step figures, and `avg` becomes a per-step cumulative) |
| `cap.mode` | `"gauge"` | `gauge`, `none`; `auto` is accepted as the legacy alias for `gauge` |
| `cap.gaugeWidth` | `11` | Eighth-cell gauge width |
| `cap.gaugeFloor` | `40` | Gauge scale never drops below this tok/s |
| `colors.enabled` | `true` | Speed colours |
| `colors.fast` | `50` | Green at or above |
| `colors.slow` | `20` | Yellow at or above; red below |
| `colors.palette` | `"host"` | The colour palette the line draws with: `host` follows the OpenCode theme's tokens, or a bundled palette — a variant like `catppuccin-mocha`, or a family like `catppuccin` that follows the host's light/dark mode. See [Themes](#themes) |
| `colors.overrides` | `{}` | Per-tone `#rrggbb` recolours — `text`, `muted`, `success`, `warning` or `error` — layered over the palette, or over the host tokens when no palette is chosen. Held and settled figures wear `muted` |
| `colors.exclude` | `[]` | Segments that always draw in the host theme's own colours, ignoring `colors.palette` and `colors.overrides`. Names from `usage.segments`, e.g. `["diff"]` keeps green/red diff counts on a monochrome line |
| `history.samples` | `500` | Completed figures kept for the statistics |
| `stats.windowMs` | `60000` | Rolling window for `avg` in the stats dialog |
| `usage.segments` | `["shells", "context", "cache", "meter", "cost", "time", "diff"]` | Which pieces the line draws, in order; `meter` is the gauge and readings |
| `usage.labels` | `"icons"` | How the fixed words read: `icons` draws `↯`, `μ`, `✓`, `⧉`; `words` spells out `avg` and `cache` |
| `usage.separator` | `" │ "` | Drawn between segments |
| `usage.contextWidth` | `"gauge"` | Cells the context bar draws: `"gauge"` matches `cap.gaugeWidth`, or a number from 1 to 60 to deviate |
| `usage.warnAt` | `70` | Context fill turns yellow at this percentage |
| `usage.dangerAt` | `90` | Context fill turns red at this percentage |
| `diff.refreshMs` | `5000` | How often the diff counter re-asks the host's VCS registry, in milliseconds (500–600000); a closing turn refreshes it immediately |

## Themes

By default the line draws in the OpenCode theme's own tokens
(`colors.palette: "host"`), so switching the TUI theme restyles the line too.
OpenCode's own theme picker ships several of the palettes below; choosing one
here instead dresses the line in the palette independently of the TUI theme.
`colors.palette` can name one of the bundled palettes — a variant, or a family
that follows the host's active mode (`"catppuccin"` is `catppuccin-mocha` in
dark mode and `catppuccin-latte` in light):

| Family | Variants |
| --- | --- |
| Catppuccin | `catppuccin-mocha`, `catppuccin-macchiato`, `catppuccin-frappe`, `catppuccin-latte` |
| Dracula | `dracula`, `alucard` |
| Gruvbox | `gruvbox-dark`, `gruvbox-light` |
| Nord | `nord` |
| Rosé Pine | `rose-pine`, `rose-pine-moon`, `rose-pine-dawn` |
| Tokyo Night | `tokyonight-night`, `tokyonight-storm`, `tokyonight-moon`, `tokyonight-day` |
| Monochrome | `grey`, `white` — every status ink shares one shade, so speeds, the context bar and the diff all read flat |

```json
{
  "colors": {
    "palette": "catppuccin-mocha",
    "overrides": { "success": "#a6e3a1", "muted": "#7f849c" }
  }
}
```

`colors.overrides` layers single `#rrggbb` colours over the chosen palette —
or over the host tokens when no palette is chosen. The inks are `text` (body),
`muted` (labels, separators, bar tracks, held and settled figures) and the
three status colours `success`, `warning` and `error`, which colour the speed
readings, the context bar and the diff counter. Every bundled hex is the
theme's own published value, carrying only the inks the line draws with.

A segment can also opt out of the palette entirely: `colors.exclude` lists
segments that keep the OpenCode theme's own colours, with `colors.palette` and
`colors.overrides` set aside for those runs alone — the separators between
segments stay with the palette. This matters most with the monochrome
palettes, which flatten the status inks:

```json
{
  "colors": {
    "palette": "grey",
    "exclude": ["diff", "context"]
  }
}
```

## Commands

- `/opencode-status-line` (alias `/tps`, also in the palette) — a dialog with the
  current speed readings, the rolling average, and the all-time mean and p95.

## Development

```
bun test                    # all six test files — no OpenCode needed
bun test test/rate.test.ts  # one module
```

`src/tui.tsx` is the plugin entry; `src/rate.ts` is the speed maths,
`src/render.ts` the gauge and context-bar geometry, `src/format.ts` the
usage-line formatting, `src/diff.ts` the uncommitted-change counter,
`src/palette.ts` the bundled colour palettes, and `src/config.ts` the JSON
loader. The root `tui.tsx` re-exports the entry for OpenCode's directory plugin
resolution — it exists for checkouts loaded from `cli.json`; npm consumers
reach the entry through the exports map instead.

## Publishing

The package ships source, not a bundle — OpenCode transpiles the TSX on load,
so there is nothing to build before publishing:

```
npm pack --dry-run     # inspect the tarball
npm publish
```

`package.json` exposes `./tui` → `src/tui.tsx` and its `files` allowlist
carries the whole of `src/`, so the tarball holds the entry and every module it
imports. `@opencode/plugin` is a dependency; the rendering peers
(`@opentui/core`, `@opentui/solid`, `solid-js`) come from OpenCode.
