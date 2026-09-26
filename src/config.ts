/**
 * Configuration for the opencode-status-line plugin, read from JSON files
 * beside OpenCode's own config so a published package never carries it:
 *
 *   ~/.config/opencode/opencode-status-line.json  every project
 *   <project>/.opencode-status-line.json          one project
 *   plugin entry options                          the last word, where a host passes them
 *
 * Later sources win key by key. An unreadable or invalid file is ignored with a
 * warning rather than taken as fatal, and an unknown key costs only itself.
 *
 * Pure except for the file reads it is handed, so precedence and validation can
 * be exercised without touching a disk (`bun test test/config.test.ts`).
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  HOST_PALETTE,
  isHexColor,
  isPaletteChoice,
  PALETTE_FAMILIES,
  TONE_KEYS,
  type ToneOverrides,
} from "./palette.ts"
import { DEFAULT_RATE, type LabelStyle, type LiveReading, type RateOptions } from "./rate.ts"
import type { CapStyle } from "./render.ts"

/**
 * The slot paths the line may claim. `surface` takes one of these or an array
 * of them, so the same line can live in several places at once.
 */
export const SURFACES = [
  "prompt.footer.status",
  "prompt.footer",
  "app",
  "sidebar.content",
  "sidebar.footer",
  "session.composer.top",
  "home.footer.status",
] as const
export type Surface = (typeof SURFACES)[number]

/**
 * How a surface lays the segments out. A sidebar is a narrow column — across,
 * it would be a row of truncated words — so its segments stack, one per row.
 * Every other surface runs them across a single line.
 */
export function stackFor(surface: Surface): "row" | "column" {
  return surface.startsWith("sidebar.") ? "column" : "row"
}

/**
 * Whether the host places the slot as one child of a flex row it owns (the
 * footer contributions share the row with OpenCode's own text) rather than
 * giving it the full width (the `app` line, the composer top, a sidebar
 * column). Only a row child needs its natural width held as a flex basis: its
 * dealt width otherwise depends on its own drawn content, so a wrapped line
 * would pin the box narrow and never grow back.
 */
export function sharesHostRow(surface: Surface): boolean {
  return surface.startsWith("prompt.footer") || surface.startsWith("home.footer")
}

