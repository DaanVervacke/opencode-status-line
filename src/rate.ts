/**
 * The speed meter's maths: a sliding window for what is happening right now, a
 * cumulative average since the turn began, and the exact figures steps settle
 * with. The turn fold accumulates exact tokens and decode milliseconds across
 * a turn's steps, so a tool-heavy turn reports one weighted number rather than
 * a row of per-step figures. It also rebuilds a finished turn's settled figure
 * from a session's stored messages, for a process that never saw the events.
 *
 * Everything is a pure function of a `Meter` plus options, JSX-free and free
 * of OpenCode imports, so it can be exercised directly:
 *
 *   bun test test/rate.test.ts
 */

export type LiveReading = "sliding" | "cumulative"

export interface RateOptions {
  /** How much streamed output the sliding estimate looks back over. */
  windowMs: number
  /** Shortest span trusted for a live figure, so the first second does not swing wildly. */
  minSpanMs: number
  /** Below this the meter is noise — a stray delta, or a model that has all but stalled. */
  minTps: number
  /** Character samples land in buckets of this size; finer granularity is only noise. */
  bucketMs: number
  /** Whether finished steps teach the estimate its characters-per-token ratio. */
  calibrate: boolean
  /** Seed ratio, used until calibration has something to say. */
  charsPerToken: number
  /** Bounds for the calibrated ratio; a sample outside them is discarded. */
  ratioMin: number
  ratioMax: number
  /** Accumulate a turn's exact steps into one weighted figure. */
  turnFold: boolean
  /** Completed figures kept for the statistics. */
  historySamples: number
  /**
   * Keep the last live sliding reading on screen after the stream stops. The
   * held value wears the muted shade, so history is visible without pretending
   * to be live.
   */
  holdSliding: boolean
}

export const DEFAULT_RATE: RateOptions = {
  windowMs: 3_000,
  minSpanMs: 800,
  minTps: 0.5,
  bucketMs: 100,
  calibrate: true,
  charsPerToken: 4,
  ratioMin: 2.5,
  ratioMax: 7,
  turnFold: true,
  historySamples: 500,
  holdSliding: true,
}

/** Shortest decode span trusted: even a two-word answer deserves its figure. */
const MIN_STEP_MS = 50
/** Longest decode span trusted; beyond this a clock is lying. */
const MAX_STEP_MS = 3_600_000

/** A step needs this much streamed text before its ratio is worth calibrating from. */
const RATIO_MIN_CHARS = 40
/** Exponential moving average weight given to a fresh ratio. */
const RATIO_WEIGHT = 0.3

export interface Sample {
  /** Bucket start, aligned to bucketMs. */
  at: number
  chars: number
}

export interface Step {
  assistantMessageID: string
  chars: number
  /** Step start on the event clock. */
  at: number
  /** Step start on the local clock, for when the event clock is unusable. */
  arrivedAt: number
  /**
   * First token-bearing chunk of this step, on the event clock. The decode
   * span runs from here, not from the step, so TTFT is not charged to speed.
   */
  tokenAt?: number
  /** First token-bearing chunk on the local clock, for the fallback span. */
  tokenArrivedAt?: number
}

/** Exact decode totals of the turn in flight: finished steps only. */
export interface Turn {
  tokens: number
  ms: number
}

export interface Final {
  tps: number
  at: number
  /** "turn" when the figure folds the turn, "step" when it is one step's own. */
  kind: "turn" | "step"
}

export interface TurnSample {
  tps: number
  at: number
}

export interface Meter {
  /** Bucketed streamed characters, oldest first. */
  samples: Sample[]
  /** Start of the current run of activity; a pause longer than the window ends it. */
  streakStart: number
  /** Arrival of the newest delta, so a stalled stream goes quiet. */
  lastDeltaAt: number
  /** The step currently streaming, once `session.step.started` was seen. */
  step?: Step
  /** The turn's exact fold, when turn folding is on. */
  turn: Turn
  /** Estimated characters per token, calibrated from finished steps. */
  charsPerToken: number
  /** Last settled figure, shown until something newer replaces it. */
  final?: Final
  /** Last live sliding reading, held after the stream stops; a restore without one rests it at zero. */
  sliding?: { tps: number; at: number }
  /**
   * The session's high-water mark: the gauge's upper bound. It only ever rises,
   * so a fast burst cannot shrink the scale under the readings that follow.
   */
  peak?: number
  /** One entry per completed turn (or step, when folding is off). */
  history: TurnSample[]
}

