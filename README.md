# opencode-status-line

A live **tokens-per-second** meter and usage line for
[OpenCode](https://opencode.ai) v2's prompt footer — context window, cache,
speed, cost and elapsed time in one row.

```
▐████████······▌ 57% — 572.7k │ cache 99.8% — 571.8k │ ▕████████▌·▏ ↯ 261 · avg 159 tok/s │ $0.75 │ 2h07m
```

- **Sliding (`↯`)** — streamed characters over the last few seconds: what is
  happening right now. When the stream stops the last reading stays on screen,
  dimmed, until new output replaces it (`window.hold`).
- **Cumulative (`avg`)** — exact tokens from every finished step of the turn plus
  the step in flight, over their decode time: what the turn is averaging.
- **Settled (`avg` / `✓`)** — when a step or turn finishes, its exact figure takes
  over the cumulative row and stays there.
- **Context window** — a pressure-coloured bar, the percentage used, and the
  token count: green while there is room, yellow as it fills, red near the limit.
- **Cache** — how much of what the model read came from cache, and the cached
  token count.
- **Cost and time** — the session's spend and elapsed time.
- **A steady line** — figures are drawn in a fixed three-character field
  (`8.3`, ` 47`, `198`), so nothing moves sideways as the numbers change.
- **A ratcheting gauge** — its upper bound is the session's high-water mark, so
  a fast burst sets the scale once and slower output never pulls it back down;
  the bar only reads full when a new high is actually being set.

The pieces are `context`, `cache`, `meter`, `cost`, and `time`; `usage.segments`
sets which appear and in what order, and a segment with nothing to say is
skipped along with its separator. `/opencode-status-line` shows the numbers
behind the meter (rolling average, mean, p95).

OpenCode only learns exact token counts at `session.step.ended`; the live
figures are character estimates calibrated against those exact counts. Tool
argument streaming (`session.tool.input.delta`) counts as output, and the exact
decode span starts at the first token, so TTFT is not charged to the model.

## Install (local, today)

Point `cli.json` at the checkout — an absolute path, a path relative to the
config directory, or a package name all work:

```
~/.config/opencode/cli.json
{
  "plugins": ["/path/to/opencode-status-line"]
}
```

No build step: OpenCode transpiles `tui.tsx` on load, and edits hot-reload
straight from the checkout.

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
| `surface` | `"prompt.footer"` | Slot to render in: `prompt.footer` puts the meter at the end of the footer row, right of OpenCode's own usage block (`… tokens · N% used · $0.42 spent`); `prompt.footer.status` puts it inside the status region, left of that block. Also: `prompt.footer.file`, `sidebar.content`, `sidebar.footer`, `session.composer.top`, `home.footer.status` |
| `readings` | `["sliding", "cumulative"]` | Live readings to show, in order. `[]` shows only settled figures |
| `window.ms` | `3000` | Sliding window length |
| `window.minSpanMs` | `800` | Shortest span trusted before a live figure is shown |
| `window.minTps` | `0.5` | Below this the meter is noise and hides |
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
| `history.samples` | `500` | Completed figures kept for the statistics |
| `stats.windowMs` | `60000` | Rolling window for `avg` in the stats dialog |
| `usage.segments` | `["context", "cache", "meter", "cost", "time"]` | Which pieces the line draws, in order; `meter` is the gauge and readings |
| `usage.separator` | `" │ "` | Drawn between segments |
| `usage.contextWidth` | `14` | Context bar width, in cells |
| `usage.warnAt` | `70` | Context fill turns yellow at this percentage |
| `usage.dangerAt` | `90` | Context fill turns red at this percentage |

## Commands

- `/opencode-status-line` (alias `/tps`, also in the palette) — a dialog with the
  current readings, the rolling average, and the all-time mean and p95.

## Development

```
bun test              # rate.ts, render.ts, config.ts — no OpenCode needed
```

`tui.tsx` is the plugin entry; `rate.ts` is the maths, `render.ts` the gauge
geometry, `config.ts` the JSON loader. Publishing as a package means
adding a `package.json` with an `exports` map exposing `./tui`, and the peers
OpenCode provides: `@opentui/core`, `@opentui/solid`, `solid-js`,
`@opencode/plugin`.