/** Room, in cells, around a drawn line. */
export interface Padding {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * The breathing room a surface needs to sit level with the host's own content.
 * `app` draws at the window's bottom: the host indents its composer and footer
 * by two columns, and a line in the terminal's last rows reads as clipped — so
 * it takes that indent, a right margin, and two clear rows underneath. Footers
 * and sidebars are placed by the host and stay flush. Any side can be
 * overruled through the `padding` config; unset sides keep these defaults.
 */
export function paddingFor(surface: Surface): Padding {
  return surface === "app"
    ? { left: 2, right: 2, top: 0, bottom: 2 }
    : { left: 0, right: 0, top: 0, bottom: 0 }
}

/**
 * Padding overrides, keyed by surface: each placement carries its own set, so
 * changing `surface` swaps the whole set rather than reapplying one.
 */
export type SurfacePadding = Partial<Record<Surface, Partial<Padding>>>

/** The pieces the usage line can draw, in whatever order the config asks. */
export const USAGE_SEGMENTS = ["shells", "context", "cache", "meter", "cost", "time", "diff"] as const
export type UsageSegment = (typeof USAGE_SEGMENTS)[number]

export type CapMode = CapStyle

/** A bar's cell count, or `"gauge"` to take the speed gauge's width. */
export type BarWidth = number | "gauge"

export interface Config {
  /** The slots the line claims, in config order; one or several at once. */
  surface: Surface[]
  /** Which live readings the line shows, in order. Empty shows only settled figures. */
  readings: LiveReading[]
  windowMs: number
  minSpanMs: number
  minTps: number
  bucketMs: number
  /** Keep the last sliding reading on screen after a stream stops. */
  holdSliding: boolean
  calibrate: boolean
  charsPerToken: number
  ratioMin: number
  ratioMax: number
  turnFold: boolean
  capMode: CapMode
  gaugeWidth: number
  gaugeFloor: number
  colors: boolean
  /** The palette the line draws with: `host`, a bundled variant or a family. */
  palette: string
  /** Per-tone hex recolours, over the palette or the host theme's tokens. */
  toneOverrides: ToneOverrides
  /** Segments that keep the host theme's colours even when a palette is chosen. */
  excludeSegments: UsageSegment[]
  fastTps: number
  slowTps: number
  historySamples: number
  statsWindowMs: number
  /** The usage line's segments, in order; the default for every placement. */
  usageSegments: UsageSegment[]
  /** Per-surface segment lists; a surface absent here draws `usageSegments`. */
  surfaceSegments: Partial<Record<Surface, UsageSegment[]>>
  /** How the line's fixed words read: glyphs, or spelled out. */
  labels: LabelStyle
  /** Drawn between segments of the usage line. */
  usageSeparator: string
  /** How often the diff segment re-asks the host's VCS registry, in ms. */
  diffRefreshMs: number
  /** Cells the context bar draws; `"gauge"` matches `cap.gaugeWidth`. */
  contextWidth: BarWidth
  /** Context fill turns yellow at this percentage. */
  contextWarn: number
  /** Context fill turns red at this percentage. */
  contextDanger: number
  /** Padding overrides per surface; sides left out keep that surface's default. */
  padding: SurfacePadding
}

export const DEFAULT_CONFIG: Config = {
  surface: ["app"],
  readings: ["sliding", "cumulative"],
  windowMs: DEFAULT_RATE.windowMs,
  minSpanMs: DEFAULT_RATE.minSpanMs,
  minTps: DEFAULT_RATE.minTps,
  bucketMs: DEFAULT_RATE.bucketMs,
  holdSliding: DEFAULT_RATE.holdSliding,
  calibrate: DEFAULT_RATE.calibrate,
  charsPerToken: DEFAULT_RATE.charsPerToken,
  ratioMin: DEFAULT_RATE.ratioMin,
  ratioMax: DEFAULT_RATE.ratioMax,
  turnFold: DEFAULT_RATE.turnFold,
  capMode: "gauge",
  gaugeWidth: 11,
  gaugeFloor: 40,
  colors: true,
  palette: HOST_PALETTE,
  toneOverrides: {},
  excludeSegments: [],
  fastTps: 50,
  slowTps: 20,
  historySamples: DEFAULT_RATE.historySamples,
  statsWindowMs: 60_000,
  usageSegments: [...USAGE_SEGMENTS],
  surfaceSegments: {},
  labels: "icons",
  usageSeparator: " │ ",
  diffRefreshMs: 5_000,
  contextWidth: "gauge",
  contextWarn: 70,
  contextDanger: 90,
  padding: {},
}

/** The context bar's cell count, with `"gauge"` resolved to the gauge's width. */
export function contextBarWidth(config: Config): number {
  return config.contextWidth === "gauge" ? config.gaugeWidth : config.contextWidth
}

/**
 * The room around the line in one placement: that surface's default with its
 * own overrides. Each placement in `config.surface` resolves its own padding,
 * so a multi-surface config never shares one placement's overrides with
 * another.
 */
export function resolvedPadding(config: Config, surface: Surface): Padding {
  return { ...paddingFor(surface), ...config.padding[surface] }
}

/**
 * The segments one placement draws: its own list where `usage.surfaces` names
 * it, the shared `usage.segments` otherwise. An override left empty hides the
 * line at that surface.
 */
export function segmentsFor(config: Config, surface: Surface): UsageSegment[] {
  return config.surfaceSegments[surface] ?? config.usageSegments
}

/** The maths half of the config, for `rate.ts`. */
export function rateOptions(config: Config): RateOptions {
  return {
    windowMs: config.windowMs,
    minSpanMs: config.minSpanMs,
    minTps: config.minTps,
    bucketMs: config.bucketMs,
    holdSliding: config.holdSliding,
    calibrate: config.calibrate,
    charsPerToken: config.charsPerToken,
    ratioMin: config.ratioMin,
    ratioMax: config.ratioMax,
    turnFold: config.turnFold,
    historySamples: config.historySamples,
  }
}

/** Where configuration is read from, lowest precedence first. */
export function configPaths(
  directory: string,
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const root =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0 ? env.XDG_CONFIG_HOME : join(home, ".config")
  return [join(root, "opencode", "opencode-status-line.json"), join(directory, ".opencode-status-line.json")]
}

export interface LoadDeps {
  /** Reads a file as UTF-8; undefined when it does not exist. Injectable for tests. */
  read?: (path: string) => string | undefined
  home?: string
  env?: NodeJS.ProcessEnv
}

export interface LoadedConfig {
  config: Config
  warnings: string[]
  files: string[]
}

export function loadConfig(directory: string, options?: unknown, deps: LoadDeps = {}): LoadedConfig {
  const read =
    deps.read ??
    ((path: string) => {
      try {
        return readFileSync(path, "utf8")
      } catch {
        return undefined
      }
    })
  const draft: Draft = { config: { ...DEFAULT_CONFIG }, warnings: [] }
  const files: string[] = []
  for (const path of configPaths(directory, deps.home ?? homedir(), deps.env ?? process.env)) {
    const text = read(path)
    if (text === undefined) continue
    files.push(path)
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (error) {
      draft.warnings.push(`${path}: invalid JSON (${(error as Error).message}) — ignored`)
      continue
    }
    apply(draft, path, raw)
  }
  if (options !== undefined) apply(draft, "plugin options", options)
  settle(draft)
  return { config: draft.config, warnings: draft.warnings, files }
}

/** Cross-key rules a per-key validator cannot express. */
function settle(draft: Draft): void {
  const config = draft.config
  if (config.fastTps <= config.slowTps) {
    draft.warnings.push(
      `colors.fast (${config.fastTps}) must be above colors.slow (${config.slowTps}) — using ${DEFAULT_CONFIG.fastTps}/${DEFAULT_CONFIG.slowTps}`,
    )
    config.fastTps = DEFAULT_CONFIG.fastTps
    config.slowTps = DEFAULT_CONFIG.slowTps
  }
  if (config.ratioMin >= config.ratioMax) {
    draft.warnings.push(
      `calibration.min (${config.ratioMin}) must be below calibration.max (${config.ratioMax}) — using ${DEFAULT_CONFIG.ratioMin}/${DEFAULT_CONFIG.ratioMax}`,
    )
    config.ratioMin = DEFAULT_CONFIG.ratioMin
    config.ratioMax = DEFAULT_CONFIG.ratioMax
  }
  if (config.contextWarn >= config.contextDanger) {
    draft.warnings.push(
      `usage.warnAt (${config.contextWarn}) must be below usage.dangerAt (${config.contextDanger}) — using ${DEFAULT_CONFIG.contextWarn}/${DEFAULT_CONFIG.contextDanger}`,
    )
    config.contextWarn = DEFAULT_CONFIG.contextWarn
    config.contextDanger = DEFAULT_CONFIG.contextDanger
  }
}

interface Draft {
  config: Config
  warnings: string[]
}

const KNOWN_TOP = new Set([
  "surface",
  "readings",
  "window",
  "calibration",
  "turn",
  "cap",
  "colors",
  "padding",
  "history",
  "stats",
  "usage",
  "diff",
])
const READINGS: readonly LiveReading[] = ["sliding", "cumulative"]

function apply(draft: Draft, where: string, raw: unknown): void {
  if (raw === undefined || raw === null) return
  if (typeof raw !== "object" || Array.isArray(raw)) {
    draft.warnings.push(`${where}: expected a JSON object — ignored`)
    return
  }
  const root = raw as Record<string, unknown>
  for (const key of Object.keys(root)) {
    if (!KNOWN_TOP.has(key)) draft.warnings.push(`${where}: unknown key "${key}" — ignored`)
  }
  const config = draft.config

  if ("surface" in root) {
    const value = root.surface
    if (typeof value === "string" && (SURFACES as readonly string[]).includes(value)) {
      config.surface = [value as Surface]
    } else if (Array.isArray(value)) {
      // A list of placements: keep the valid ones in order, warn about the
      // rest. An empty (or all-invalid) list leaves the previous placements —
      // a config mistake must not silently remove the line from the UI.
      const wanted: Surface[] = []
      for (const entry of value) {
        if (typeof entry === "string" && (SURFACES as readonly string[]).includes(entry)) {
          if (!wanted.includes(entry as Surface)) wanted.push(entry as Surface)
        } else {
          draft.warnings.push(`${where}: surface has unknown slot "${String(entry)}" — ignored`)
        }
      }
      if (wanted.length > 0) config.surface = wanted
      else draft.warnings.push(`${where}: surface named no known slot — using ${config.surface.join(", ")}`)
    } else {
      draft.warnings.push(`${where}: surface must be one of ${SURFACES.join(", ")} — using ${config.surface.join(", ")}`)
    }
  }

  if ("readings" in root) {
    const value = root.readings
    if (!Array.isArray(value)) {
      draft.warnings.push(`${where}: readings must be an array — using ${config.readings.join(", ")}`)
    } else {
      const valid: LiveReading[] = []
      for (const entry of value) {
        if (entry === "sliding" || entry === "cumulative") {
          if (!valid.includes(entry)) valid.push(entry)
        } else {
          draft.warnings.push(`${where}: readings has unknown entry "${String(entry)}" — ignored`)
        }
      }
      config.readings = valid
    }
  }

  const window = group(draft, where, root, "window")
  if (window) {
    num(draft, where, "window.ms", window.ms, 1, 600_000, (value) => (config.windowMs = value))
    num(draft, where, "window.minSpanMs", window.minSpanMs, 0, 600_000, (value) => (config.minSpanMs = value))
    num(draft, where, "window.minTps", window.minTps, 0, 10_000, (value) => (config.minTps = value))
    num(draft, where, "window.bucketMs", window.bucketMs, 1, 10_000, (value) => (config.bucketMs = value))
    bool(draft, where, "window.hold", window.hold, (value) => (config.holdSliding = value))
  }

  const calibration = group(draft, where, root, "calibration")
  if (calibration) {
    bool(draft, where, "calibration.enabled", calibration.enabled, (value) => (config.calibrate = value))
    num(draft, where, "calibration.charsPerToken", calibration.charsPerToken, 0.5, 50, (value) => (config.charsPerToken = value))
    num(draft, where, "calibration.min", calibration.min, 0.5, 50, (value) => (config.ratioMin = value))
    num(draft, where, "calibration.max", calibration.max, 0.5, 50, (value) => (config.ratioMax = value))
  }

  const turn = group(draft, where, root, "turn")
  if (turn) bool(draft, where, "turn.fold", turn.fold, (value) => (config.turnFold = value))

  const cap = group(draft, where, root, "cap")
  if (cap) {
    const modes: readonly CapMode[] = ["auto", "gauge", "none"]
    if (cap.mode !== undefined) {
      if (typeof cap.mode === "string" && (modes as readonly string[]).includes(cap.mode)) {
        config.capMode = cap.mode as CapMode
      } else {
        draft.warnings.push(`${where}: cap.mode must be one of ${modes.join(", ")} — using ${config.capMode}`)
      }
    }
    num(draft, where, "cap.gaugeWidth", cap.gaugeWidth, 1, 60, (value) => (config.gaugeWidth = value))
    num(draft, where, "cap.gaugeFloor", cap.gaugeFloor, 0, 10_000, (value) => (config.gaugeFloor = value))
  }

  const colors = group(draft, where, root, "colors")
  if (colors) {
    bool(draft, where, "colors.enabled", colors.enabled, (value) => (config.colors = value))
    num(draft, where, "colors.fast", colors.fast, 1, 10_000, (value) => (config.fastTps = value))
    num(draft, where, "colors.slow", colors.slow, 0, 10_000, (value) => (config.slowTps = value))
    if ("palette" in colors) {
      const value = colors.palette
      if (typeof value === "string" && isPaletteChoice(value)) {
        config.palette = value
      } else {
        draft.warnings.push(
          `${where}: colors.palette must be "host" or a bundled palette — using ${config.palette} (families: ${PALETTE_FAMILIES.join(", ")})`,
        )
      }
    }
    if ("overrides" in colors) {
      const value = colors.overrides
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        draft.warnings.push(`${where}: colors.overrides must be an object of tone colours — ignored`)
      } else {
        for (const [tone, hex] of Object.entries(value)) {
          if (!(TONE_KEYS as readonly string[]).includes(tone)) {
            draft.warnings.push(`${where}: colors.overrides.${tone} is not a tone (${TONE_KEYS.join(", ")}) — ignored`)
            continue
          }
          if (typeof hex !== "string" || !isHexColor(hex)) {
            draft.warnings.push(`${where}: colors.overrides.${tone} must be a #rrggbb colour — kept the previous value`)
            continue
          }
          // A fresh object per write: the draft's overrides start as DEFAULT_CONFIG's.
          config.toneOverrides = { ...config.toneOverrides, [tone]: hex }
        }
      }
    }
    if ("exclude" in colors) {
      const value = colors.exclude
      if (!Array.isArray(value)) {
        draft.warnings.push(`${where}: colors.exclude must be an array of segments — ignored`)
      } else {
        const wanted: UsageSegment[] = []
        for (const entry of value) {
          if (typeof entry === "string" && (USAGE_SEGMENTS as readonly string[]).includes(entry)) {
            if (!wanted.includes(entry as UsageSegment)) wanted.push(entry as UsageSegment)
          } else {
            draft.warnings.push(`${where}: colors.exclude has unknown segment "${String(entry)}" — ignored`)
          }
        }
        config.excludeSegments = wanted
      }
    }
  }

