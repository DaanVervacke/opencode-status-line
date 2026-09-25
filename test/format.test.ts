import { describe, expect, test } from "bun:test"
import { cacheShare, compact, contextUsed, duration, money, pressureTone } from "../src/format.ts"

describe("compact", () => {
  test("whole numbers below a thousand", () => {
    expect(compact(0)).toBe("0")
    expect(compact(999.4)).toBe("999")
  })

  test("one decimal past a thousand", () => {
    expect(compact(572_700)).toBe("572.7k")
    expect(compact(1_000)).toBe("1.0k")
  })

  test("millions for the huge windows", () => {
    expect(compact(1_200_000)).toBe("1.2M")
  })
})

test("money is two decimals", () => {
  expect(money(0.75)).toBe("$0.75")
  expect(money(12.005)).toBe("$12.01")
})

describe("duration", () => {
  test("seconds, minutes and hours", () => {
    expect(duration(45_000)).toBe("45s")
    expect(duration(724_000)).toBe("12m04s")
    expect(duration(7_620_000)).toBe("2h07m")
  })

  test("clamps negative spans", () => {
    expect(duration(-5_000)).toBe("0s")
  })
})

describe("token readings", () => {
  test("context sums every side of the window", () => {
    const tokens = { input: 900, output: 600, reasoning: 100, cache: { read: 571_800, write: 400 } }
    expect(contextUsed(tokens)).toBe(573_800)
    expect(contextUsed(undefined)).toBe(0)
  })

  test("cache share is the read side over everything used", () => {
    expect(cacheShare({ input: 900, cache: { read: 572_700 - 900 } })).toBeCloseTo(0.998, 3)
    expect(cacheShare({})).toBeUndefined()
    expect(cacheShare(undefined)).toBeUndefined()
  })
})

describe("pressureTone", () => {
  test("green while there is room, yellow as it fills, red near the limit", () => {
    expect(pressureTone(0.5)).toBe("success")
    expect(pressureTone(0.75)).toBe("warning")
    expect(pressureTone(0.95)).toBe("error")
  })

  test("thresholds are configurable", () => {
    expect(pressureTone(0.5, 0.4, 0.6)).toBe("warning")
    expect(pressureTone(0.7, 0.4, 0.6)).toBe("error")
  })
})
