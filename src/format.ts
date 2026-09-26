/**
 * Formatting for the usage line: token counts, money, elapsed time, and the
 * readings drawn from a session's token record.
 *
 * Pure and JSX-free, so every figure can be asserted without a terminal:
 *
 *   bun test test/format.test.ts
 */

/** `572.7k`, `1.2M` — compact counts with one decimal past a thousand. */
export function compact(value: number): string {
  if (value < 1_000) return String(Math.round(value))
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/** `$0.75` — US dollars, two decimals. */
export function money(value: number): string {
  return `$${value.toFixed(2)}`
}

/** `45s`, `12m04s`, `2h07m` — coarse by design; it is a glance, not a stopwatch. */
export function duration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, "0")}m`
}

/** The shape of a session's cumulative token record, read defensively. */
export interface TokenRecord {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

/**
 * Everything the model reads back — what occupies the context window. The same
 * sum OpenCode's own display uses: prompt, generated, and both cache sides.
 */
export function contextUsed(tokens?: TokenRecord): number {
  if (!tokens) return 0
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  )
}

/** How much of the window came from cache, or undefined when nothing is read. */
export function cacheShare(tokens?: TokenRecord): number | undefined {
  const used = contextUsed(tokens)
  if (used <= 0) return undefined
  return (tokens?.cache?.read ?? 0) / used
}

/** `1 shell`, `3 shells` — the running-shell count on the usage line. */
export function shellsLabel(count: number): string {
  return `${count} shell${count === 1 ? "" : "s"}`
}

export type PressureTone = "success" | "warning" | "error"

/** Green while there is room, yellow as it fills, red near the limit. */
export function pressureTone(ratio: number, warnAt = 0.7, dangerAt = 0.9): PressureTone {
  return ratio >= dangerAt ? "error" : ratio >= warnAt ? "warning" : "success"
}
