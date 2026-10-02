/** @jsxImportSource @opentui/solid */
/**
 * opencode-status-line — a live usage-and-speed status line for OpenCode's CLI
 * prompt footer: context window, cache, streaming speed, cost, elapsed time
 * and uncommitted changes in one row, drawn in one UI slot or several at once
 * (`surface`) and configurable per segment (`usage.segments`, overridable per
 * placement through `usage.surfaces`).
 *
 * The speed segment carries two live readings. OpenCode only learns exact token
 * counts when a step finishes, so the live figures are estimated from streamed
 * output (`session.text.delta`, `session.reasoning.delta`,
 * `session.tool.input.delta`) and calibrated against the exact counts on
 * `session.step.ended`:
 *
 *   sliding     ↯  what the last few seconds look like, right now
 *   cumulative  μ  the average since the turn began (exact tokens from every
 *                  finished step of the turn plus the step in flight)
 *
 * The settled figure folds the whole turn (configurable) and the sliding
 * reading holds its last value once a stream stops (`window.hold`), so the line
 * never loses its last figure at the finish line. A session met without a meter
 * (a resume, a plugin reload) has its settled figure rebuilt from the last
 * turn's recorded messages, so the meter segment does not come back blank — it
 * shows the settled average over a resting `↯ 0.0` and an empty gauge. The
 * sliding window's samples are delta arrival times no record keeps, so a real
 * `↯` figure only returns with the next stream. The gauge stays on screen (it
 * holds the last reading once settled), figures are speed-coloured, and
 * `/opencode-status-line` shows the numbers behind them.
 *
 * Configuration lives in `~/.config/opencode/opencode-status-line.json` and a
 * project's `.opencode-status-line.json` — see config.ts. The plugin lives in
 * this checkout and is listed in cli.json by absolute path; no build step,
 * OpenCode transpiles the TSX on load and resolves the imports itself.
 */
import { Plugin } from "@opencode/plugin/tui"
import { For, Show, createMemo, createSignal } from "solid-js"
import { contextBarWidth, loadConfig, rateOptions, resolvedPadding, segmentsFor, sharesHostRow, stackFor, type Config, type Surface, type UsageSegment } from "./config.ts"
import { diffDue, diffKey, diffParts, diffTotals, type DiffReading, type DiffStat, type StatusFile } from "./diff.ts"
import { HOST_PALETTE, inkColor, resolvePalette } from "./palette.ts"
import type { Display, Meter } from "./rate.ts"
import {
  active,
  beginStep,
  beginTurn,
  createMeter,
  display,
  endStep,
  endTurn,
  firstTokenAt,
  formatRate,
  notePeak,
  observe,
  peakTps,
  recordedSteps,
  restoreFinal,
  speedTone,
  tpsStats,
  USAGE_LABELS,
} from "./rate.ts"
import { columnWidth, contextBar, cutRuns, gaugeFor, hostRuns, joinedWidth, wrapRows, type CapInput, type Run, type RunTone } from "./render.ts"
import { cacheShare, compact, contextUsed, duration, money, pressureTone, shellsLabel, type TokenRecord } from "./format.ts"

/** How often the line redraws while something is on screen. */
const TICK_MS = 250

/**
 * The per-session meters live on `globalThis`, not in `setup`. OpenCode
 * hot-reloads the plugin whenever a source file it imports is saved: this
 * module is re-imported and `setup` runs again with every module-scope value
 * reset. The process outlives the generation, so the meters ride on it —
 * readings, high-water marks, history and calibration all survive a save, and
 * the line keeps painting the last figures instead of going dark mid-turn
 * while the new generation finds its feet.
 */
const METERS = "__opencodeStatusLineMeters"

const sharedMeters = (): Map<string, Meter> => {
  const shared = globalThis as Record<string, unknown>
  const existing = shared[METERS]
  if (existing instanceof Map) return existing as Map<string, Meter>
  const meters = new Map<string, Meter>()
  shared[METERS] = meters
  return meters
}

/** The bits of the event payloads this plugin reads. */
interface Tokens {
  output?: number
  reasoning?: number
}

interface Event {
  type?: string
  created?: number
  data?: {
    sessionID?: string
    assistantMessageID?: string
    delta?: string
    tokens?: Tokens
  }
}

