# opencode-status-line

OpenCode v2 TUI plugin: a prompt-footer status line (context, cache, streaming
speed, cost, elapsed time). `README.md` is the user-facing reference for
behaviour and every config key.

## What is unusual here

- **No build step.** `package.json` publishes the source (`./tui` →
  `src/tui.tsx`) and OpenCode transpiles it on load; don't add a bundler or
  lockfile. Nothing needs installing to work on the plugin — `bun test` is the
  whole verification.
- **`src/tui.tsx` is the plugin entry**, loaded straight from this checkout —
  the live host's `~/.config/opencode/cli.json` lists the directory. OpenCode
  transpiles the TSX on load and hot-reloads on save, so a broken save shows up
  in the running TUI immediately. The plugin cannot run standalone; verify
  runtime changes by hand in a session (`/opencode-status-line` opens the stats
  dialog).
- **The root `tui.tsx` is a load-bearing shim** re-exporting `src/tui.tsx`. The
  running 2.0.16 loader resolves a directory plugin through `<dir>/tui` before
  checking `package.json` exports; deleting the shim drops the plugin from the
  live TUI. npm consumers resolve `opencode-status-line/tui` through exports to
  `src/tui.tsx` instead.
- Internal imports carry `.ts`/`.tsx` extensions (`./rate.ts`); the host
  resolves them verbatim, so keep that style.

## Layout

| Path | Role |
| --- | --- |
| `src/tui.tsx` | Entry: event wiring, slot render, command. The only file importing `@opencode/plugin`, `solid-js`, or host APIs. |
| `src/rate.ts` | Speed maths (sliding window, turn fold, calibration, history) and the `USAGE_LABELS` icon/word sets. Pure. |
| `src/render.ts` | Gauge and context-bar geometry, run cutting and wrapping for narrow widths. Pure. |
| `src/format.ts` | Token / money / duration formatting. Pure. |
| `src/config.ts` | JSON config loader; pure except an injectable `read`. |
| `test/*.test.ts` | One per pure module; `bun test` runs all four. |
| `tui.tsx` | Root shim re-exporting `src/tui.tsx`; see above. |

Keep new logic in the pure modules so it can be tested without a terminal.

## Host-API traps (each cost a TUI restart to learn)

- Register the keymap layer inside the `app` slot's `render`, never directly in
  `setup`: v2 keeps the keymap provider in the component tree, so a `setup`
  registration throws `Keymap.Provider is missing` and kills the plugin.
- Build rendered parts inside a `createMemo`. `Show` calls its children
  untracked, so a plain array is evaluated once and the line never repaints.
- Route every event handler through `safely`; an uncaught throw inside one can
  kill the plugin generation, and a half-saved file has done exactly that.
- Saving any `src/` file the entry imports hot-reloads the plugin: the module is
  re-imported and module scope comes back empty, which used to blank the meter
  segment mid-turn on every save. State that must outlive a generation lives on
  `globalThis` (`sharedMeters` in `src/tui.tsx`). Touching `README.md` or
  `test/` does not reload; the `src/` imports do.
- The meters are process-scoped too, so a session met without one — a resume, or
  a reload before any delta — has its last figure seeded from the stored
  messages: the step in flight from its streaming message, a finished turn's
  settled figure from assistant tokens and decode spans (`recordedSteps` /
  `restoreFinal` in `src/rate.ts`). The seed is lazy — the meter branch in
  `usageRows` kicks it when the map misses — and retries on later paints until a
  foldable turn appears: the host hydrates messages page by page, so a cache
  whose tail has no `user` message is a partial page, and `recordedSteps`
  returns undefined rather than folding it (a tail folded as a turn once showed
  261 where the full turn was 243). One `message.sync` per session forces the
  full fetch. On success the seed sets `final` plus a resting zero `sliding`
  (empty gauge, `↯ 0.0`) and never the `turn` fold a later step would absorb.
  `time.streamed` is a stream-finalisation stamp, not a first token: the span
  starts at the first reasoning part's timestamp (`firstTokenAt`), or at the
  message start when the record kept none. The rebuilt figure is close to, not
  bit-identical with, the live one: the live span ran between event timestamps
  the record does not keep, so the fold can sit around a percent away — accept
  the tolerance, don't chase it with tool-time heuristics (last-tool-created and
  tool-run subtraction both overshoot). The window samples and the statistics
  are memory-only.
