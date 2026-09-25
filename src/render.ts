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
}

/** How the gauge is chosen; `auto` is the historical alias for `gauge`. */
export type CapStyle = "auto" | "gauge" | "none"

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
  const { fill, track } = cells(frac, width)
  const runs: Run[] = [{ text: "▕", tone: "muted" }]
  if (fill.length > 0) runs.push({ text: fill, tone: speedTone(tps, fast, slow) })
  if (track.length > 0) runs.push({ text: track, tone: "muted" })
  runs.push({ text: "▏", tone: "muted" })
  return runs
}

/**
 * Context-window bar: `▐████████······▌`. The fill wears the pressure tone the
 * caller chose — green while there is room, red near the limit.
 */
export function contextBar(ratio: number, width: number, tone: RunTone = "success"): Run[] {
  const { fill, track } = cells(ratio, width)
  const runs: Run[] = [{ text: "▐", tone: "muted" }]
  if (fill.length > 0) runs.push({ text: fill, tone })
  if (track.length > 0) runs.push({ text: track, tone: "muted" })
  runs.push({ text: "▌", tone: "muted" })
  return runs
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