export function createMeter(opts: RateOptions = DEFAULT_RATE): Meter {
  return {
    samples: [],
    streakStart: 0,
    lastDeltaAt: 0,
    turn: { tokens: 0, ms: 0 },
    charsPerToken: opts.charsPerToken,
    history: [],
  }
}

/** Records `chars` of streamed output arriving at `now` (event clock optional). */
export function observe(
  meter: Meter,
  now: number,
  chars: number,
  eventNow?: number,
  opts: RateOptions = DEFAULT_RATE,
): void {
  if (chars <= 0) return
  const at = Math.floor(now / opts.bucketMs) * opts.bucketMs
  // A delta after silence starts a new streak: its rate must be measured over
  // what has streamed since, never over the session's whole history.
  if (meter.lastDeltaAt === 0 || now - meter.lastDeltaAt > opts.windowMs) meter.streakStart = at
  const last = meter.samples[meter.samples.length - 1]
  if (last && last.at === at) last.chars += chars
  else meter.samples.push({ at, chars })
  if (meter.step) {
    meter.step.chars += chars
    meter.step.tokenAt ??= eventNow ?? now
    meter.step.tokenArrivedAt ??= now
  }
  meter.lastDeltaAt = now
  prune(meter, now, opts)
  // Snapshot the live reading while it is fresh: this is what the sliding
  // figure shows once the stream stops, so the number survives the finish line.
  const tps = liveRate(meter, now, opts)
  if (tps !== undefined) {
    meter.sliding = { tps, at: now }
    notePeak(meter, tps)
  }
}

/**
 * Raise the session's high-water mark. The gauge's upper bound calls this for
 * every reading it sees, so the scale never falls back under a later figure.
 */
export function notePeak(meter: Meter, tps: number): void {
  if (tps > (meter.peak ?? 0)) meter.peak = tps
}

function prune(meter: Meter, now: number, opts: RateOptions): void {
  const cutoff = now - opts.windowMs
  while (meter.samples.length > 0 && meter.samples[0]!.at < cutoff) meter.samples.shift()
}

/**
 * The sliding estimate: streamed characters over the window, divided by the
 * calibrated ratio. Undefined once the stream has been quiet for a window.
 */
export function liveRate(meter: Meter, now: number, opts: RateOptions = DEFAULT_RATE): number | undefined {
  prune(meter, now, opts)
  if (now - meter.lastDeltaAt > opts.windowMs) return undefined
  if (meter.samples.length === 0) return undefined
  let chars = 0
  for (const sample of meter.samples) chars += sample.chars
  // While the streak is younger than the window, measure it over its own age
  // (with a floor, so the first figures do not swing); once it is older, the
  // samples cover exactly one window and the rate is chars per window.
  const span = Math.min(Math.max(now - meter.streakStart, opts.minSpanMs), opts.windowMs)
  const tps = chars / meter.charsPerToken / (span / 1000)
  return tps >= opts.minTps ? tps : undefined
}

/**
 * The cumulative average: every exact token of this turn's finished steps plus
 * the characters of the step in flight, over the decode time they took. With
 * turn folding off it describes the current step alone. Live only — it needs a
 * step that has emitted its first token.
 */
export function cumulativeRate(meter: Meter, now: number, opts: RateOptions = DEFAULT_RATE): number | undefined {
  const step = meter.step
  if (!step) return undefined
  // Steps that stream tool arguments expose no deltas on the bus, so their
  // first-token marker never lands. Fall back to the step's arrival: the
  // average stays on screen through the whole turn instead of vanishing.
  const startedAt = step.tokenArrivedAt ?? step.arrivedAt
  const tokens = meter.turn.tokens + step.chars / meter.charsPerToken
  const ms = meter.turn.ms + Math.max(0, now - startedAt)
  if (ms < opts.minSpanMs || tokens <= 0) return undefined
  const tps = tokens / (ms / 1000)
  return tps >= opts.minTps ? tps : undefined
}

/** A step began streaming; remember its start so its end can be exact. */
export function beginStep(meter: Meter, assistantMessageID: string, at: number, arrivedAt: number): void {
  // The previous figure deliberately stays on screen while this step finds its
  // feet (TTFT, tools): continuity beats a blank line, and the live estimates
  // replace it the moment this step streams.
  meter.step = { assistantMessageID, chars: 0, at, arrivedAt }
}

/**
 * A step finished with exact `tokens` of output (output + reasoning). Folds it
 * into the turn when folding is on, so the figure is the turn's weighted
 * average rather than one step's, and returns what should be shown.
 */