  const padding = group(draft, where, root, "padding")
  if (padding) {
    for (const [surface, sides] of Object.entries(padding)) {
      if (!(SURFACES as readonly string[]).includes(surface)) {
        draft.warnings.push(`${where}: padding.${surface} is not a surface — ignored`)
        continue
      }
      if (typeof sides !== "object" || sides === null || Array.isArray(sides)) {
        draft.warnings.push(`${where}: padding.${surface} must be an object of sides — ignored`)
        continue
      }
      for (const side of ["left", "right", "top", "bottom"] as const) {
        const value = (sides as Record<string, unknown>)[side]
        if (value === undefined) continue
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 20) {
          draft.warnings.push(
            `${where}: padding.${surface}.${side} must be a whole number of cells from 0 to 20 — kept the previous value`,
          )
          continue
        }
        // A fresh object per write: the draft's padding starts as DEFAULT_CONFIG's.
        const named = surface as Surface
        config.padding = { ...config.padding, [named]: { ...config.padding[named], [side]: value } }
      }
    }
  }

  const history = group(draft, where, root, "history")
  if (history) num(draft, where, "history.samples", history.samples, 1, 100_000, (value) => (config.historySamples = value))

  const stats = group(draft, where, root, "stats")
  if (stats) num(draft, where, "stats.windowMs", stats.windowMs, 1_000, 86_400_000, (value) => (config.statsWindowMs = value))

  const usage = group(draft, where, root, "usage")
  if (usage) {
    if ("segments" in usage) {
      const value = usage.segments
      if (!Array.isArray(value)) {
        draft.warnings.push(`${where}: usage.segments must be an array — kept the previous order`)
      } else {
        config.usageSegments = segmentList(draft, where, "usage.segments", value)
      }
    }
    if ("surfaces" in usage) {
      const value = usage.surfaces
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        draft.warnings.push(`${where}: usage.surfaces must be an object of segment lists — ignored`)
      } else {
        for (const [surface, list] of Object.entries(value)) {
          if (!(SURFACES as readonly string[]).includes(surface)) {
            draft.warnings.push(`${where}: usage.surfaces.${surface} is not a surface — ignored`)
            continue
          }
          if (!Array.isArray(list)) {
            draft.warnings.push(`${where}: usage.surfaces.${surface} must be an array of segments — ignored`)
            continue
          }
          // A placement's own list replaces the previous source's take on the
          // same surface; surfaces a source does not name keep what they had,
          // like the padding blocks do.
          const named = surface as Surface
          config.surfaceSegments = {
            ...config.surfaceSegments,
            [named]: segmentList(draft, where, `usage.surfaces.${surface}`, list),
          }
        }
      }
    }
    if ("labels" in usage) {
      const styles: readonly LabelStyle[] = ["icons", "words"]
      const value = usage.labels
      if (typeof value === "string" && (styles as readonly string[]).includes(value)) {
        config.labels = value as LabelStyle
      } else {
        draft.warnings.push(`${where}: usage.labels must be one of ${styles.join(", ")} — using ${config.labels}`)
      }
    }
    if ("separator" in usage) {
      const value = usage.separator
      if (typeof value === "string" && value.length > 0 && value.length <= 8) {
        config.usageSeparator = value
      } else {
        draft.warnings.push(`${where}: usage.separator must be a short string — kept "${config.usageSeparator}"`)
      }
    }
    if ("contextWidth" in usage) {
      const value = usage.contextWidth
      if (value === "gauge") {
        config.contextWidth = "gauge"
      } else if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 60) {
        config.contextWidth = value
      } else {
        draft.warnings.push(
          `${where}: usage.contextWidth must be "gauge" or a number from 1 to 60 — kept the previous value`,
        )
      }
    }
    num(draft, where, "usage.warnAt", usage.warnAt, 0, 100, (value) => (config.contextWarn = value))
    num(draft, where, "usage.dangerAt", usage.dangerAt, 0, 100, (value) => (config.contextDanger = value))
  }

  const diff = group(draft, where, root, "diff")
  if (diff) {
    num(draft, where, "diff.refreshMs", diff.refreshMs, 500, 600_000, (value) => (config.diffRefreshMs = value))
  }
}

