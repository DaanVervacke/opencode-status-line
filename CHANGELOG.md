# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-27

Initial release.

### Added

- A live status line for OpenCode v2's CLI prompt footer, placed in one slot
  or several at once (`surface`), each placement stacking its own segments and
  padding
- Context-window segment: a pressure-coloured bar, the used percentage and the
  token count, read from the newest assistant message and sized to the model's
  window
- Cache segment: the cached share of what the model read
- Speed meter: a sliding live reading (`↯`) and the turn average (`μ`)
  estimated from stream deltas and calibrated against exact token counts as
  each step ends, with the settled figure held after a stream stops and
  rebuilt for a resumed session
- Cost and elapsed-time segments
- Uncommitted-changes segment (`+42 -7`) from OpenCode's own VCS registry, with
  a configurable refresh interval
- Running-shells segment, clickable to open the composer's Shell tab
- `/opencode-status-line` command (alias `/tps`) with the numbers behind the
  meter
- Segment order and visibility (`usage.segments`), overridable per placement
  through `usage.surfaces`
- Whole-segment wrapping onto further rows on narrow windows, and one-per-row
  stacking in a sidebar
- Bundled Catppuccin, Dracula, Gruvbox, Nord, Rosé Pine and Tokyo Night
  palettes plus flat `grey` and `white`, with host-theme colours, per-tone
  overrides and per-segment colour exclusion
- JSON configuration from `~/.config/opencode/opencode-status-line.json`, a
  project's `.opencode-status-line.json` and plugin entry options, validated
  with warnings that never break the line

[Unreleased]: https://github.com/rashidrazak/opencode-status-line/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rashidrazak/opencode-status-line/releases/tag/v0.1.0
