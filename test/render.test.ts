import { describe, expect, test } from "bun:test"
import { columnWidth, contextBar, cutRuns, gauge, gaugeFor, joinedWidth, wrapRows, type CapInput, type Run } from "../src/render.ts"

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

describe("cutRuns", () => {
  const runs: Run[] = [
    { text: "abc", tone: "muted" },
    { text: "def", tone: "success" },
  ]

  test("returns the runs untouched when they fit", () => {
    expect(cutRuns(runs, 6)).toEqual(runs)
    expect(cutRuns(runs, 20)).toEqual(runs)
  })

  test("cuts inside a run and ends in an ellipsis, styling kept", () => {
    expect(cutRuns(runs, 5)).toEqual([
      { text: "abc", tone: "muted" },
      { text: "d…", tone: "success" },
    ])
    // Only one cell of room left: the ellipsis needs it all.
    expect(cutRuns(runs, 4)).toEqual([
      { text: "abc", tone: "muted" },
      { text: "…", tone: "success" },
    ])
  })

  test("no room draws nothing", () => {
    expect(cutRuns(runs, 0)).toEqual([])
  })
})

describe("wrapRows", () => {
  const SEP = " │ "

  test("joins the rows across one line while they fit", () => {
    const rows: Run[][] = [[{ text: "aa" }], [{ text: "bb", tone: "success" }]]
    expect(wrapRows(rows, 20, SEP)).toEqual([[{ text: "aa" }, { text: SEP, tone: "muted" }, { text: "bb", tone: "success" }]])
  })

  test("moves a row that does not fit to the next line whole", () => {
    const rows: Run[][] = [[{ text: "aaaa" }], [{ text: "bbbb" }], [{ text: "cc" }]]
    // 4 + 3 + 4 = 11 exactly; the third row starts line two.
    expect(wrapRows(rows, 11, SEP)).toEqual([
      [{ text: "aaaa" }, { text: SEP, tone: "muted" }, { text: "bbbb" }],
      [{ text: "cc" }],
    ])
  })

  test("a row wider than the line is cut, keeping its tone", () => {
    const rows: Run[][] = [[{ text: "abcdef", tone: "warning" }]]
    expect(wrapRows(rows, 4, SEP)).toEqual([[{ text: "abc…", tone: "warning" }]])
  })

  test("draws a row per line when the width demands it, with no cap", () => {
    const rows: Run[][] = [[{ text: "aaaa" }], [{ text: "bbbb" }], [{ text: "cccc" }]]
    expect(wrapRows(rows, 4, "|")).toEqual([[{ text: "aaaa" }], [{ text: "bbbb" }], [{ text: "cccc" }]])
  })

  test("empty rows are skipped and no width draws nothing", () => {
    expect(wrapRows([[], [{ text: "x" }]], 10, SEP)).toEqual([[{ text: "x" }]])
    expect(wrapRows([[{ text: "x" }]], 0, SEP)).toEqual([])
  })
})

describe("joinedWidth", () => {
  test("sums the segments and the separators between them", () => {
    expect(joinedWidth([[{ text: "aa" }], [{ text: "bb" }]], " │ ")).toBe(7)
  })

  test("empty rows take neither cells nor a separator", () => {
    expect(joinedWidth([[], [{ text: "x" }]], " │ ")).toBe(1)
    expect(joinedWidth([], " │ ")).toBe(0)
  })
})

describe("columnWidth", () => {
  test("a quarter of the viewport, never below ten", () => {
    expect(columnWidth(120)).toBe(30)
    expect(columnWidth(39)).toBe(10) // a quarter is 9, lifted to the floor
    expect(columnWidth(0)).toBe(10)
  })
})