export function endStep(
  meter: Meter,
  assistantMessageID: string,
  tokens: number,
  endedAt: number,
  now: number,
  opts: RateOptions = DEFAULT_RATE,
): number | undefined {
  const step = meter.step
  meter.step = undefined
  if (!step || step.assistantMessageID !== assistantMessageID || tokens <= 0) return undefined
  // Prefer the server's own clock for both ends; if those stamps are unusable
  // (unit drift, replayed event), fall back to when the events actually arrived
  // — never mixed, and a nonsense figure never reaches the screen. The span
  // starts at the first token: TTFT is not the model's speed.
  const startAt = step.tokenAt ?? step.at
  const startArrived = step.tokenArrivedAt ?? step.arrivedAt
  const eventMs = endedAt - startAt
  const arrivalMs = now - startArrived
  const ms = eventMs >= MIN_STEP_MS && eventMs <= MAX_STEP_MS ? eventMs : arrivalMs
  if (ms < MIN_STEP_MS || ms > MAX_STEP_MS) return undefined
  const seconds = ms / 1000

  const stepTps = tokens / seconds
  if (opts.turnFold) {
    meter.turn.tokens += tokens
    meter.turn.ms += seconds * 1000
  }
  const folded = opts.turnFold && meter.turn.ms > 0
  const tps = folded ? meter.turn.tokens / (meter.turn.ms / 1000) : stepTps
  meter.final = { tps, at: now, kind: folded ? "turn" : "step" }
  notePeak(meter, tps)
  if (opts.calibrate && step.chars >= RATIO_MIN_CHARS) {
    const ratio = step.chars / tokens
    if (ratio >= opts.ratioMin && ratio <= opts.ratioMax) {
      meter.charsPerToken = meter.charsPerToken * (1 - RATIO_WEIGHT) + ratio * RATIO_WEIGHT
    }
  }
  return tps
}

/** A turn began: start a fresh fold. The previous figure stays for continuity. */
export function beginTurn(meter: Meter, now: number, opts: RateOptions = DEFAULT_RATE): void {
  // A turn whose end event was missed still deserves its place in history:
  // close it here rather than letting the next turn discard it. `endTurn` is a
  // no-op on an empty fold, so a normal close is not counted twice.
  if (meter.turn.ms > 0) endTurn(meter, now, opts)
  meter.turn = { tokens: 0, ms: 0 }
  meter.step = undefined
}

/** A turn ended: keep its figure forever, and remember it for the statistics. */
export function endTurn(meter: Meter, now: number, opts: RateOptions = DEFAULT_RATE): void {
  if (opts.turnFold && meter.turn.ms > 0) {
    const tps = meter.turn.tokens / (meter.turn.ms / 1000)
    meter.final = { tps, at: now, kind: "turn" }
    meter.history.push({ tps, at: now })
  } else if (!opts.turnFold && meter.final?.kind === "step") {
    meter.history.push({ tps: meter.final.tps, at: now })
  }
  if (meter.history.length > opts.historySamples) {
    meter.history.splice(0, meter.history.length - opts.historySamples)
  }
  // Closing twice must not count the same turn twice: a second end has an
  // empty fold and simply does nothing.
  meter.turn = { tokens: 0, ms: 0 }
  meter.step = undefined
}

/**
 * A completed step as the session record kept it: exact output tokens over a
 * server-clock decode span. `at` is the first token where the record knows it,
 * `endedAt` the step's completion — the closest the record comes to the span
 * `endStep` settles from.
 */
export interface RecordedStep {
  tokens: number
  at: number
  endedAt: number
}

/**
 * The bits of a stored session message the reconstruction reads. Structural on
 * purpose: the host's message shape is wider, and this module takes no
 * dependency on it.
 */
export interface RecordedMessage {
  type?: string
  time?: { created?: number; streamed?: number; completed?: number }
  tokens?: { output?: number; reasoning?: number }
  content?: readonly { type?: string; time?: { created?: number; completed?: number } }[]
}

/**
 * The earliest point the record can place the step's first token: the first
 * timestamp among its reasoning parts. `time.streamed` is a stream
 * finalisation stamp (milliseconds before `completed`), not a start; text parts
 * carry no timing at all, and a tool part is stamped when its call is
 * registered, after its arguments streamed. A message without a timed reasoning
 * part has no first token in the record, and callers fall back to its start.
 */
export function firstTokenAt(message: RecordedMessage): number | undefined {
  let first: number | undefined
  for (const part of message.content ?? []) {
    if (part?.type !== "reasoning") continue
    const at = part.time?.created
    if (typeof at === "number" && (first === undefined || at < first)) first = at
  }
  return first
}

