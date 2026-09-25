import { describe, expect, test } from "bun:test"
import {
  active,
  beginStep,
  beginTurn,
  createMeter,
  cumulativeRate,
  display,
  endStep,
  endTurn,
  formatRate,
  liveRate,
  notePeak,
  observe,
  peakTps,
  speedTone,
  tpsStats,
  DEFAULT_RATE,
  type Meter,
  type RateOptions,
} from "../src/rate.ts"

const T0 = 1_000_000
const WINDOW = DEFAULT_RATE.windowMs
const OPTS: RateOptions = { ...DEFAULT_RATE }

/** Feed `chars` per second for `durationMs`, in 100 ms deltas. */
function stream(
  meter: Meter,
  start: number,
  durationMs: number,
  charsPerSecond: number,
  opts: RateOptions = OPTS,
): number {
  let now = start
  for (let elapsed = 0; elapsed < durationMs; elapsed += 100) {
    now = start + elapsed + 100
    observe(meter, now, charsPerSecond / 10, undefined, opts)
  }
  return now
}

describe("sliding rate", () => {
  test("converts streamed characters at the seed ratio", () => {
    const meter = createMeter()
    const now = stream(meter, T0, 4_000, 100) // 100 chars/s = 25 tok/s
    const rate = liveRate(meter, now)
    expect(rate).toBeDefined()
    expect(Math.abs(rate! - 25)).toBeLessThan(1.5)
  })

  test("goes quiet once the window is empty", () => {
    const meter = createMeter()
    const now = stream(meter, T0, 1_000, 400)
    expect(liveRate(meter, now)).toBeDefined()
    expect(liveRate(meter, now + WINDOW + 1)).toBeUndefined()
    expect(active(meter, now + WINDOW + 1)).toBe(false)
  })
})

describe("cumulative rate", () => {
  test("per step when folding is off", () => {
    const opts: RateOptions = { ...DEFAULT_RATE, turnFold: false }
    const meter = createMeter(opts)
    beginStep(meter, "msg", T0, T0)
    stream(meter, T0 + 1_000, 2_000, 200, opts) // first token T0+1100, 400 chars
    // 400 chars ÷ 4 = 100 tokens over the 2 s since the first token.
    expect(cumulativeRate(meter, T0 + 3_100, opts)).toBeCloseTo(50, 1)
  })

  test("folds the turn's exact steps when folding is on", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "a", T0, T0)
    stream(meter, T0 + 1_000, 2_000, 200) // 400 chars, first token T0+1100
    endStep(meter, "a", 160, T0 + 3_100, T0 + 3_100) // 2 s decode → ratio 2.5 → 3.55
    beginStep(meter, "b", T0 + 3_200, T0 + 3_200)
    stream(meter, T0 + 3_300, 1_000, 200) // 200 chars, first token T0+3400
    // (160 exact + 200/3.55 estimated) / (2000 ms + 1000 ms) ≈ 72.1
    expect(Math.abs(cumulativeRate(meter, T0 + 4_400)! - 72.1)).toBeLessThan(1)
  })

  test("stays live through a step whose deltas are not observable", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "a", T0, T0)
    stream(meter, T0 + 1_000, 1_000, 400)
    endStep(meter, "a", 100, T0 + 2_100, T0 + 2_100) // 100 tokens in 1 s
    beginStep(meter, "b", T0 + 2_200, T0 + 2_200) // tool step: no deltas arrive
    // One second into the silent step, the turn's average so far — not nothing.
    expect(cumulativeRate(meter, T0 + 3_200, OPTS)).toBeCloseTo(50, 5)
  })

  test("stays silent without a step in flight", () => {
    const meter = createMeter()
    expect(cumulativeRate(meter, T0)).toBeUndefined()
  })
})

describe("step settlement", () => {
  test("yields the exact rate and steers the estimate", () => {
    const meter = createMeter()
    beginStep(meter, "msg", T0, T0)
    stream(meter, T0 + 1_000, 2_000, 200) // 400 chars, first token T0+1100
    const tps = endStep(meter, "msg", 160, T0 + 3_100, T0 + 3_100)
    expect(tps).toBeCloseTo(80, 5) // 160 tokens in 2 s, TTFT excluded
    // 400 chars / 160 tokens = 2.5; EMA from 4 → 3.55.
    expect(meter.charsPerToken).toBeCloseTo(3.55, 5)
  })

  test("the exact span starts at the first token, not the step", () => {
    const meter = createMeter()
    beginStep(meter, "msg", T0, T0)
    stream(meter, T0 + 5_000, 1_000, 100) // 5 s before the first token, then 100 chars/s
    expect(endStep(meter, "msg", 100, T0 + 6_100, T0 + 6_100)).toBeCloseTo(100, 5)
  })

  test("falls back to arrival times when the event clock is unusable", () => {
    const meter = createMeter()
    beginStep(meter, "msg", 0, T0)
    expect(endStep(meter, "msg", 100, 0, T0 + 2_000)).toBeCloseTo(50, 5)
  })

  test("settles a tiny step instead of discarding it", () => {
    const meter = createMeter()
    beginStep(meter, "msg", T0, T0)
    stream(meter, T0, 100, 40) // first token T0+100
    // 5 tokens over 83 ms: a two-word answer is still a measurement.
    expect(endStep(meter, "msg", 5, T0 + 183, T0 + 183)).toBeCloseTo(60.24, 1)
    expect(meter.final?.kind).toBe("turn")
  })

  test("ignores nonsense durations and missing steps", () => {
    const meter = createMeter()
    beginStep(meter, "msg", T0, T0)
    expect(endStep(meter, "msg", 100, T0 + 10, T0 + 10)).toBeUndefined() // below the floor
    beginStep(meter, "msg", T0, T0)
    expect(endStep(meter, "msg", 100, T0 + 7_200_000, T0)).toBeUndefined() // absurd
    expect(endStep(meter, "other", 100, T0 + 2_000, T0)).toBeUndefined() // never started
  })
})

