import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import {
  contextBarWidth,
  DEFAULT_CONFIG,
  loadConfig,
  paddingFor,
  rateOptions,
  resolvedPadding,
  segmentsFor,
  sharesHostRow,
  stackFor,
} from "../src/config.ts"
import { HOST_PALETTE } from "../src/palette.ts"

// The loader builds these paths with `join`, so the fixtures must too — a
// literal "/home/test/..." key misses the fake `read` map on Windows.
const HOME = join("/", "home", "test")
const DIR = join("/", "work", "project")
const GLOBAL = join(HOME, ".config", "opencode", "opencode-status-line.json")
const PROJECT = join(DIR, ".opencode-status-line.json")

const loader = (files: Record<string, string>) => (path: string) => files[path]
const read = (files: Record<string, string>, directory = DIR, options?: unknown) =>
  loadConfig(directory, options, { home: HOME, env: {}, read: loader(files) })

describe("precedence", () => {
  test("defaults when nothing exists", () => {
    const { config, warnings, files } = read({})
    expect(files).toEqual([])
    expect(warnings).toEqual([])
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  test("global, then project, then plugin options — later wins key by key", () => {
    const { config, files, warnings } = read(
      {
        [GLOBAL]: JSON.stringify({ window: { ms: 5_000 }, colors: { fast: 80 } }),
        [PROJECT]: JSON.stringify({ readings: ["cumulative"], cap: { gaugeWidth: 20 } }),
      },
      DIR,
      { colors: { slow: 10 } },
    )
    expect(files).toEqual([GLOBAL, PROJECT])
    expect(warnings).toEqual([])
    expect(config.windowMs).toBe(5_000)
    expect(config.readings).toEqual(["cumulative"])
    expect(config.gaugeWidth).toBe(20)
    expect(config.fastTps).toBe(80)
    expect(config.slowTps).toBe(10)
  })

  test("XDG_CONFIG_HOME moves the global file", () => {
    const xdg = join("/", "xdg")
    const moved = join(xdg, "opencode", "opencode-status-line.json")
    const { config, files } = loadConfig(DIR, undefined, {
      home: HOME,
      env: { XDG_CONFIG_HOME: xdg },
      read: loader({ [moved]: JSON.stringify({ window: { ms: 1_234 } }) }),
    })
    expect(files).toEqual([moved])
    expect(config.windowMs).toBe(1_234)
  })
})

describe("validation", () => {
  test("invalid JSON is ignored with a warning; other sources still apply", () => {
    const { config, warnings } = read({
      [GLOBAL]: "{ nope",
      [PROJECT]: JSON.stringify({ turn: { fold: false } }),
    })
    expect(config.turnFold).toBe(false)
    expect(warnings.some((warning) => warning.includes("invalid JSON"))).toBe(true)
  })

  test("bad values keep the previous value and warn", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({
        window: { ms: -5, minTps: "fast" },
        cap: { mode: "fancy" },
        mystery: 1,
      }),
    })
    expect(config.windowMs).toBe(DEFAULT_CONFIG.windowMs)
    expect(config.minTps).toBe(DEFAULT_CONFIG.minTps)
    expect(config.capMode).toBe(DEFAULT_CONFIG.capMode)
    expect(warnings.some((warning) => warning.includes("mystery"))).toBe(true)
    expect(warnings.length).toBeGreaterThanOrEqual(4)
  })

  test("fast must stay above slow", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ colors: { fast: 10, slow: 40 } }) })
    expect(config.fastTps).toBe(DEFAULT_CONFIG.fastTps)
    expect(config.slowTps).toBe(DEFAULT_CONFIG.slowTps)
    expect(warnings.some((warning) => warning.includes("above"))).toBe(true)
  })

  test("colors.palette takes host, a variant or a family", () => {
    expect(read({}).config.palette).toBe(HOST_PALETTE)
    expect(read({}).config.toneOverrides).toEqual({})
    expect(
      read({ [PROJECT]: JSON.stringify({ colors: { palette: "rose-pine-moon" } }) }).config.palette,
    ).toBe("rose-pine-moon")
    expect(read({ [PROJECT]: JSON.stringify({ colors: { palette: "gruvbox" } }) }).config.palette).toBe("gruvbox")
    expect(read({ [PROJECT]: JSON.stringify({ colors: { palette: "host" } }) }).config.palette).toBe("host")
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ colors: { palette: "catpuccin" } }) })
    expect(config.palette).toBe(HOST_PALETTE)
    expect(warnings.some((warning) => warning.includes("colors.palette"))).toBe(true)
  })

  test("colors.overrides recolours tones, merges across sources and validates", () => {
    const { config, warnings } = read({
      [GLOBAL]: JSON.stringify({ colors: { overrides: { success: "#50fa7b", muted: "#6272a4" } } }),
      [PROJECT]: JSON.stringify({ colors: { overrides: { success: "#00ff00", nope: "#000000", error: "red" } } }),
    })
    expect(config.toneOverrides).toEqual({ success: "#00ff00", muted: "#6272a4" })
    expect(warnings.some((warning) => warning.includes("colors.overrides.nope"))).toBe(true)
    expect(warnings.some((warning) => warning.includes("colors.overrides.error"))).toBe(true)
    // The defaults are never touched: a later source adds to its own copy.
    expect(DEFAULT_CONFIG.toneOverrides).toEqual({})
  })

  test("colors.exclude names the segments that keep the host colours", () => {
    expect(read({}).config.excludeSegments).toEqual([])
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ colors: { exclude: ["diff", "meter", "diff", "nope"] } }),
    })
    expect(config.excludeSegments).toEqual(["diff", "meter"])
    expect(warnings.some((warning) => warning.includes("colors.exclude"))).toBe(true)
    expect(read({ [PROJECT]: JSON.stringify({ colors: { exclude: "diff" } }) }).config.excludeSegments).toEqual([])
  })

  test("calibration bounds must stay ordered", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ calibration: { min: 9, max: 3 } }) })
    expect(config.ratioMin).toBe(DEFAULT_CONFIG.ratioMin)
    expect(config.ratioMax).toBe(DEFAULT_CONFIG.ratioMax)
    expect(warnings.some((warning) => warning.includes("calibration.min"))).toBe(true)
  })

  test("readings drop unknown entries and duplicate", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ readings: ["sliding", "nope", "sliding"] }),
    })
    expect(config.readings).toEqual(["sliding"])
    expect(warnings.some((warning) => warning.includes("nope"))).toBe(true)
  })

  test("an empty readings list is allowed — settled figures only", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ readings: [] }) })
    expect(config.readings).toEqual([])
    expect(warnings).toEqual([])
  })

  test("cap.mode accepts none, gauge and its legacy alias auto", () => {
    expect(read({ [PROJECT]: JSON.stringify({ cap: { mode: "none" } }) }).config.capMode).toBe("none")
    expect(read({ [PROJECT]: JSON.stringify({ cap: { mode: "auto" } }) }).config.capMode).toBe("auto")
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ cap: { mode: "sparkline" } }) })
    expect(config.capMode).toBe(DEFAULT_CONFIG.capMode)
    expect(warnings.some((warning) => warning.includes("cap.mode"))).toBe(true)
  })

  test("window.hold can turn the held reading off", () => {
    const { config } = read({ [PROJECT]: JSON.stringify({ window: { hold: false } }) })
    expect(config.holdSliding).toBe(false)
  })

  test("surface takes one slot or several at once", () => {
    expect(DEFAULT_CONFIG.surface).toEqual(["app"])
    expect(read({ [PROJECT]: JSON.stringify({ surface: "app" }) }).config.surface).toEqual(["app"])
    expect(read({ [PROJECT]: JSON.stringify({ surface: "sidebar.content" }) }).config.surface).toEqual([
      "sidebar.content",
    ])
    expect(
      read({ [PROJECT]: JSON.stringify({ surface: ["app", "prompt.footer", "sidebar.content"] }) }).config.surface,
    ).toEqual(["app", "prompt.footer", "sidebar.content"])
    // A later source replaces the list whole, like every other key.
    const both = read({
      [GLOBAL]: JSON.stringify({ surface: "app" }),
      [PROJECT]: JSON.stringify({ surface: ["sidebar.footer", "prompt.footer"] }),
    })
    expect(both.config.surface).toEqual(["sidebar.footer", "prompt.footer"])
  })

  test("surface lists keep their order and drop duplicates and unknown slots", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ surface: ["sidebar.footer", "nowhere", "app", "sidebar.footer"] }),
    })
    expect(config.surface).toEqual(["sidebar.footer", "app"])
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain("nowhere")
  })

  test("a surface list with no known slot warns and keeps the previous placements", () => {
    const { config, warnings } = read({
      [GLOBAL]: JSON.stringify({ surface: ["app", "sidebar.footer"] }),
      [PROJECT]: JSON.stringify({ surface: [] }),
    })
    expect(config.surface).toEqual(["app", "sidebar.footer"])
    expect(warnings.some((warning) => warning.includes("no known slot"))).toBe(true)
    const allBad = read({ [PROJECT]: JSON.stringify({ surface: ["nowhere", 7] }) })
    expect(allBad.config.surface).toEqual(DEFAULT_CONFIG.surface)
    expect(allBad.warnings.some((warning) => warning.includes("nowhere"))).toBe(true)
    expect(allBad.warnings.some((warning) => warning.includes("no known slot"))).toBe(true)
  })

  test("a surface that is not a known name or list warns and keeps the previous placements", () => {
    const scalar = read({ [PROJECT]: JSON.stringify({ surface: "nowhere" }) })
    expect(scalar.config.surface).toEqual(DEFAULT_CONFIG.surface)
    expect(scalar.warnings.length).toBe(1)
    expect(scalar.warnings[0]).toContain("surface must be one of")
    const wrongType = read({ [PROJECT]: JSON.stringify({ surface: 3 }) })
    expect(wrongType.config.surface).toEqual(DEFAULT_CONFIG.surface)
    expect(wrongType.warnings.length).toBe(1)
  })

  test("sidebar surfaces stack their segments", () => {
    expect(stackFor("sidebar.content")).toBe("column")
    expect(stackFor("sidebar.footer")).toBe("column")
    expect(stackFor("app")).toBe("row")
    expect(stackFor("prompt.footer")).toBe("row")
  })

  test("app takes the composer's indent and clear rows underneath", () => {
    expect(paddingFor("app")).toEqual({ left: 2, right: 2, top: 0, bottom: 2 })
    expect(paddingFor("sidebar.content")).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
    expect(paddingFor("prompt.footer")).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
  })

  test("only the footer surfaces share a host row", () => {
    expect(sharesHostRow("prompt.footer")).toBe(true)
    expect(sharesHostRow("prompt.footer.status")).toBe(true)
    expect(sharesHostRow("home.footer.status")).toBe(true)
    expect(sharesHostRow("app")).toBe(false)
    expect(sharesHostRow("session.composer.top")).toBe(false)
    expect(sharesHostRow("sidebar.content")).toBe(false)
  })

  test("padding overrides are kept per surface and win a side at a time", () => {
    const app = read({
      [PROJECT]: JSON.stringify({ surface: "app", padding: { app: { left: 0, bottom: 3 } } }),
    }).config
    expect(resolvedPadding(app, "app")).toEqual({ left: 0, right: 2, top: 0, bottom: 3 })
    const footer = read({
      [PROJECT]: JSON.stringify({ surface: "prompt.footer", padding: { "prompt.footer": { left: 1 } } }),
    }).config
    expect(resolvedPadding(footer, "prompt.footer")).toEqual({ left: 1, right: 0, top: 0, bottom: 0 })
  })

  test("each placement resolves its own padding when the line is in several slots", () => {
    const padding = {
      app: { bottom: 3 },
      "prompt.footer": { left: 1, top: 1 },
    }
    const config = read({ [PROJECT]: JSON.stringify({ surface: ["app", "prompt.footer"], padding }) }).config
    expect(config.surface).toEqual(["app", "prompt.footer"])
    expect(resolvedPadding(config, "app")).toEqual({ left: 2, right: 2, top: 0, bottom: 3 })
    expect(resolvedPadding(config, "prompt.footer")).toEqual({ left: 1, right: 0, top: 1, bottom: 0 })
  })

  test("padding blocks merge across sources and never touch the defaults", () => {
    const { config } = read({
      [GLOBAL]: JSON.stringify({ padding: { app: { left: 0 } } }),
      [PROJECT]: JSON.stringify({ padding: { app: { bottom: 2 } } }),
    })
    expect(config.padding).toEqual({ app: { left: 0, bottom: 2 } })
    expect(DEFAULT_CONFIG.padding).toEqual({})
  })

  test("bad padding warns and keeps the surface default", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({
        padding: {
          app: { left: -1, right: "wide", top: 1.5, bottom: 21 },
          nowhere: { left: 1 },
          "sidebar.footer": 3,
        },
      }),
    })
    expect(config.padding).toEqual({})
    // The default surface is `app`, so its own padding stands.
    expect(resolvedPadding(config, "app")).toEqual(paddingFor("app"))
    expect(warnings.filter((warning) => warning.includes("padding.")).length).toBe(6)
  })

  test("usage segments keep the configured order and drop unknowns", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ usage: { segments: ["meter", "cost", "meter", "nope"] } }),
    })
    expect(config.usageSegments).toEqual(["meter", "cost"])
    expect(warnings.some((warning) => warning.includes("nope"))).toBe(true)
  })

  test("per-surface lists override the shared segments, the rest falling back", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({
        surface: ["app", "sidebar.footer"],
        usage: {
          segments: ["context", "meter", "cost"],
          surfaces: { "sidebar.footer": ["meter", "context"] },
        },
      }),
    })
    expect(warnings).toEqual([])
    expect(config.usageSegments).toEqual(["context", "meter", "cost"])
    expect(config.surfaceSegments).toEqual({ "sidebar.footer": ["meter", "context"] })
    expect(segmentsFor(config, "sidebar.footer")).toEqual(["meter", "context"])
    // A placement with no override draws the shared list.
    expect(segmentsFor(config, "app")).toEqual(["context", "meter", "cost"])
  })

  test("no overrides means every placement draws the same segments", () => {
    const { config } = read({ [PROJECT]: JSON.stringify({ surface: ["app", "sidebar.footer"] }) })
    expect(config.surfaceSegments).toEqual({})
    expect(segmentsFor(config, "app")).toEqual(config.usageSegments)
    expect(segmentsFor(config, "sidebar.footer")).toEqual(config.usageSegments)
  })

  test("an empty per-surface list hides the line at that placement", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ usage: { surfaces: { app: [] } } }) })
    expect(warnings).toEqual([])
    expect(segmentsFor(config, "app")).toEqual([])
  })

  test("per-surface lists drop duplicates and unknown names, and refuse unknown surfaces", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({
        usage: {
          surfaces: {
            "sidebar.footer": ["meter", "nope", "meter"],
            nowhere: ["cost"],
            app: "meter",
          },
        },
      }),
    })
    expect(config.surfaceSegments).toEqual({ "sidebar.footer": ["meter"] })
    expect(warnings.length).toBe(3)
    expect(warnings.some((warning) => warning.includes('usage.surfaces.sidebar.footer has unknown segment "nope"'))).toBe(true)
    expect(warnings.some((warning) => warning.includes("usage.surfaces.nowhere is not a surface"))).toBe(true)
    expect(warnings.some((warning) => warning.includes("usage.surfaces.app must be an array"))).toBe(true)
  })

  test("a non-object usage.surfaces warns and is ignored", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ usage: { surfaces: ["meter"] } }) })
    expect(config.surfaceSegments).toEqual({})
    expect(warnings.some((warning) => warning.includes("usage.surfaces must be an object"))).toBe(true)
  })

  test("per-surface lists merge across sources and never touch the defaults", () => {
    const { config } = read({
      [GLOBAL]: JSON.stringify({ usage: { surfaces: { app: ["meter"] } } }),
      [PROJECT]: JSON.stringify({ usage: { surfaces: { "sidebar.footer": ["cost"] } } }),
    })
    expect(config.surfaceSegments).toEqual({ app: ["meter"], "sidebar.footer": ["cost"] })
    expect(DEFAULT_CONFIG.surfaceSegments).toEqual({})
  })

  test("the diff counter is a known segment with its own refresh interval", () => {
    expect(DEFAULT_CONFIG.usageSegments).toContain("diff")
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ usage: { segments: ["diff", "meter"] } }),
    })
    expect(config.usageSegments).toEqual(["diff", "meter"])
    expect(warnings).toEqual([])
    expect(read({}).config.diffRefreshMs).toBe(DEFAULT_CONFIG.diffRefreshMs)
    expect(read({ [PROJECT]: JSON.stringify({ diff: { refreshMs: 1_000 } }) }).config.diffRefreshMs).toBe(1_000)
  })

  test("a diff refresh interval below the floor warns and keeps the default", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ diff: { refreshMs: 10 } }) })
    expect(config.diffRefreshMs).toBe(DEFAULT_CONFIG.diffRefreshMs)
    expect(warnings.some((warning) => warning.includes("diff.refreshMs"))).toBe(true)
  })

  test("usage separator, width and thresholds are configurable", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({
        usage: { separator: " · ", contextWidth: 20, warnAt: 50, dangerAt: 80 },
      }),
    })
    expect(warnings).toEqual([])
    expect(config.usageSeparator).toBe(" · ")
    expect(config.contextWidth).toBe(20)
    expect(config.contextWarn).toBe(50)
    expect(config.contextDanger).toBe(80)
  })

  test("usage.contextWidth follows the gauge unless given a number", () => {
    expect(read({}).config.contextWidth).toBe("gauge")
    expect(contextBarWidth(read({}).config)).toBe(DEFAULT_CONFIG.gaugeWidth)
    // Following means the gauge's own width, whenever it is set.
    expect(contextBarWidth(read({ [PROJECT]: JSON.stringify({ cap: { gaugeWidth: 20 } }) }).config)).toBe(20)
    // A number deviates; "gauge" goes back to following.
    expect(contextBarWidth(read({ [PROJECT]: JSON.stringify({ usage: { contextWidth: 7 } }) }).config)).toBe(7)
    expect(
      contextBarWidth(
        read({ [PROJECT]: JSON.stringify({ cap: { gaugeWidth: 20 }, usage: { contextWidth: "gauge" } }) }).config,
      ),
    ).toBe(20)
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ usage: { contextWidth: "wide" } }) })
    expect(config.contextWidth).toBe(DEFAULT_CONFIG.contextWidth)
    expect(warnings.some((warning) => warning.includes("usage.contextWidth"))).toBe(true)
  })

  test("usage.labels picks the glyphs or the words", () => {
    expect(read({}).config.labels).toBe("icons")
    expect(read({ [PROJECT]: JSON.stringify({ usage: { labels: "words" } }) }).config.labels).toBe("words")
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ usage: { labels: "emoji" } }) })
    expect(config.labels).toBe(DEFAULT_CONFIG.labels)
    expect(warnings.some((warning) => warning.includes("usage.labels"))).toBe(true)
  })

  test("warnAt must stay below dangerAt", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ usage: { warnAt: 95, dangerAt: 90 } }),
    })
    expect(config.contextWarn).toBe(DEFAULT_CONFIG.contextWarn)
    expect(config.contextDanger).toBe(DEFAULT_CONFIG.contextDanger)
    expect(warnings.some((warning) => warning.includes("usage.warnAt"))).toBe(true)
  })
})

test("rateOptions mirrors the maths half of the config", () => {
  const { config } = read(
    { [PROJECT]: JSON.stringify({ window: { ms: 2_000, bucketMs: 50 }, calibration: { enabled: false } }) },
  )
  const opts = rateOptions(config)
  expect(opts.windowMs).toBe(2_000)
  expect(opts.bucketMs).toBe(50)
  expect(opts.calibrate).toBe(false)
  expect(opts.turnFold).toBe(true)
})