/**
 * The last turn's steps, oldest first, read from a session's stored messages.
 * A turn begins at the last user message; only assistant messages carry exact
 * output counts, and one without a recorded end or without output is not a
 * measurement. The span starts at the first reasoning timestamp where the
 * record keeps one — the first token — and at the message's own start
 * otherwise, which charges TTFT but cannot invent a timeline.
 *
 * Returns undefined when the messages hold no user message at all: the TUI
 * cache can carry only the newest page of a long session, and folding its tail
 * would report a figure no process ever measured — a tail folded once showed
 * 261 where the full turn was 243. Callers wait for the page set to grow
 * instead.
 */
export function recordedSteps(messages: readonly RecordedMessage[]): RecordedStep[] | undefined {
  const steps: RecordedStep[] = []
  let bounded = false
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message?.type === "user") {
      bounded = true
      break
    }
    if (message?.type !== "assistant") continue
    const started = firstTokenAt(message) ?? message.time?.created
    const ended = message.time?.completed
    const tokens = (message.tokens?.output ?? 0) + (message.tokens?.reasoning ?? 0)
    if (typeof started !== "number" || typeof ended !== "number" || tokens <= 0) continue
    steps.push({ tokens, at: started, endedAt: ended })
  }
  if (!bounded) return undefined
  return steps.reverse()
}

/** Whether a recorded step has tokens and a span worth measuring, by the same floors as `endStep`. */
function measurable(step: RecordedStep): boolean {
  if (step.tokens <= 0) return false
  const span = step.endedAt - step.at
  return span >= MIN_STEP_MS && span <= MAX_STEP_MS
}

/**
 * Rebuild the settled state a finished turn left on the line, from its
 * recorded steps — the resume counterpart of the live `endStep`/`endTurn`
 * pair, for a process that never saw the events. The figure is close to the
 * live one, not bit-identical: the live span ran between event timestamps the
 * record does not keep, and the record's own end carries the finalisation
 * tail, so around a percent of difference is expected and accepted — tool-time
 * heuristics do not narrow it (starting at the last tool's creation, or
 * subtracting tool runs, both overshoot). `final` takes the folded
 * figure and the sliding reading rests at zero, so the segment keeps its shape
 * — an empty gauge and a resting `↯` — without pretending a window the samples
 * could not support. The turn fold is left empty: a step beginning later must
 * not absorb a stale turn into its live average. Returns the figure, or
 * undefined when nothing is measurable.
 */
export function restoreFinal(
  meter: Meter,
  steps: readonly RecordedStep[],
  now: number,
  opts: RateOptions = DEFAULT_RATE,
): number | undefined {
  let tps: number | undefined
  if (opts.turnFold) {
    let tokens = 0
    let ms = 0
    for (const step of steps) {
      if (!measurable(step)) continue
      tokens += step.tokens
      ms += step.endedAt - step.at
    }
    if (tokens > 0 && ms > 0) tps = tokens / (ms / 1000)
  } else {
    for (let index = steps.length - 1; index >= 0; index--) {
      const step = steps[index]!
      if (!measurable(step)) continue
      tps = step.tokens / ((step.endedAt - step.at) / 1000)
      break
    }
  }
  if (tps === undefined) return undefined
  meter.final = { tps, at: now, kind: opts.turnFold ? "turn" : "step" }
  meter.sliding = { tps: 0, at: now }
  notePeak(meter, tps)
  return tps
}

/** Whether the live window still has something worth redrawing. */
export function active(meter: Meter, now: number, opts: RateOptions = DEFAULT_RATE): boolean {
  return now - meter.lastDeltaAt <= opts.windowMs
}

export interface Reading {
  key: LiveReading | "final"
  /** The glyph or word that says where the figure comes from. */
  label: string
  tps: number
  /** False for a held or settled figure — the line dims those. */
  live: boolean
}

export interface Display {
  /** True when at least one reading is live; the cap and colours follow it. */
  live: boolean
  readings: Reading[]
  /** The figure the colours and the gauge scale to. */
  primary: number
}

/** How the fixed words of the line read: as glyphs, or spelled out. */
export type LabelStyle = "icons" | "words"

/**
 * The fixed words each part of the line wears. `display` reads the first
 * three; the usage line takes the last for its cache segment. Every entry is
 * one cell wide in the fonts OpenCode draws with, so no label shifts the line.
 */
export interface UsageLabels {
  /** The instantaneous sliding reading. */
  sliding: string
  /** The cumulative average — live, held or settled. */
  average: string
  /** A step's own settled figure, with folding off. */
  settled: string
  /** The cache segment. */
  cache: string
}

