# opencode-status-line — Customization Manual

This is the complete reference for the plugin: every setting, palette and
behaviour. It assumes you already have the plugin loaded in OpenCode's CLI —
the [README](README.md) covers install and the short version.

If you are new here, read [Quick start](#2-quick-start) first. Then jump to
the part you care about:

1. [What the line shows](#1-what-the-line-shows)
2. [Quick start](#2-quick-start)
3. [Pick the parts you want](#3-pick-the-parts-you-want)
4. [Move the line around](#4-move-the-line-around)
5. [Understand and tune the speed meter](#5-understand-and-tune-the-speed-meter)
6. [Colours and themes](#6-colours-and-themes)
7. [The context bar](#7-the-context-bar)
8. [The uncommitted changes counter](#8-the-uncommitted-changes-counter)
9. [The stats dialog](#9-the-stats-dialog)
10. [All settings at a glance](#10-all-settings-at-a-glance)
11. [Ready-made setups](#11-ready-made-setups)
12. [Common questions and fixes](#12-common-questions-and-fixes)

---

## 1. What the line shows

The plugin adds a row to OpenCode's terminal UI — one slot or several at once,
each placement drawing the pieces you choose. A default line looks like this:

```
██████▎····▏ 57% — 572.7k │ ⧉ 99.8% — 571.8k │ ████████▌·▏ ↯ 261 · μ 159 tok/s │ $0.75 │ 2h07m │ +42 -7
```

Reading it from left to right:

| Piece | Example | What it tells you |
| --- | --- | --- |
| Context bar | `██████▎····▏ 57% — 572.7k` | How full the model's context window is, plus the token count |
| Cache | `⧉ 99.8% — 571.8k` | How much of what the model read came from cache, plus the cached token count |
| Speed meter | `████████▌·▏ ↯ 261 · μ 159 tok/s` | The gauge, the speed right now (`↯`), and the average for the turn (`μ`) |
| Cost | `$0.75` | What this session has spent so far |
| Time | `2h07m` | How long this session has been running |
| Changes | `+42 -7` | Lines added and removed in your working tree, not yet committed |
| Shells | `2 shells` | Commands OpenCode is running right now (only appears while they run) |

A few useful details:

- A piece with nothing to say hides itself, separator and all. A clean git
  tree draws no `+/-` counter, a fresh session draws no cost, and so on.
- The shells count is clickable: click it to toggle OpenCode's composer, whose
  Shell tab lists the running commands and opens their output.
- Old figures stay on screen in a lighter shade. That is how you tell "happening
  now" from "last known".
- Numbers are drawn in a fixed three-character field (`8.3`, ` 47`, `198`), so
  the line does not jump around as values change.
- A narrow window makes the line wrap onto more rows. Whole segments move to
  the next row, and they come back when you widen the window.

---

## 2. Quick start

### Where settings live

The plugin reads settings from two JSON files, plus any options passed by the
host. They are optional — with no files at all, the defaults apply.

| File | Scope |
| --- | --- |
| `~/.config/opencode/opencode-status-line.json` | Every project on your machine |
| `<project>/.opencode-status-line.json` | Just that one project |

If you set the `XDG_CONFIG_HOME` environment variable, the global file lives at
`$XDG_CONFIG_HOME/opencode/opencode-status-line.json` instead.

When both files set the same key, the project file wins. When the host passes
entry options, those win over both. Keys you do not set keep their defaults.

Rules to remember:

- Every key is optional. Delete a key to go back to its default.
- Invalid JSON, unknown keys, and bad values do not break anything. The plugin
  keeps the old value and shows a warning toast.
- Settings are read when the plugin loads. If a change does not show up,
  restart OpenCode.

### Your first change

Create `~/.config/opencode/opencode-status-line.json` with something like:

```json
{
  "usage": { "labels": "words" },
  "colors": { "palette": "catppuccin" },
  "cap": { "gaugeWidth": 14 }
}
```

That changes the labels from glyphs to words, dresses the line in Catppuccin,
and draws a wider speed gauge. The next sections explain every key you can use.

### Install reminder

The plugin is CLI-only, so it goes in `~/.config/opencode/cli.json`, not
`opencode.json`:

```json
{
  "plugins": ["@rashidrazak/opencode-status-line"]
}
```

From a checkout, point at the folder instead — an absolute path or a path
relative to the config folder both work:

```json
{
  "plugins": ["/path/to/opencode-status-line"]
}
```

---

## 3. Pick the parts you want

`usage.segments` is the list of pieces the line draws, **in the order you
write them**.

```json
{
  "usage": { "segments": ["context", "meter", "cost"] }
}
```

The names you can use:

| Name | Draws | Hides itself when |
| --- | --- | --- |
| `shells` | `2 shells` | No shell commands are running |
| `context` | Context bar, `%`, token count | Nothing is in the context window yet |
| `cache` | `⧉ 99.8% — 571.8k` | Nothing has been read yet |
| `meter` | Gauge and speed readings | No speed figure exists yet |
| `cost` | `$0.75` | The session has cost nothing |
| `time` | `2h07m` | The session start time is unknown |
| `diff` | `+42 -7` | Your working tree is clean |

The default order is all seven:

```json
["shells", "context", "cache", "meter", "cost", "time", "diff"]
```

To remove a piece, leave it out. To move a piece, move its name in the list.
Duplicates and unknown names are ignored with a warning.

### Different segments per placement

When [`surface`](#4-move-the-line-around) puts the line in more than one place,
`usage.surfaces` gives a placement its own list. Surfaces you leave out draw
`usage.segments`, so without overrides every placement shows the same line.

```json
{
  "surface": ["app", "sidebar.footer"],
  "usage": {
    "segments": ["context", "cache", "meter", "cost", "time", "diff"],
    "surfaces": {
      "sidebar.footer": ["context", "meter"]
    }
  }
}
```

Each list follows the same rules as `usage.segments` — your order, duplicates
and unknown names dropped with a warning — and an empty list hides the line at
that placement. Naming a surface you did not put in `surface` is harmless and
unused.

**Get rid of the separators** with `usage.separator` (default `" │ "`, up to 8
characters):

```json
{
  "usage": {
    "segments": ["context", "meter"],
    "separator": "  "
  }
}
```

**Use words instead of glyphs** with `usage.labels`:

| Label | `"icons"` (default) | `"words"` |
| --- | --- | --- |
| Speed right now | `↯` | `↯` |
| Turn average | `μ` | `avg` |
| A settled step (folding off) | `✓` | `✓` |
| Cache | `⧉` | `cache` |

```json
{
  "usage": { "labels": "words" }
}
```

---

## 4. Move the line around

`surface` picks which slot of the OpenCode UI the line lives in — one slot, or
several at once. The default is `app`, the window's bottom row.

| Value | Where it goes |
| --- | --- |
| `"app"` (default) | The bottom row of the window, below OpenCode's own footer |
| `"prompt.footer"` | On the prompt footer row, to the right of OpenCode's usage text |
| `"prompt.footer.status"` | Inside the footer's status area, to the left of that text |
| `"session.composer.top"` | The row just above the message composer |
| `"home.footer.status"` | The footer of the home screen — the line hides there, since no conversation is open |
| `"sidebar.content"` | The sidebar body — segments stack one per row |
| `"sidebar.footer"` | The sidebar footer — segments stack one per row |

```json
{
  "surface": "prompt.footer"
}
```

To show the line in more than one place at once, give `surface` a list:

```json
{
  "surface": ["app", "sidebar.footer"]
}
```

Every placement draws `usage.segments` — or its own list from `usage.surfaces`
(see [Pick the parts you want](#3-pick-the-parts-you-want)) — under that
placement's own rules: a sidebar stacks them one per row, a one-line surface
joins and wraps them, the footer surfaces share their row with OpenCode's
text, and each surface's padding (including `app`'s indent and clear rows) is
read per placement. A name repeated in the list is drawn once; an unknown name
is ignored with a warning, and a list left with no known name keeps the
previous placements.

Notes:

- The two sidebar surfaces are narrow, so they stack segments vertically and
  cut a row with `…` when it is too long.
- The one-line surfaces join the segments across a line and wrap whole segments
  to further rows when space runs out.
- The footer surfaces share their row with OpenCode's own text, so they have
  less room than `app`.
- The home screen has no conversation open, so the line stays hidden there —
  and on any other screen without a session — whatever surfaces are configured.

### Padding

`padding.<surface>` adds empty cells around the line. Each side is a whole
number from 0 to 20.

| Surface | Default (left / right / top / bottom) |
| --- | --- |
| `app` | `2 / 2 / 0 / 2` |
| Every other surface | `0 / 0 / 0 / 0` |

Defaults exist because `app` sits in the window's last rows: it takes the
composer's 2-cell indent, a right margin, and two clear rows underneath.

Each surface keeps its own padding settings, so moving the line between
surfaces does not copy padding across. Set only the sides you want to change;
the rest keep the defaults above.

```json
{
  "surface": "app",
  "padding": {
    "app": { "bottom": 1 },
    "sidebar.content": { "left": 1, "right": 1 }
  }
}
```

---

## 5. Understand and tune the speed meter

OpenCode only reports exact token counts when a step finishes. While the model
is streaming, the plugin **estimates** speed from the characters it sees, then
corrects the estimate against the exact counts as they arrive.

### The three figures

| Figure | Label | What it means |
| --- | --- | --- |
| Sliding | `↯` | Speed over the last few seconds — what is happening right now |
| Cumulative | `μ` or `avg` | Average across this turn so far: exact tokens from finished steps plus the step in flight |
| Settled | `μ` / `avg` / `✓` | The final figure from a finished step or turn, kept on screen |

### Which readings you see

`readings` chooses the live figures, in order. The default is both.

```json
{ "readings": ["sliding", "cumulative"] }
```

- `["sliding"]` — only the right-now figure
- `["cumulative"]` — only the turn average
- `[]` — no live readings; show only the settled figure (the segment can be
  empty until something finishes)

### The sliding window

These keys control the `↯` reading:

| Key | Default | Allowed | What it does |
| --- | --- | --- | --- |
| `window.ms` | `3000` | 1–600000 | How far back the window looks, in milliseconds. Bigger = smoother, slower to react |
| `window.minSpanMs` | `800` | 0–600000 | Ignore spans shorter than this, so the first moment of a stream does not swing wildly |
| `window.minTps` | `0.5` | 0–10000 | Speeds below this count as silence and hide the reading |
| `window.bucketMs` | `100` | 1–10000 | Group incoming characters into buckets of this size before measuring |
| `window.hold` | `true` | true/false | Keep the last reading on screen (dimmed) after the stream stops |

```json
{
  "window": { "ms": 5000, "hold": false }
}
```

### The gauge

| Key | Default | Allowed | What it does |
| --- | --- | --- | --- |
| `cap.mode` | `"gauge"` | `"gauge"`, `"none"`, `"auto"` | Draw the gauge or not. `"auto"` is an old alias for `"gauge"` |
| `cap.gaugeWidth` | `11` | 1–60 | How many cells wide the gauge is |
| `cap.gaugeFloor` | `40` | 0–10000 | The gauge scale never drops below this speed (tok/s) |

The gauge's top of scale is the fastest figure the session has reached so far,
so a fast burst sets the scale and later slower output does not shrink it. The
bar only reads full when a new record is actually being set.

```json
{
  "cap": { "mode": "none" }
}
```

### Turn folding

`turn.fold` (default `true`) combines every step of a turn into one weighted
average. Turn it off if you would rather watch each step on its own — the
average then describes only the current step, and a finished step's figure
wears `✓`.

```json
{ "turn": { "fold": false } }
```

### Characters per token

The plugin converts streamed characters into tokens using a ratio. It starts at
4 characters per token and learns from each finished step.

| Key | Default | Allowed | What it does |
| --- | --- | --- | --- |
| `calibration.enabled` | `true` | true/false | Let finished steps adjust the ratio |
| `calibration.charsPerToken` | `4` | 0.5–50 | Starting guess, used until calibration has data |
| `calibration.min` | `2.5` | 0.5–50 | Guesses below this are thrown away |
| `calibration.max` | `7` | 0.5–50 | Guesses above this are thrown away |

`calibration.min` must be smaller than `calibration.max`. If you mix them up,
both go back to their defaults with a warning.

### History and stats

| Key | Default | Allowed | What it does |
| --- | --- | --- | --- |
| `history.samples` | `500` | 1–100000 | How many finished figures are kept for the stats dialog. Older ones are dropped |
| `stats.windowMs` | `60000` | 1000–86400000 | The stats dialog's rolling `avg` covers this much recent time, in milliseconds |

See [The stats dialog](#9-the-stats-dialog) for what those numbers look like.

---

## 6. Colours and themes

### Follow OpenCode (default)

With no colour settings, the line uses OpenCode's own theme tokens. Change your
TUI theme and the line follows.

### Bundled palettes

Set `colors.palette` to dress the line in a palette of its own, independent of
the TUI theme.

| Family | Variants |
| --- | --- |
| Catppuccin | `catppuccin-mocha`, `catppuccin-macchiato`, `catppuccin-frappe`, `catppuccin-latte` |
| Dracula | `dracula`, `alucard` |
| Gruvbox | `gruvbox-dark`, `gruvbox-light` |
| Nord | `nord` |
| Rosé Pine | `rose-pine`, `rose-pine-moon`, `rose-pine-dawn` |
| Tokyo Night | `tokyonight-night`, `tokyonight-storm`, `tokyonight-moon`, `tokyonight-day` |
| Monochrome | `grey`, `white` |

You can name a variant to pin it, or a family to follow OpenCode's light/dark
mode. For example, `"catppuccin"` means mocha in dark mode and latte in light
mode. The monochrome palettes give every status ink the same shade, so speeds,
the context bar and the diff all read flat.

```json
{
  "colors": { "palette": "tokyonight" }
}
```

### Recolour single inks

`colors.overrides` replaces one colour at a time. Values are `#rrggbb`. They
layer over your chosen palette, or over OpenCode's tokens when you did not pick
a palette.

| Ink | Used for |
| --- | --- |
| `text` | The body of the line |
| `muted` | Labels, separators, bar tracks, and held or settled figures |
| `success` | Fast speeds, a roomy context bar, added lines |
| `warning` | Middling speeds, a filling context bar |
| `error` | Slow speeds, a nearly full context bar, removed lines |

```json
{
  "colors": {
    "palette": "catppuccin-mocha",
    "overrides": { "muted": "#7f849c", "success": "#a6e3a1" }
  }
}
```

### Speed colour thresholds

`colors.fast` and `colors.slow` decide when a speed counts as fast, middling or
slow, in tokens per second:

- At or above `colors.fast` (default `50`) — green
- At or above `colors.slow` (default `20`) — yellow
- Below `colors.slow` — red

`colors.fast` must be above `colors.slow`. Otherwise both reset to the defaults
with a warning.

### Turn the status colours off

`colors.enabled: false` drops the green/yellow/red scale. The line then draws in
the body and muted inks only.

```json
{ "colors": { "enabled": false } }
```

### Keep a segment on the host theme

`colors.exclude` lists segments that always use OpenCode's own colours, ignoring
your palette and overrides. This is most useful with the monochrome palettes:

```json
{
  "colors": {
    "palette": "grey",
    "exclude": ["diff", "context"]
  }
}
```

The separators between segments stay with the palette.

---

## 7. The context bar

The context bar shows how much of the model's context window the newest request
used. It shares the gauge's drawing, so the two bars always match in width and
style unless you give the context bar its own width.

| Key | Default | Allowed | What it does |
| --- | --- | --- | --- |
| `usage.contextWidth` | `"gauge"` | `"gauge"` or 1–60 | Cells the bar draws. `"gauge"` matches `cap.gaugeWidth` |
| `usage.warnAt` | `70` | 0–100 | Fill turns yellow at this percent full |
| `usage.dangerAt` | `90` | 0–100 | Fill turns red at this percent full |

`usage.warnAt` must be below `usage.dangerAt`. If not, both reset to the
defaults with a warning.

```json
{
  "cap": { "gaugeWidth": 16 },
  "usage": { "contextWidth": 16, "warnAt": 60, "dangerAt": 85 }
}
```

If OpenCode does not know the model's context limit, the segment shows only the
token count — no bar, no percentage.

---

## 8. The uncommitted changes counter

The `diff` segment shows `+added -removed` lines across everything you have not
committed yet: staged, unstaged and untracked files. It asks OpenCode's own VCS
registry, so no `git` process runs behind it. A clean tree draws nothing.

| Key | Default | Allowed | What it does |
| --- | --- | --- | --- |
| `diff.refreshMs` | `5000` | 500–600000 | How often, in milliseconds, the counter asks for fresh numbers. A turn ending also refreshes it straight away |

Use a smaller value if you want the counter to chase your edits more closely:

```json
{ "diff": { "refreshMs": 2000 } }
```

---

## 9. The stats dialog

Run `/opencode-status-line` (alias `/tps`, also available in the command
palette) to see the numbers behind the meter:

- the current readings, in the same shape as the line
- `avg` — the average over the last `stats.windowMs` of finished turns
- `mean` — the average of every kept figure
- `p95` — the 95th percentile, a typical high figure
- how many figures are behind the statistics

The stats are per process. Restarting OpenCode clears them, because the plugin
does not store them on disk. A resumed session rebuilds its last settled figure
from the stored messages, so the meter segment is not blank after a restart —
the live `↯` figure returns with the next stream.

---

## 10. All settings at a glance

Every key, its default, and the values it accepts. All keys are optional.

### Placement

| Key | Default | Accepts |
| --- | --- | --- |
| `surface` | `["app"]` | A slot name, or an array of names: `"prompt.footer.status"`, `"prompt.footer"`, `"app"`, `"sidebar.content"`, `"sidebar.footer"`, `"session.composer.top"`, `"home.footer.status"` |
| `padding.<surface>.left` | `2` for `app`, else `0` | whole number 0–20 |
| `padding.<surface>.right` | `2` for `app`, else `0` | whole number 0–20 |
| `padding.<surface>.top` | `0` | whole number 0–20 |
| `padding.<surface>.bottom` | `2` for `app`, else `0` | whole number 0–20 |

### Segments and labels

| Key | Default | Accepts |
| --- | --- | --- |
| `usage.segments` | `["shells", "context", "cache", "meter", "cost", "time", "diff"]` | Any subset of those names, in any order |
| `usage.surfaces.<surface>` | `{}` | A map of surface name → segment list; a surface left out draws `usage.segments` |
| `usage.labels` | `"icons"` | `"icons"` or `"words"` |
| `usage.separator` | `" │ "` | A non-empty string of up to 8 characters |

### Speed readings

| Key | Default | Accepts |
| --- | --- | --- |
| `readings` | `["sliding", "cumulative"]` | `"sliding"`, `"cumulative"`, or both; `[]` for settled figures only |
| `window.ms` | `3000` | number 1–600000 |
| `window.minSpanMs` | `800` | number 0–600000 |
| `window.minTps` | `0.5` | number 0–10000 |
| `window.bucketMs` | `100` | number 1–10000 |
| `window.hold` | `true` | `true` / `false` |
| `turn.fold` | `true` | `true` / `false` |
| `calibration.enabled` | `true` | `true` / `false` |
| `calibration.charsPerToken` | `4` | number 0.5–50 |
| `calibration.min` | `2.5` | number 0.5–50, below `calibration.max` |
| `calibration.max` | `7` | number 0.5–50, above `calibration.min` |

### Gauge and bar

| Key | Default | Accepts |
| --- | --- | --- |
| `cap.mode` | `"gauge"` | `"gauge"`, `"none"`, `"auto"` (alias for `"gauge"`) |
| `cap.gaugeWidth` | `11` | number 1–60 |
| `cap.gaugeFloor` | `40` | number 0–10000 |
| `usage.contextWidth` | `"gauge"` | `"gauge"` or a number 1–60 |
| `usage.warnAt` | `70` | number 0–100, below `usage.dangerAt` |
| `usage.dangerAt` | `90` | number 0–100, above `usage.warnAt` |

### Colours

| Key | Default | Accepts |
| --- | --- | --- |
| `colors.enabled` | `true` | `true` / `false` |
| `colors.fast` | `50` | number 1–10000, above `colors.slow` |
| `colors.slow` | `20` | number 0–10000, below `colors.fast` |
| `colors.palette` | `"host"` | `"host"` or a bundled palette name or family (see [Colours and themes](#6-colours-and-themes)) |
| `colors.overrides` | `{}` | Any of `text`, `muted`, `success`, `warning`, `error` mapped to `#rrggbb` |
| `colors.exclude` | `[]` | Any subset of the segment names |

### Everything else

| Key | Default | Accepts |
| --- | --- | --- |
| `history.samples` | `500` | number 1–100000 |
| `stats.windowMs` | `60000` | number 1000–86400000 |
| `diff.refreshMs` | `5000` | number 500–600000 |

---

## 11. Ready-made setups

Copy any block into your config file as a starting point.

**Just the essentials** — context, speed, cost:

```json
{
  "usage": { "segments": ["context", "meter", "cost"] }
}
```

**Words instead of icons:**

```json
{
  "usage": { "labels": "words" }
}
```

**No gauge**, just the numbers:

```json
{
  "cap": { "mode": "none" }
}
```

**Settled figures only**, no live readings:

```json
{
  "readings": []
}
```

**A calmer meter** — longer window, no held reading:

```json
{
  "window": { "ms": 5000, "hold": false }
}
```

**A wider gauge and context bar:**

```json
{
  "cap": { "gaugeWidth": 20 },
  "usage": { "contextWidth": 20 }
}
```

**A flat monochrome line**, with the diff still in colour:

```json
{
  "colors": {
    "palette": "grey",
    "exclude": ["diff"]
  }
}
```

**A custom look:**

```json
{
  "colors": {
    "palette": "tokyonight",
    "overrides": { "success": "#9ece6a", "error": "#f7768e", "muted": "#565f89" },
    "fast": 40,
    "slow": 15
  },
  "usage": { "separator": "  ", "labels": "words" }
}
```

**Put it in the sidebar**, where segments stack one per row:

```json
{
  "surface": "sidebar.content",
  "usage": { "segments": ["context", "cache", "meter", "cost", "diff"] }
}
```

**Put it in two places at once** — the bottom row and the prompt footer:

```json
{
  "surface": ["app", "prompt.footer"]
}
```

**Give each placement its own pieces** — the full line at the bottom, just
context and speed in the sidebar footer:

```json
{
  "surface": ["app", "sidebar.footer"],
  "usage": {
    "surfaces": { "sidebar.footer": ["context", "meter"] }
  }
}
```

**Silence one placement** — keep the line at the bottom, hide it in the
sidebar, with an empty list:

```json
{
  "surface": ["app", "sidebar.footer"],
  "usage": { "surfaces": { "sidebar.footer": [] } }
}
```

**Clear the extra rows under the bottom line:**

```json
{
  "surface": "app",
  "padding": { "app": { "bottom": 0 } }
}
```

**Always refresh the changes counter quickly:**

```json
{
  "diff": { "refreshMs": 1000 }
}
```

**Warn earlier that the context is filling:**

```json
{
  "usage": { "warnAt": 55, "dangerAt": 80 }
}
```

---

## 12. Common questions and fixes

**My settings did nothing.**
Check the file name and location. The global file is
`~/.config/opencode/opencode-status-line.json`; the project file is
`.opencode-status-line.json` in the folder where you started OpenCode. Also
restart OpenCode — settings are read when the plugin loads.

**I see a warning popup.**
That is by design. Bad JSON, unknown keys, and values outside their allowed
range are reported and ignored; nothing breaks. Fix the file or remove the key
to silence it.

**A segment disappeared.**
Segments hide themselves when they have nothing to say: no cost yet, a clean
tree, no cache reads, no running shells. That is normal. Also check the
segment is still in `usage.segments`, and — when the line is placed in several
slots — that the placement has not given itself its own list in
`usage.surfaces`, which replaces the shared one.

**The speed colour is always red.**
Raise `colors.slow` and `colors.fast`, or turn the status colours off with
`colors.enabled: false`.

**The gauge never looks full.**
Its scale is the session's fastest speed so far, so it stays honest. To change
the starting scale, use `cap.gaugeFloor`.

**The context bar is missing.**
The segment shows only the token count when OpenCode does not know the model's
context limit. That is the host's knowledge, not a setting.

**The `+/-` counter missed a big new file.**
OpenCode caps how much of an untracked file it reads for line counts, so a very
large new file can count as zero lines. The plugin shows the host's figure.

**Two settings fought each other.**
Three pairs must be ordered: `colors.fast` above `colors.slow`,
`calibration.min` below `calibration.max`, and `usage.warnAt` below
`usage.dangerAt`. If you swap them, both values in the pair go back to their
defaults with a warning.

**The line looks different on a narrow window.**
That is the wrapping at work. Whole segments move to the next row, and a single
segment wider than the line is cut with an `…`. Widen the window and the line
returns to one row.

**The log says `Cannot find package 'react'` and the line never appears.**
Versions before 1.0.2 compiled the entry against the React runtime when
installed from npm, and React is not a dependency. Update the plugin to 1.0.2
or newer — if `cli.json` pins a version, bump it — and restart OpenCode.
