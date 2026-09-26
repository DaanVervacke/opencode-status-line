import { describe, expect, test } from "bun:test"
import { contextBar, gauge, gaugeFor, type CapInput } from "../src/render.ts"

const text = (runs: { text: string }[]): string => runs.map((run) => run.text).join("")

const CAP: CapInput = {
  style: "gauge",
  primary: 40,
  peak: 40,
  gaugeWidth: 10,
  gaugeFloor: 40,
  fast: 50,
  slow: 20,
}

describe("gauge", () => {
  test("fills to the scale with no remainder", () => {
    expect(text(gauge(25, 50, 10, 0))).toBe("▕█████·····▏")
  })

  test("draws an eighth-cell remainder", () => {
    expect(text(gauge(25, 40, 10, 0))).toBe("▕██████▎···▏")
  })

  test("the floor keeps a slow session visible", () => {
    expect(text(gauge(10, 0, 10, 40))).toBe("▕██▌·······▏")
  })

  test("saturates at the width", () => {
    expect(text(gauge(500, 50, 8, 0))).toBe("▕████████▏")
  })

  test("tones the fill by speed and mutes the track", () => {
    const runs = gauge(60, 60, 4, 0, 50, 20)
    expect(runs[1]).toEqual({ text: "████", tone: "success" })
    expect(runs[2]!.tone).toBe("muted")
    expect(gauge(30, 60, 4, 0, 50, 20)[1]!.tone).toBe("warning")
    expect(gauge(10, 60, 4, 0, 50, 20)[1]!.tone).toBe("error")
  })
})

describe("contextBar", () => {
  test("draws caps, fill and track at the given ratio", () => {
    expect(text(contextBar(0.5, 10))).toBe("▕█████·····▏")
  })

  test("wears the pressure tone the caller chose", () => {
    const runs = contextBar(0.9, 4, "error")
    expect(runs[1]).toEqual({ text: "███▋", tone: "error" })
    expect(runs[0]!.tone).toBe("muted")
  })

  test("stays within its width when the ratio runs over", () => {
    expect(text(contextBar(2, 8))).toBe("▕████████▏")
  })

  test("matches the gauge cell for cell — same edges, columns and levels", () => {
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      expect(text(contextBar(ratio, 9))).toBe(text(gauge(ratio * 100, 100, 9, 0)))
    }
    expect(text(contextBar(1, 9))).toHaveLength(11)
  })
})

describe("gaugeFor", () => {
  test("gauge and auto styles lead with the gauge", () => {
    expect(text(gaugeFor(CAP)).startsWith("▕")).toBe(true)
    expect(text(gaugeFor({ ...CAP, style: "auto" })).startsWith("▕")).toBe(true)
  })

  test("none draws no gauge", () => {
    expect(gaugeFor({ ...CAP, style: "none" })).toEqual([])
  })
})