describe("turn fold", () => {
  test("weights a turn's steps into one figure and remembers it", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "a", T0, T0)
    stream(meter, T0 + 1_000, 1_000, 400)
    endStep(meter, "a", 100, T0 + 2_100, T0 + 2_100) // 100 tokens in 1 s
    beginStep(meter, "b", T0 + 2_200, T0 + 2_200)
    stream(meter, T0 + 2_300, 1_000, 400)
    endStep(meter, "b", 200, T0 + 3_400, T0 + 3_400) // 200 tokens in 1 s

    // 300 tokens over 2 s, not the last step's 200.
    expect(meter.final?.tps).toBeCloseTo(150, 5)
    expect(meter.final?.kind).toBe("turn")

    endTurn(meter, T0 + 3_500)
    expect(meter.history).toHaveLength(1)
    expect(meter.history[0]!.tps).toBeCloseTo(150, 5)
  })

  test("folding off keeps each step's own figure", () => {
    const opts: RateOptions = { ...DEFAULT_RATE, turnFold: false }
    const meter = createMeter(opts)
    beginTurn(meter, T0)
    beginStep(meter, "a", T0, T0)
    stream(meter, T0 + 1_000, 1_000, 400, opts)
    endStep(meter, "a", 100, T0 + 2_100, T0 + 2_100, opts)
    expect(meter.final?.kind).toBe("step")
    endTurn(meter, T0 + 2_200, opts)
    expect(meter.history[0]!.tps).toBeCloseTo(100, 5)
  })

  test("closing a turn twice does not double-count it", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "a", T0, T0)
    stream(meter, T0 + 1_000, 1_000, 400)
    endStep(meter, "a", 100, T0 + 2_100, T0 + 2_100)
    endTurn(meter, T0 + 2_200)
    endTurn(meter, T0 + 2_300)
    expect(meter.history).toHaveLength(1)
  })

  test("a missed turn end is closed when the next turn begins", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "a", T0, T0)
    stream(meter, T0 + 1_000, 1_000, 400)
    endStep(meter, "a", 100, T0 + 2_100, T0 + 2_100)
    // No endTurn arrived: the turn simply never reported its end.
    expect(meter.history).toHaveLength(0)
    beginTurn(meter, T0 + 5_000)
    expect(meter.history).toHaveLength(1)
    // The fresh fold is empty, so a later real end does not count it twice.
    endTurn(meter, T0 + 6_000)
    expect(meter.history).toHaveLength(1)
  })

  test("history is capped at the configured length", () => {
    const opts: RateOptions = { ...DEFAULT_RATE, historySamples: 2 }
    const meter = createMeter(opts)
    for (let index = 0; index < 4; index++) {
      beginTurn(meter, T0 + index * 1_000)
      beginStep(meter, `s${index}`, T0 + index * 1_000, T0 + index * 1_000)
      stream(meter, T0 + index * 1_000 + 100, 1_000, 400, opts)
      endStep(meter, `s${index}`, 100, T0 + index * 1_000 + 1_200, T0 + index * 1_000 + 1_200, opts)
      endTurn(meter, T0 + index * 1_000 + 1_300, opts)
    }
    expect(meter.history).toHaveLength(2)
  })
})