- The session record (`data.session.get`) holds token totals cumulative across
  all turns. Context and cache must read the newest assistant message's own
  `tokens` (`windowInfo` in `src/tui.tsx`), or every prompt ever sent is counted.
- Exact token counts arrive only at `session.step.ended`; live figures are
  estimates from stream deltas, calibrated at that point. Prefer the server's
  `event.created` clock for step spans and fall back to local arrival times —
  never mix the two (see `endStep` in `src/rate.ts`). Tool-argument deltas
  (`session.tool.input.delta`) count as output, and the decode span starts at
  the first token, so TTFT is not charged.
- Shell counts come from the host's shell registry (`context.data.shell`),
  which holds a shell only while it executes; background shells live in a
  separate registry and never appear there. Match
  `status === "running"` and `metadata.sessionID`.
- `session.idle` also closes a turn as a late belt; `endTurn` is idempotent, so
  double-closing is safe.
- A `sidebar.*` surface is a narrow column: `stackFor` stacks the segments one
  per row and each row is cut to `columnWidth(context.renderer.width)` with an
  ellipsis. `context.renderer` is the shared OpenTUI renderer, so read its width
  inside the render memo — the window resizes under the line.
- `app` is the window's bottom row: `paddingFor` gives it the composer's 2-column
  indent, a right margin and two clear rows underneath (each side overridable
  per surface through the `padding` config). The host sizes the slot to its
  content — `padding.bottom` already proves that — so the line adds a row
  rather than being clipped.
- A one-line surface fits itself to the width its box was **dealt by layout**,
  not `context.renderer.width`: a footer row shares its width with OpenCode's
  own status text, so the renderer overstates ours. `onSizeChange` reports the
  box's border-box width after every layout pass; store it in a signal (defer
  the write with `queueMicrotask` — the handler runs inside layout) and
  `wrapRows` moves segments that do not fit whole to further rows, with no cap;
  only a segment wider than the line is cut.
- A box in a host row (`sharesHostRow`) pins its **unwrapped** width as its
  `flexBasis`. A row child's width otherwise derives from its own drawn
  content, so once the line wrapped, the box's basis was the wrapped width:
  the shrink deal kept shrinking it and widening the window could never
  restore the line. With the basis pinned, the deal does not move, the
  measurement settles in one pass, and a widened row gets the full line back.
  `app`, the composer top and the sidebars stretch to the host's width and
  need no basis. Footers and sidebars are placed by the host and take no
  padding by default.
- A 250 ms ticker repaints only while a stream is active; a 1 s heartbeat keeps
  the elapsed timer and held figures repainting when nothing streams. Stop
  both in the cleanup function.

## Config

Precedence: `~/.config/opencode/opencode-status-line.json` (honours
`XDG_CONFIG_HOME`) → `<project>/.opencode-status-line.json` → plugin entry
options. Invalid files or values warn and are ignored, never fatal. Adding a
key means `Config` + `DEFAULT_CONFIG` + validation in `src/config.ts`, plus
`rateOptions` if it is maths, plus the README table — the README is the key
reference, so keep it in sync. `test/config.test.ts` injects a fake `read`;
never touch disk from a test.

## Commands

```
bun test                       # all test files
bun test test/rate.test.ts     # one module
```

## Publishing

`npm pack --dry-run` inspects the tarball; `npm publish` ships it. The package
is published as source, so `files` in `package.json` carries `src/` wholesale —
every module `src/tui.tsx` imports must be under it, or installs break. The
root shim stays out of the tarball; npm resolution goes through `exports`.
`@opencode/plugin` is the dependency; `@opentui/core`, `@opentui/solid`, and
`solid-js` are peers OpenCode provides. The plugin is CLI-only, so consumers
add the package name to `cli.json`, never `opencode.json`.