function group(draft: Draft, where: string, root: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = root[key]
  if (value === undefined) return undefined
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    draft.warnings.push(`${where}: "${key}" must be an object — ignored`)
    return undefined
  }
  return value as Record<string, unknown>
}

function num(
  draft: Draft,
  where: string,
  key: string,
  value: unknown,
  min: number,
  max: number,
  set: (value: number) => void,
): void {
  if (value === undefined) return
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    draft.warnings.push(`${where}: ${key} must be a number from ${min} to ${max} — kept the previous value`)
    return
  }
  set(value)
}

function bool(draft: Draft, where: string, key: string, value: unknown, set: (value: boolean) => void): void {
  if (value === undefined) return
  if (typeof value !== "boolean") {
    draft.warnings.push(`${where}: ${key} must be true or false — kept the previous value`)
    return
  }
  set(value)
}

/** The valid, de-duplicated segments in a raw list, in order; warns about the rest. */
function segmentList(draft: Draft, where: string, key: string, value: readonly unknown[]): UsageSegment[] {
  const wanted: UsageSegment[] = []
  for (const entry of value) {
    if (typeof entry === "string" && (USAGE_SEGMENTS as readonly string[]).includes(entry)) {
      if (!wanted.includes(entry as UsageSegment)) wanted.push(entry as UsageSegment)
    } else {
      draft.warnings.push(`${where}: ${key} has unknown segment "${String(entry)}" — ignored`)
    }
  }
  return wanted
}