describe("display", () => {
  test("shows the requested live readings while streaming", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "msg", T0, T0)
    const now = stream(meter, T0, 1_000, 400)
    const view = display(meter, now, ["sliding", "cumulative"])
    expect(view?.live).toBe(true)
    expect(view?.readings.map((reading) => reading.key)).toEqual(["sliding", "cumulative"])
    expect(view?.readings.map((reading) => reading.live)).toEqual([true, true])
    expect(view?.readings[0]!.label).toBe("↯")
    expect(view?.readings[1]!.label).toBe("avg")
  })

  test("respects a single-reading configuration", () => {
    const meter = createMeter()
    beginStep(meter, "msg", T0, T0)
    const now = stream(meter, T0, 1_000, 400)
    const view = display(meter, now, ["sliding"])
    expect(view?.readings.map((reading) => reading.key)).toEqual(["sliding"])
  })

  test("holds the sliding reading after the stream stops, and settles the average", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "msg", T0, T0)
    const now = stream(meter, T0, 1_000, 400)
    const held = liveRate(meter, now)! // the last live sliding figure
    expect(held).toBeDefined()
    endStep(meter, "msg", 100, T0 + 1_100, T0 + 1_100) // 100 tokens in 1 s
    const later = T0 + 1_100 + WINDOW + 100

    const settled = display(meter, later, ["sliding", "cumulative"])
    expect(settled?.live).toBe(false)
    expect(settled?.readings.map((reading) => reading.key)).toEqual(["sliding", "cumulative"])
    expect(settled?.readings.map((reading) => reading.live)).toEqual([false, false])
    expect(settled?.readings[0]!.label).toBe("↯")
    expect(settled?.readings[0]!.tps).toBeCloseTo(held, 5)
    expect(settled?.readings[1]!.label).toBe("avg")
    expect(settled?.readings[1]!.tps).toBeCloseTo(100, 5)
  })

  test("holding off leaves only the settled figure", () => {
    const opts: RateOptions = { ...DEFAULT_RATE, holdSliding: false }
    const meter = createMeter(opts)
    beginTurn(meter, T0)
    beginStep(meter, "msg", T0, T0)
    const now = stream(meter, T0, 1_000, 400, opts)
    endStep(meter, "msg", 100, T0 + 1_100, T0 + 1_100, opts)
    const settled = display(meter, now + WINDOW + 100, ["sliding", "cumulative"], opts)
    expect(settled?.readings.map((reading) => reading.key)).toEqual(["cumulative"])
    expect(settled?.readings[0]!.live).toBe(false)
    expect(settled?.readings[0]!.tps).toBeCloseTo(100, 5)
  })

  test("a new turn keeps both figures until something newer arrives", () => {
    const meter = createMeter()
    beginTurn(meter, T0)
    beginStep(meter, "msg", T0, T0)
    stream(meter, T0, 1_000, 400)
    endStep(meter, "msg", 100, T0 + 1_100, T0 + 1_100)
    const later = T0 + 1_100 + WINDOW + 100

    beginTurn(meter, T0)
    const before = display(meter, later + 10, ["sliding", "cumulative"])
    expect(before?.live).toBe(false)
    expect(before?.readings.map((reading) => reading.key)).toEqual(["sliding", "cumulative"])

    beginStep(meter, "next", later + 20, later + 20)
    const streaming = stream(meter, later + 1_000, 1_500, 400)
    expect(display(meter, streaming, ["sliding", "cumulative"])?.live).toBe(true)
  })
})

describe("statistics", () => {
  test("peaks over completed turns", () => {
    const meter = createMeter()
    meter.history.push({ tps: 10, at: T0 }, { tps: 60, at: T0 + 1 }, { tps: 30, at: T0 + 2 })
    expect(peakTps(meter)).toBe(60)
  })

  test("the high-water mark only rises", () => {
    const meter = createMeter()
    notePeak(meter, 120)
    notePeak(meter, 40)
    expect(meter.peak).toBe(120)
    notePeak(meter, 200)
    expect(peakTps(meter)).toBe(200)
  })

  test("live readings feed the mark, and slower output never pulls it back", () => {
    const meter = createMeter()
    stream(meter, T0, 4_000, 800) // a fast burst sets the gauge's scale
    const recorded = meter.peak ?? 0
    expect(recorded).toBeGreaterThan(150)

    stream(meter, T0 + 10_000, 4_000, 40) // slower output afterwards
    expect(meter.peak).toBe(recorded)
  })

  test("averages a rolling window, all-time mean and p95", () => {
    const meter = createMeter()
    meter.history.push({ tps: 10, at: T0 }, { tps: 20, at: T0 + 1_000 }, { tps: 60, at: T0 + 2_000 })
    const stats = tpsStats(meter, T0 + 2_000, 1_500)
    expect(stats.avg).toBeCloseTo(40, 5)
    expect(stats.mean).toBeCloseTo(30, 5)
    expect(stats.p95).toBeCloseTo(60, 5)
    expect(stats.count).toBe(3)
  })

  test("an empty meter reports zeros", () => {
    expect(tpsStats(createMeter(), T0, 60_000)).toEqual({ avg: 0, mean: 0, p95: 0, count: 0 })
  })
})

test("speedTone marks fast, middling and slow figures", () => {
  expect(speedTone(80)).toBe("success")
  expect(speedTone(50)).toBe("success")
  expect(speedTone(30)).toBe("warning")
  expect(speedTone(20)).toBe("warning")
  expect(speedTone(12)).toBe("error")
})

test("formatRate draws a fixed three-character field", () => {
  expect(formatRate(8.34)).toBe("8.3")
  expect(formatRate(9.96)).toBe(" 10")
  expect(formatRate(47.2)).toBe(" 47")
  expect(formatRate(132.6)).toBe("133")
  expect(formatRate(999.4)).toBe("999")
  expect(formatRate(1_234)).toBe(" 1k")
  for (const value of [0, 5.2, 9.9, 47, 198, 999, 1_000, 25_000]) {
    expect(formatRate(value)).toHaveLength(3)
  }
})