/** The bits of a stored session message the meter seed reads. */
interface StoredMessage {
  type?: string
  id?: string
  time?: { created?: number; streamed?: number; completed?: number }
  content?: Array<{ type?: string; text?: string; time?: { created?: number; completed?: number } }>
  tokens?: { output?: number; reasoning?: number }
}

/** Where a session's working tree lives — the shells it runs, the VCS it is under. */
type SessionLocation = { directory?: string | null; workspaceID?: string }

export default Plugin.define({
  id: "local.opencode-status-line",
  setup(context) {
    const directory =
      context.location?.directory ?? context.data.location.default()?.directory ?? process.cwd()
    const loaded = loadConfig(directory, context.options)
    const config: Config = loaded.config
    const opts = rateOptions(config)
    const labels = USAGE_LABELS[config.labels]
    /**
     * The palette the line wears, when `colors.palette` picks one instead of
     * the host's tokens. A family name follows the host's resolved mode;
     * `context.themeMode` is that mode (`dark`/`light`), never `system`.
     */
    const palette =
      config.palette === HOST_PALETTE
        ? undefined
        : resolvePalette(config.palette, context.themeMode, config.toneOverrides)
    const contextWidth = contextBarWidth(config)
    for (const warning of loaded.warnings) {
      console.warn(`opencode-status-line: ${warning}`)
      context.ui.toast.show({ variant: "warning", title: "opencode-status-line", message: warning, duration: 10_000 })
    }

    const meters = sharedMeters()
    const [version, setVersion] = createSignal(0, { equals: false })
    let timer: ReturnType<typeof setInterval> | undefined
    /** Keeps the elapsed timer and held figures repainting while nothing streams. */
    const heartbeat = setInterval(() => setVersion((value) => value + 1), 1_000)

    const bump = () => setVersion((value) => value + 1)

    const meter = (sessionID: string): Meter => {
      let existing = meters.get(sessionID)
      if (!existing) {
        existing = createMeter(opts)
        meters.set(sessionID, existing)
      }
      return existing
    }

    /** Redraw while anything is on screen, then stop; the next delta wakes it again. */
    const tick = () => {
      if (timer) return
      timer = setInterval(() => {
        bump()
        const now = Date.now()
        let alive = false
        for (const each of meters.values()) {
          // The gauge's upper bound only ever rises: every reading the line
          // shows while ticking feeds the session's high-water mark.
          const view = display(each, now, config.readings, opts)
          if (view) notePeak(each, view.primary)
          if (active(each, now, opts)) alive = true
        }
        if (alive) return
        clearInterval(timer)
        timer = undefined
      }, TICK_MS)
    }

    /**
     * A session can meet this generation with history: a plugin reload or TUI
     * restart lands on a turn already streaming, and a resume lands on one that
     * finished in a past process. Either way there is no meter, and the line
     * would show a blank meter segment while the other segments recompute from
     * the records. Rebuild what the records carry for a session without one:
     * the step in flight from its streaming message — so its exact figure still
     * has a step to settle against — or the finished turn's settled figure from
     * its completed assistant messages. The sliding window's samples are delta
     * arrival times no record keeps, so the window reading rests at zero rather
     * than being invented.
     *
     * Retried on later paints until the cache yields a foldable turn: at
     * startup the host may hold only the newest page of a long session, and a
     * tail without its user message is not a turn. `synced` forces the full
     * fetch once per session; `seeding` keeps concurrent attempts apart.
     */
    const synced = new Set<string>()
    const seeding = new Set<string>()
    const seedMeter = async (sessionID: string) => {
      if (seeding.has(sessionID)) return
      seeding.add(sessionID)
      try {
        // The usage line's cost, tokens and start time come from this record.
        void context.data.session.sync(sessionID).catch(() => {})
        // Live events may have produced state already; when they have, they
        // are newer than the record and the seed stands down. Only a step
        // record or a settled figure counts — a meter with neither is just
        // the first delta, and this seed is exactly what it still lacks.
        if (meters.get(sessionID)?.step || meters.get(sessionID)?.final) return
        // The host hydrates a session's messages page by page to draw it, so
        // the cache is not proof of the whole transcript. Force one full sync
        // per session; afterwards, a still-partial cache is waited out rather
        // than guessed at.
        if (!synced.has(sessionID)) {
          synced.add(sessionID)
          await context.data.session.message.sync(sessionID)
        }
        if (meters.get(sessionID)?.step || meters.get(sessionID)?.final) return
        const messages = context.data.session.message.list(sessionID) as StoredMessage[] | undefined
        let streaming: StoredMessage | undefined
        for (const message of messages ?? []) {
          if (message?.type === "assistant" && message.time?.completed === undefined) streaming = message
        }
        if (streaming?.id) {
          let chars = 0
          for (const part of streaming.content ?? []) {
            if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") chars += part.text.length
          }
          // The first reasoning timestamp is the closest thing to the first
          // token the record keeps; `time.streamed` is a finalisation stamp,
          // not a start.
          const at = firstTokenAt(streaming) ?? streaming.time?.created ?? Date.now()
          const each = meter(sessionID)
          each.step = { assistantMessageID: streaming.id, chars, at, arrivedAt: Date.now(), tokenAt: at, tokenArrivedAt: Date.now() }
          bump()
          return
        }
        // Nothing is streaming: settle the last turn from its record. With no
        // user message in hand the cache is still filling, so leave no meter —
        // the meter branch retries on a later paint — and show no figure
        // rather than a tail no process measured.
        const steps = recordedSteps(messages ?? [])
        if (!steps) return
        const each = meter(sessionID)
        if (restoreFinal(each, steps, Date.now(), opts) !== undefined) bump()
      } catch (error) {
        console.warn("opencode-status-line: could not seed the meter", error)
      } finally {
        seeding.delete(sessionID)
      }
    }
    const startup = context.ui.router.current()
    if (startup.type === "session") void seedMeter(startup.sessionID)

    const onDelta = (event: Event) => {
      const data = event?.data
      if (!data || typeof data.sessionID !== "string") return
      const { delta } = data
      if (typeof delta !== "string" || delta.length === 0) return
      // The event's own clock marks the first token, so the exact figure's span
      // starts when the model actually began emitting.
      observe(meter(data.sessionID), Date.now(), delta.length, event.created, opts)
      tick()
    }

    const sessionOf = (event: Event): string | undefined =>
      typeof event?.data?.sessionID === "string" ? event.data.sessionID : undefined

    /**
     * A plugin bug must never take the interface down with it. An uncaught
     * exception inside an event handler can kill the plugin generation — that
     * is measured, not hypothetical: one half-saved file cost a TUI restart.
     * Handlers report and resume instead.
     */
    const safely = (handler: (event: Event) => void) => (event: Event) => {
      try {
        handler(event)
      } catch (error) {
        console.warn("opencode-status-line: handler failed", error)
      }
    }

    const onTurnEnd = (event: Event) => {
      const sessionID = sessionOf(event)
      if (!sessionID) return
      endTurn(meter(sessionID), Date.now(), opts)
      // The turn has just written to the working tree: mark the diff reading
      // stale, so the next paint re-asks rather than waiting out the interval.
      const reading = diffs.get(diffKey(sessionLocation(sessionID)))
      if (reading) reading.at = 0
      bump()
    }

    const stops = [
      context.data.on("session.text.delta", safely(onDelta)),
      context.data.on("session.reasoning.delta", safely(onDelta)),
      // Tool arguments stream as output tokens too; counting them keeps the
      // meter honest while a large file or command is being written.
      context.data.on("session.tool.input.delta", safely(onDelta)),
      context.data.on(
        "session.step.started",
        safely((event: Event) => {
          const data = event?.data
          if (typeof data?.sessionID !== "string" || typeof data?.assistantMessageID !== "string") return
          // The envelope's own clock for both ends of the step: the two events are
          // stamped by the same server, so the duration cannot mix clock domains.
          const started = typeof event.created === "number" && event.created > 0 ? event.created : Date.now()
          beginStep(meter(data.sessionID), data.assistantMessageID, started, Date.now())
        }),
      ),
      context.data.on(
        "session.step.ended",
        safely((event: Event) => {
          const data = event?.data
          const tokens = data?.tokens
          if (typeof data?.sessionID !== "string" || typeof data?.assistantMessageID !== "string" || !tokens) return
          const output = (tokens.output ?? 0) + (tokens.reasoning ?? 0)
          const endedAt = typeof event.created === "number" && event.created > 0 ? event.created : Date.now()
          endStep(meter(data.sessionID), data.assistantMessageID, output, endedAt, Date.now(), opts)
          bump()
        }),
      ),
      // Turn boundaries: a prompt starts an execution, and its settlement ends
      // it. The fold resets only here; anything else would split a turn.
      context.data.on(
        "session.execution.started",
        safely((event: Event) => {
          const sessionID = sessionOf(event)
          if (!sessionID) return
          beginTurn(meter(sessionID), Date.now(), opts)
        }),
      ),
      context.data.on("session.execution.succeeded", safely(onTurnEnd)),
      context.data.on("session.execution.failed", safely(onTurnEnd)),
      context.data.on("session.execution.interrupted", safely(onTurnEnd)),
      // A late belt for a turn whose execution settlement never arrived: idle
      // closes the fold too, and a second close is a no-op. Without it a turn
      // that ended quietly would bleed into the next one's cumulative figure.
      context.data.on("session.idle", safely(onTurnEnd)),
      // Cost, tokens and the context window live on the session record; any
      // update to it should repaint the usage line.
      context.data.on("session.usage.updated", safely(() => bump())),
      context.data.on("session.model.selected", safely(() => bump())),
    ]

    /**
     * A run's colour: the tone at full strength while live, muted once
     * settled. With `colors.enabled` off, tones are ignored and the line
     * takes the body and muted inks alone. A run marked `host` — its segment
     * is excluded from the palette — draws from the OpenCode theme instead,
     * overrides and all.
     */
    const toneColor = (tone: RunTone | undefined, muted: boolean, host = false): string | undefined =>
      host
        ? inkColor(config.colors ? tone : undefined, muted, undefined, {}, context.theme.text)
        : inkColor(config.colors ? tone : undefined, muted, palette, config.toneOverrides, context.theme.text)

    /** Settings for the gauge: the session's high-water mark sets its scale. */
    const capInput = (view: Display, each: Meter): CapInput => ({
      style: config.capMode,
      primary: view.primary,
      peak: peakTps(each),
      gaugeWidth: config.gaugeWidth,
      gaugeFloor: config.gaugeFloor,
      fast: config.fastTps,
      slow: config.slowTps,
    })

    const currentSession = (): string | undefined => {
      const route = context.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }

    /** What the session record carries for the usage line, read defensively. */
    interface SessionUsage {
      cost?: number
      tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
      model?: { id?: string; providerID?: string }
      time?: { created?: number }
      location?: { directory?: string | null }
    }

    const sessionUsage = (sessionID: string): SessionUsage | undefined =>
      context.data.session.get(sessionID) as SessionUsage | undefined

    /**
     * The window's occupant: the newest assistant message that has reported
     * usage. The session record's token totals are cumulative across turns —
     * summing them would report every prompt ever sent — so the context and
     * cache segments read the last request's own record instead.
     */
    const windowInfo = (
      sessionID: string,
    ): { tokens?: TokenRecord; model?: { id?: string; providerID?: string } } => {
      const messages = context.data.session.message.list(sessionID) as
        | Array<{ type?: string; tokens?: TokenRecord; model?: { id?: string; providerID?: string } }>
        | undefined
      let found: { tokens?: TokenRecord; model?: { id?: string; providerID?: string } } = {}
      for (const message of messages ?? []) {
        if (message?.type !== "assistant" || !message.tokens) continue
        if (contextUsed(message.tokens) > 0) found = { tokens: message.tokens, model: message.model }
      }
      return found
    }

    /** The model's declared context window, where the catalogue declares one. */
    const contextLimit = (model: { id?: string; providerID?: string } | undefined): number | undefined => {
      if (!model?.id || !model.providerID) return undefined
      const location = context.location ?? context.data.location.default()
      for (const entry of context.data.location.model.list(location) ?? []) {
        const info = entry as { id?: string; providerID?: string; limit?: { context?: number } }
        if (info?.id === model.id && info.providerID === model.providerID) {
          const limit = info.limit?.context
          return typeof limit === "number" && limit > 0 ? limit : undefined
        }
      }
      return undefined
    }

    const muted = (text: string): Run => ({ text, tone: "muted" })

    const contextRuns = (tokens: TokenRecord | undefined, limit: number | undefined): Run[] => {
      const used = contextUsed(tokens)
      if (used <= 0) return []
      if (limit === undefined) return [muted(compact(used))]
      const ratio = Math.min(1, used / limit)
      const tone = pressureTone(ratio, config.contextWarn / 100, config.contextDanger / 100)
      return [
        ...contextBar(ratio, contextWidth, tone),
        { text: ` ${Math.round(ratio * 100)}%`, tone },
        muted(" — "),
        muted(compact(used)),
      ]
    }

    const cacheRuns = (tokens: TokenRecord | undefined): Run[] => {
      const share = cacheShare(tokens)
      if (share === undefined) return []
      return [
        muted(`${labels.cache} `),
        muted(`${(share * 100).toFixed(1)}%`),
        muted(" — "),
        muted(compact(tokens?.cache?.read ?? 0)),
      ]
    }

    /** The location a session's shells and working tree live at; the session record knows best. */
    const sessionLocation = (sessionID: string): SessionLocation =>
      sessionUsage(sessionID)?.location ?? context.location ?? context.data.location.default()

    /**
     * Shells the host is running for this session. `data.shell` holds a shell
     * only while it executes — background shells live in a separate registry —
     * so this reads as live activity.
     */
    const shellRuns = (sessionID: string): Run[] => {
      // The shell registry keys on a concrete directory; a session record may
      // not carry one, and `undefined` asks the host for the current location.
      const location = sessionLocation(sessionID)
      const ref = location.directory
        ? { directory: location.directory, workspaceID: location.workspaceID }
        : undefined
      const running = (context.data.shell.list(ref) ?? [])
        .filter((shell) => shell.status === "running" && shell.metadata?.sessionID === sessionID)
      return running.length > 0 ? [{ ...muted(shellsLabel(running.length)), onClick: openShells }] : []
    }

    /**
     * Toggle the composer through the host command, whose Shell tab lists
     * running shells and opens the host's own output viewer. Dispatch the
     * command rather than imitating the popup, so the UI is the host's own.
     */
    const openShells = () => context.keymap.dispatch("session.child.first")

    /**
     * The diff segment's readings, keyed by location. The host answers each
     * request from scratch — a working-copy status listing with a diff behind
     * it — so the counter is cached and re-asked on an interval rather than on
     * every repaint, and a closing turn marks the reading stale so the next
     * paint reflects what the turn just wrote.
     */
    const diffs = new Map<string, DiffReading>()
    const diffing = new Set<string>()

    const refreshDiff = (key: string, location: SessionLocation) => {
      if (diffing.has(key)) return
      const vcs = context.client?.vcs as
        | { status?: (input: { location?: SessionLocation }) => Promise<{ data?: StatusFile[] } | undefined> }
        | undefined
      if (typeof vcs?.status !== "function") return
      diffing.add(key)
      try {
        void vcs
          .status({ location })
          .then(
            (result) => diffs.set(key, { stat: diffTotals(result?.data), at: Date.now() }),
            () => {
              // No repository, no provider, or a host too busy: a location
              // that cannot answer reads as a clean tree until the interval.
              diffs.set(key, { stat: { added: 0, deleted: 0 }, at: Date.now() })
            },
          )
          .finally(() => {
            diffing.delete(key)
            bump()
          })
      } catch {
        // A host without the VCS surface: leave the segment dark.
        diffing.delete(key)
      }
    }

    /** The `+12 -3` counter: additions green, deletions red, a clean tree silent. */
    const diffRuns = (stat: DiffStat): Run[] => {
      const runs: Run[] = []
      for (const [index, part] of diffParts(stat).entries()) {
        if (index > 0) runs.push(muted(" "))
        runs.push({ text: part.text, tone: part.side === "added" ? "success" : "error" })
      }
      return runs
    }

    const meterRuns = (view: Display, each: Meter): Run[] => {
      const runs = gaugeFor(capInput(view, each))
      view.readings.forEach((reading, index) => {
        const lead = index > 0 ? " · " : runs.length > 0 ? " " : ""
        runs.push({
          text: `${lead}${reading.label} ${formatRate(reading.tps)}`,
          tone: speedTone(reading.tps, config.fastTps, config.slowTps),
          dim: !reading.live,
        })
      })
      runs.push(muted(" tok/s"))
      return runs
    }

    const costRuns = (usage: SessionUsage | undefined): Run[] => {
      const cost = usage?.cost
      return typeof cost === "number" && cost > 0 ? [muted(money(cost))] : []
    }

    const timeRuns = (usage: SessionUsage | undefined, now: number): Run[] => {
      const created = usage?.time?.created
      return typeof created === "number" && created > 0 ? [muted(duration(now - created))] : []
    }

    /**
     * The given segments in their configured order, each as its own run list;
     * a segment with nothing to say is skipped. The list is the placement's —
     * `usage.surfaces` may differ from surface to surface — and how the rows
     * meet is that surface's business: joined across for a footer, one per row
     * for a sidebar.
     */
    const usageRows = (segments: UsageSegment[], sessionID: string, now: number): Run[][] => {
      const session = sessionUsage(sessionID)
      const window = windowInfo(sessionID)
      const limit = contextLimit(window.model ?? session?.model)
      const rows: Run[][] = []
      for (const segment of segments) {
        let part: Run[] = []
        if (segment === "shells") part = shellRuns(sessionID)
        else if (segment === "context") part = contextRuns(window.tokens, limit)
        else if (segment === "cache") part = cacheRuns(window.tokens)
        else if (segment === "meter") {
          const found = meters.get(sessionID)
          // A session with no meter has met this generation mid-history — a
          // resume, a reload: rebuild its last figure from the records. The
          // seed repaints when it lands; this paint shows the other segments.
          if (!found) void seedMeter(sessionID)
          const view = found ? display(found, now, config.readings, opts, labels) : undefined
          if (found && view) part = meterRuns(view, found)
        } else if (segment === "cost") part = costRuns(session)
        else if (segment === "time") part = timeRuns(session, now)
        else if (segment === "diff") {
          const location = sessionLocation(sessionID)
          const key = diffKey(location)
          const reading = diffs.get(key)
          if (diffDue(reading, now, config.diffRefreshMs)) refreshDiff(key, location)
          if (reading) part = diffRuns(reading.stat)
        }
        if (part.length === 0) continue
        // An excluded segment always draws in the host theme: mark its runs
        // before they reach the colourizer.
        rows.push(config.excludeSegments.includes(segment) ? hostRuns(part) : part)
      }
      return rows
    }

    /** The rows joined across one line, separators between. */
    const joinRows = (rows: Run[][]): Run[] => {
      const runs: Run[] = []
      for (const row of rows) {
        if (runs.length > 0) runs.push(muted(config.usageSeparator))
        runs.push(...row)
      }
      return runs
    }

    const Stats = (props: { sessionID?: string }) => {
      const each = () => {
        version()
        return props.sessionID ? meters.get(props.sessionID) : undefined
      }
      const stats = createMemo(() => {
        const found = each()
        return found ? tpsStats(found, Date.now(), config.statsWindowMs) : undefined
      })
      const view = createMemo(() => {
        const found = each()
        return found ? display(found, Date.now(), config.readings, opts, labels) : undefined
      })
      return (
        <box flexDirection="column" paddingLeft={2} paddingRight={2} gap={1}>
          <text>tok/s</text>
          <text>
            {view()
              ? `${view()!.readings.map((reading) => `${reading.label} ${formatRate(reading.tps)}`).join(" · ")} tok/s`
              : "idle"}
          </text>
          <text>
            {stats() && stats()!.count > 0
              ? `avg ${Math.round(config.statsWindowMs / 1000)}s ${formatRate(stats()!.avg)} · mean ${formatRate(stats()!.mean)} · p95 ${formatRate(stats()!.p95)} · ${stats()!.count} turns`
              : "no completed turns yet"}
          </text>
        </box>
      )
    }

    /**
     * The stats command.
     *
     * v2 keeps the keymap provider inside its component tree, so a layer
     * registered from `setup` throws "Keymap.Provider is missing" and takes the
     * whole plugin down with it. The `app` slot's render runs inside that tree,
     * once, and owns the layer from there (the pattern the CLI plugin docs use).
     *
     * The layer must be `mode: "global"`. v2 pushes `autocomplete` while the
     * slash list is open and `modal` while a dialog is, and a layer that names
     * no mode is pinned to `base`, which disables it in exactly the two places
     * a command is looked for. Mode-less commands therefore never appear.
     */
    context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "opencode-status-line.stats",
              title: "Speed: statistics",
              group: "opencode-status-line",
              palette: true,
              slash: { name: "opencode-status-line", aliases: ["tps"] },
              run: () => {
                const sessionID = currentSession()
                context.ui.dialog.set({ size: "large" })
                context.ui.dialog.show(() => <Stats sessionID={sessionID} />)
              },
            },
          ],
        }))
        return null
      },
    })

    /** One drawn row: the plain runs, a run that takes clicks, then the rest. */
    interface RowView {
      before: Run[]
      clickable?: Run
      after: Run[]
    }

    /**
     * A renderer for one placement. Each configured surface gets its own
     * instance: it closes over that surface's layout facts (stack direction,
     * padding, row sharing) and its measured width is its own — two
     * placements are two boxes, each dealt its own width by the host — while
     * all of them repaint from the one shared `version` signal.
     */
    const renderFor = (surface: Surface) => (input: { sessionID?: string }) => {
      const stack = stackFor(surface)
      const padding = resolvedPadding(config, surface)
      const sharesRow = sharesHostRow(surface)
      // The placement's own segment list, or the shared `usage.segments`.
      const segments = segmentsFor(config, surface)
      let warned = false
      /**
       * The width the host actually dealt this box, reported by layout. A
       * footer row shares its width with the host's own content, so the
       * renderer's width cannot say how much is ours; only the box can.
       */
      const [fitted, setFitted] = createSignal<number | undefined>(undefined)
      /**
       * Everything drawn is rebuilt inside this memo. The parts must not be a
       * plain array computed in the component body: `Show` calls its children
       * untracked, so a static build is evaluated once and then frozen — the
       * symptom being a line that never repaints. A memo re-reads `version()`
       * (deltas and the ticker) and every repaint gets fresh readings.
       *
       * A sidebar surface stacks the segments, one per row, each cut to the
       * column's width. A row surface joins the segments across one line and
       * moves whole segments that do not fit to a further row — as many as the
       * width demands. It fits to the box's own measured width, which is read
       * after every layout and therefore also follows a resize without waiting
       * for the heartbeat.
       *
       * A run with `onClick` is hoisted out of the plain text into its own
       * `<text>`: mouse handlers live on renderables, and a `span` is not one.
       *
       * The try/catch is the same insurance as `safely`: a bug here must dim a
       * line, not break a session.
       */
      const view = createMemo<{ lines: RowView[]; basis: number }>(() => {
        try {
          // The heartbeat's clock: held figures and the elapsed timer repaint
          // even while nothing is streaming.
          version()
          // Slots such as `prompt.footer` carry no session in their input; the
          // route knows which conversation is on screen. Without one — the
          // home screen, a plugin page — the line stays hidden rather than
          // describing a conversation that is not open.
          const sessionID = input?.sessionID ?? currentSession()
          if (!sessionID) return { lines: [], basis: 0 }
          const rows = usageRows(segments, sessionID, Date.now())
          if (rows.length === 0) return { lines: [], basis: 0 }
          const viewport = (context as { renderer?: { width?: number } }).renderer?.width
          const window = typeof viewport === "number" && viewport > 0 ? viewport : undefined
          const lines: Run[][] = []
          if (stack === "column") {
            for (const runs of rows) {
              // A sidebar column is cut to its width with the padding kept in
              // reserve, so configured padding cannot push it past the edge.
              const room =
                window !== undefined
                  ? Math.max(1, columnWidth(window) - padding.left - padding.right)
                  : undefined
              lines.push(room !== undefined ? cutRuns(runs, room) : runs)
            }
          } else {
            // A row fits itself to the width its box was actually dealt.
            // `renderer.width` is the window and would overstate a footer row
            // shared with the host's own content, so prefer the box's own
            // laid-out width, measured after the first paint; the renderer
            // covers the paint before that measurement exists.
            const measured = fitted()
            const granted = measured !== undefined && measured > 0 ? measured : window
            const room =
              granted !== undefined ? Math.max(1, granted - padding.left - padding.right) : undefined
            if (room !== undefined) lines.push(...wrapRows(rows, room, config.usageSeparator))
            else lines.push(joinRows(rows))
          }
          return {
            basis: joinedWidth(rows, config.usageSeparator),
            lines: lines
              .filter((runs) => runs.length > 0)
              .map((runs) => {
                const at = runs.findIndex((run) => run.onClick)
                if (at < 0) return { before: runs, after: [] }
                return { before: runs.slice(0, at), clickable: runs[at], after: runs.slice(at + 1) }
              }),
          }
        } catch (error) {
          if (!warned) {
            warned = true
            console.warn("opencode-status-line: render failed", error)
          }
          return { lines: [], basis: 0 }
        }
      })
      // A `span` takes its colour through `style`, not a bare `fg` prop:
      // @opentui/solid drops `fg` on spans, which paints the whole line in
      // the default foreground. Text renderables below still take `fg`.
      const spans = (runs: Run[]) =>
        runs.map((run) => (
          <span style={{ fg: toneColor(run.tone, run.dim ?? false, run.host ?? false) }}>{run.text}</span>
        ))
      const [hovered, setHovered] = createSignal(false)
      return (
        <Show when={view().lines.length > 0}>
          <box
            flexDirection="column"
            minWidth={0}
            // A row child's width is dealt by the host's row, and its wrapped
            // content must not become the basis of that deal: hold the
            // unwrapped width, or a narrow layout would pin the box narrow
            // for good. `app` and the composer top stretch to the window and
            // need no basis.
            flexBasis={sharesRow ? view().basis : undefined}
            // The box must never be shrunk below its drawn height. The host
            // puts it in a column that can overflow — a transcript taller than
            // the window, most of the time — and Yoga's shrink then squashes a
            // wrapped box into itself, drawing every row on the same line.
            // `minHeight` is the content plus the padding, which is part of
            // the border box.
            minHeight={view().lines.length + padding.top + padding.bottom}
            paddingLeft={padding.left}
            paddingRight={padding.right}
            paddingTop={padding.top}
            paddingBottom={padding.bottom}
            onSizeChange={function (this: { width: number }) {
              const width = this.width
              // Deferred: the handler runs inside layout, and writing the
              // signal directly would re-enter the render that caused it.
              queueMicrotask(() => setFitted(width))
            }}
          >
            <For each={view().lines}>
              {(row) => (
                // A row is always its own flex row, so a clickable run sharing
                // it stays on the same line when the outer box is a column.
                <box flexDirection="row">
                  <Show when={row.before.length > 0}>
                    <text wrapMode="none">{spans(row.before)}</text>
                  </Show>
                  <Show when={row.clickable}>
                    {(run) => (
                      <text
                        wrapMode="none"
                        onMouseOver={() => setHovered(true)}
                        onMouseOut={() => setHovered(false)}
                        onMouseUp={() => run()?.onClick?.()}
                        fg={
                          hovered()
                            ? toneColor(undefined, false, run().host ?? false)
                            : toneColor(run().tone, run().dim ?? false, run().host ?? false)
                        }
                      >
                        {spans([run()])}
                      </text>
                    )}
                  </Show>
                  <Show when={row.after.length > 0}>
                    <text wrapMode="none">{spans(row.after)}</text>
                  </Show>
                </box>
              )}
            </For>
          </box>
        </Show>
      )
    }

    // The placement key is the verb (`append`); its value is the slot path.
    // One registration per configured placement: `config.surface` is a list,
    // and each surface gets its own renderer because the layout facts differ
    // (a sidebar stacks, a footer shares its row, `app` carries its indent) —
    // all of them repainting from the one shared `version` signal.
    for (const surface of config.surface) {
      context.ui.slot({ append: surface, render: renderFor(surface) })
    }

    return () => {
      for (const stop of stops) stop()
      if (timer) clearInterval(timer)
      clearInterval(heartbeat)
    }
  },
})
