/**
 * Presentation geometry for the line: the live eighth-cell speed gauge and the
 * context-window bar, as tone-tagged runs for the TUI to colour.
 *
 * Pure and JSX-free, so the geometry can be asserted without a terminal:
 *
 *   bun test test/render.test.ts
 */
import { speedTone, type SpeedTone } from "./rate.ts"

export type RunTone = "muted" | SpeedTone

export interface Run {
  text: string
  tone?: RunTone
  /** Draw this run in the muted shade of its tone (held or settled figures). */
  dim?: boolean
  /** Clicking this run calls this; the shells count opens its list. */
  onClick?: () => void
}

/** How the gauge is chosen; `auto` is the historical alias for `gauge`. */
export type CapStyle = "auto" | "gauge" | "none"

/**
 * Cut a run list to `width` cells, each run keeping its tone, ending in `…`
 * when something had to go. A sidebar column must not spill past the host's
 * edge, and a silently clipped tail reads as a bug rather than a shortage.
 */
export function cutRuns(runs: readonly Run[], width: number): Run[] {
  if (width <= 0) return []
  const kept: Run[] = []
  let used = 0
  for (const run of runs) {
    if (used >= width) break
    const room = width - used
    if (run.text.length <= room) {
      kept.push(run)
      used += run.text.length
      continue
    }
    const text = room <= 1 ? "…" : `${run.text.slice(0, room - 1)}…`
    kept.push({ ...run, text })
    used += text.length
    break
  }
  return kept
}

/** A sidebar column's width: the sidebar's share of the window, never narrower than 10 cells. */
export function columnWidth(viewport: number): number {
  return Math.max(10, Math.floor(viewport / 4))
}

export interface CapInput {
  style: CapStyle
  /** The figure the gauge shows and colours by. */
  primary: number
  /** Highest figure the session has reached, so the gauge has a scale. */
  peak: number
  gaugeWidth: number
  gaugeFloor: number
  fast: number
  slow: number
}

/** Fractions of a cell, indexed by eighths left over. */
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"]
const TRACK = "·"
/** The light vertical edges both bars wear, so they read as one family. */
const EDGE_START = "▕"
const EDGE_END = "▏"

/** Fill and remaining track for a ratio, at eighth-cell resolution. */
function cells(ratio: number, width: number): { fill: string; track: string } {
  const frac = Math.min(1, Math.max(0, ratio))
  const eighths = Math.round(frac * width * 8)
  const full = Math.floor(eighths / 8)
  const rest = eighths % 8
  let fill = "█".repeat(Math.min(full, width))
  if (full < width && rest > 0) fill += EIGHTHS[rest]
  return { fill, track: TRACK.repeat(Math.max(0, width - fill.length)) }
}

/**
 * One bar, assembled: `▕████▋···▏`. Both bars are this same drawing at the
 * same width, so they match in cells, edges, columns and level count; only
 * the fill's tone and what the ratio means differ.
 */
function barRuns(ratio: number, width: number, fillTone: RunTone): Run[] {
  const { fill, track } = cells(ratio, width)
  const runs: Run[] = [{ text: EDGE_START, tone: "muted" }]
  if (fill.length > 0) runs.push({ text: fill, tone: fillTone })
  if (track.length > 0) runs.push({ text: track, tone: "muted" })
  runs.push({ text: EDGE_END, tone: "muted" })
  return runs
}

/**
 * Live eighth-cell gauge: `▕████▋···▏`. Fill is the speed tone; the track is
 * muted. Scale is the session's high-water mark, never below `floor`, so the
 * bar does not rescale under every tick.
 */
export function gauge(
  tps: number,
  peak: number,
  width: number,
  floor: number,
  fast = 50,
  slow = 20,
): Run[] {
  const scale = Math.max(peak, floor)
  const frac = scale > 0 ? tps / scale : 0
  return barRuns(frac, width, speedTone(tps, fast, slow))
}

/**
 * Context-window bar: `▕████████······▏`, the gauge's drawing with the
 * pressure tone the caller chose — green while there is room, red near the
 * limit.
 */
export function contextBar(ratio: number, width: number, tone: RunTone = "success"): Run[] {
  return barRuns(ratio, width, tone)
}

/** The leading drawing: the gauge, unless the style turns it off. */
export function gaugeFor(input: CapInput): Run[] {
  if (input.style === "none") return []
  return gauge(
    input.primary,
    Math.max(input.peak, input.primary),
    input.gaugeWidth,
    input.gaugeFloor,
    input.fast,
    input.slow,
  )
}
