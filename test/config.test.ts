import { describe, expect, test } from "bun:test"
import {
  contextBarWidth,
  DEFAULT_CONFIG,
  loadConfig,
  paddingFor,
  rateOptions,
  resolvedPadding,
  stackFor,
} from "../src/config.ts"

const HOME = "/home/test"
const DIR = "/work/project"
const GLOBAL = "/home/test/.config/opencode/opencode-status-line.json"
const PROJECT = "/work/project/.opencode-status-line.json"

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
    const xdg = "/xdg"
    const { config, files } = loadConfig(DIR, undefined, {
      home: HOME,
      env: { XDG_CONFIG_HOME: xdg },
      read: loader({ [`${xdg}/opencode/opencode-status-line.json`]: JSON.stringify({ window: { ms: 1_234 } }) }),
    })
    expect(files).toEqual([`${xdg}/opencode/opencode-status-line.json`])
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

  test("surface must be a known slot", () => {
    const { config, warnings } = read({ [PROJECT]: JSON.stringify({ surface: "nowhere" }) })
    expect(config.surface).toBe(DEFAULT_CONFIG.surface)
    expect(warnings.length).toBe(1)
  })

  test("app joins the slots, and sidebar surfaces stack their segments", () => {
    expect(read({ [PROJECT]: JSON.stringify({ surface: "app" }) }).config.surface).toBe("app")
    expect(read({ [PROJECT]: JSON.stringify({ surface: "sidebar.content" }) }).config.surface).toBe("sidebar.content")
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

  test("padding overrides are kept per surface and win a side at a time", () => {
    const app = read({
      [PROJECT]: JSON.stringify({ surface: "app", padding: { app: { left: 0, bottom: 3 } } }),
    }).config
    expect(resolvedPadding(app)).toEqual({ left: 0, right: 2, top: 0, bottom: 3 })
    const footer = read({
      [PROJECT]: JSON.stringify({ surface: "prompt.footer", padding: { "prompt.footer": { left: 1 } } }),
    }).config
    expect(resolvedPadding(footer)).toEqual({ left: 1, right: 0, top: 0, bottom: 0 })
  })

  test("a placement move swaps the padding along with the surface", () => {
    const padding = {
      app: { bottom: 3 },
      "prompt.footer": { left: 1, top: 1 },
    }
    const app = read({ [PROJECT]: JSON.stringify({ surface: "app", padding }) }).config
    expect(resolvedPadding(app)).toEqual({ left: 2, right: 2, top: 0, bottom: 3 })
    const footer = read({ [PROJECT]: JSON.stringify({ surface: "prompt.footer", padding }) }).config
    expect(resolvedPadding(footer)).toEqual({ left: 1, right: 0, top: 1, bottom: 0 })
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
    expect(resolvedPadding(config)).toEqual(paddingFor(config.surface))
    expect(warnings.filter((warning) => warning.includes("padding.")).length).toBe(6)
  })

  test("usage segments keep the configured order and drop unknowns", () => {
    const { config, warnings } = read({
      [PROJECT]: JSON.stringify({ usage: { segments: ["meter", "cost", "meter", "nope"] } }),
    })
    expect(config.usageSegments).toEqual(["meter", "cost"])
    expect(warnings.some((warning) => warning.includes("nope"))).toBe(true)
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
