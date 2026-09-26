/**
 * The uncommitted-change counter behind the diff segment. The host's VCS
 * registry owns the diffing — `client.vcs.status` describes a location's
 * working tree (staged, unstaged and untracked changes), whatever provider the
 * location uses — and this module folds its per-file figures into the two the
 * line draws, plus the cache policy that keeps the asking rare.
 *
 * Pure and free of host imports, so the arithmetic and the policy can be
 * exercised without a terminal:
 *
 *   bun test test/diff.test.ts
 */
import { compact } from "./format.ts"

/** A file's status entry as the host reports it, read defensively. */
export interface StatusFile {
  additions?: number
  deletions?: number
}

/** Additions and deletions across a location's uncommitted changes. */
export interface DiffStat {
  added: number
  deleted: number
}

/**
 * Fold the host's per-file figures. A file it could not measure — a binary, an
 * untracked file past the host's read cap, a provider without line counts —
 * arrives absent or zero and counts nothing, rather than poisoning the sum
 * with NaN.
 */
export function diffTotals(files: readonly StatusFile[] | undefined): DiffStat {
  let added = 0
  let deleted = 0
  for (const file of files ?? []) {
    if (typeof file?.additions === "number" && Number.isFinite(file.additions)) added += file.additions
    if (typeof file?.deletions === "number" && Number.isFinite(file.deletions)) deleted += file.deletions
  }
  return { added, deleted }
}

/** One side of the counter: the sign says which side, the tone follows it. */
export interface DiffPart {
  side: "added" | "deleted"
  /** `+12`, `-3` — signed, and compact past a thousand. */
  text: string
}

/**
 * The counter's pieces for a stat: `+12 -3`. A zero side drops out, so a clean
 * tree draws nothing and the segment disappears along with its separator.
 */
export function diffParts(stat: DiffStat): DiffPart[] {
  const parts: DiffPart[] = []
  if (stat.added > 0) parts.push({ side: "added", text: `+${compact(stat.added)}` })
  if (stat.deleted > 0) parts.push({ side: "deleted", text: `-${compact(stat.deleted)}` })
  return parts
}

/** A cached reading: the figures, and when the host was last asked. */
export interface DiffReading {
  stat: DiffStat
  at: number
}

/** Whether the cached reading is old enough to ask the host again. */
export function diffDue(reading: DiffReading | undefined, now: number, refreshMs: number): boolean {
  return reading === undefined || now - reading.at >= refreshMs
}

/**
 * The cache key for a location. Sessions in one working tree share a reading —
 * the working tree is the unit the host answers for — while two workspaces
 * that happen to share a path can never collide.
 */
export function diffKey(location: { directory?: string | null; workspaceID?: string } | undefined): string {
  return `${location?.workspaceID ?? ""}\u0000${location?.directory ?? ""}`
}