export const USAGE_LABELS: Record<LabelStyle, UsageLabels> = {
  words: { sliding: "↯", average: "avg", settled: "✓", cache: "cache" },
  icons: { sliding: "↯", average: "μ", settled: "✓", cache: "⧉" },
}

/**
 * What to show right now.
 *
 * The two families have a life of their own rather than appearing and
 * vanishing with the stream:
 *
 *   sliding     live while the window has deltas, then the last reading held
 *   cumulative  live while a step is in flight, then the settled turn average
 *
 * A held or settled figure wears `live: false` and is drawn dimmed, so history
 * stays visible without pretending to be current. With holding off the sliding
 * reading disappears as it used to, and with `readings: []` only the settled
 * figure remains.
 *
 * `labels` names the figures (`USAGE_LABELS` holds the icon and word sets);
 * the counts and the geometry never depend on it.
 */
export function display(
  meter: Meter,
  now: number,
  readings: readonly LiveReading[] = ["sliding", "cumulative"],
  opts: RateOptions = DEFAULT_RATE,
  labels: UsageLabels = USAGE_LABELS.icons,
): Display | undefined {
  const shown: Reading[] = []
  if (readings.includes("sliding")) {
    const tps = liveRate(meter, now, opts)
    if (tps !== undefined) shown.push({ key: "sliding", label: labels.sliding, tps, live: true })
    else if (opts.holdSliding && meter.sliding) {
      shown.push({ key: "sliding", label: labels.sliding, tps: meter.sliding.tps, live: false })
    }
  }
  if (readings.includes("cumulative")) {
    const tps = cumulativeRate(meter, now, opts)
    if (tps !== undefined) shown.push({ key: "cumulative", label: labels.average, tps, live: true })
    else if (meter.final?.kind === "turn") {
      shown.push({ key: "cumulative", label: labels.average, tps: meter.final.tps, live: false })
    }
  }

  const anyLive = shown.some((reading) => reading.live)
  const coveredFinal =
    shown.some((reading) => reading.key === "cumulative") && meter.final?.kind === "turn"
  // A settled figure the readings above do not already carry — a step's exact
  // rate with folding off, or the turn figure when neither family is drawn.
  if (!anyLive && meter.final && !coveredFinal) {
    shown.push({
      key: "final",
      label: meter.final.kind === "turn" ? labels.average : labels.settled,
      tps: meter.final.tps,
      live: false,
    })
  }

  if (shown.length === 0) return undefined
  return { live: anyLive, readings: shown, primary: shown[0]!.tps }
}

/** The session's high-water mark, so the gauge has a scale that only rises. */
export function peakTps(meter: Meter): number {
  let peak = meter.peak ?? 0
  for (const sample of meter.history) if (sample.tps > peak) peak = sample.tps
  return peak
}

export interface TpsStats {
  /** Mean of the samples inside the rolling window. */
  avg: number
  /** Mean of every sample. */
  mean: number
  /** 95th percentile of every sample. */
  p95: number
  count: number
}

export function tpsStats(meter: Meter, now: number, windowMs: number): TpsStats {
  const samples = meter.history
  if (samples.length === 0) return { avg: 0, mean: 0, p95: 0, count: 0 }
  const window = samples.filter((sample) => now - sample.at <= windowMs)
  const avg =
    window.length > 0 ? window.reduce((sum, sample) => sum + sample.tps, 0) / window.length : 0
  const mean = samples.reduce((sum, sample) => sum + sample.tps, 0) / samples.length
  const sorted = samples.map((sample) => sample.tps).sort((a, b) => a - b)
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
  return { avg, mean, p95, count: samples.length }
}

/**
 * `8.3`, ` 47`, `198` — a fixed three-character field, so the line never shifts
 * as the figure moves between digits. Tenths below ten, whole numbers above,
 * and `k` for the rare figure past a thousand; every branch pads or rounds to
 * exactly three characters.
 */
export function formatRate(tps: number): string {
  const tenths = Math.round(tps * 10) / 10
  if (tenths < 10) return tenths.toFixed(1)
  const whole = Math.round(tenths)
  if (whole < 1_000) return String(whole).padStart(3, " ")
  return `${Math.round(whole / 1_000)}k`.padStart(3, " ")
}

export type SpeedTone = "success" | "warning" | "error"

/** How the figure should read at a glance: fast, middling, or slow. */
export function speedTone(tps: number, fast = 50, slow = 20): SpeedTone {
  return tps >= fast ? "success" : tps >= slow ? "warning" : "error"
}
