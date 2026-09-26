import { describe, expect, test } from "bun:test"
import { diffDue, diffKey, diffParts, diffTotals } from "../src/diff.ts"

describe("diffTotals", () => {
  test("sums additions and deletions across files", () => {
    expect(
      diffTotals([
        { additions: 12, deletions: 3 },
        { additions: 1, deletions: 0 },
      ]),
    ).toEqual({ added: 13, deleted: 3 })
  })

  test("a missing list or an unmeasured file counts nothing", () => {
    expect(diffTotals(undefined)).toEqual({ added: 0, deleted: 0 })
    expect(diffTotals([])).toEqual({ added: 0, deleted: 0 })
    expect(diffTotals([{ additions: Number.NaN, deletions: Number.POSITIVE_INFINITY }])).toEqual({
      added: 0,
      deleted: 0,
    })
    expect(diffTotals([{ additions: 2 }])).toEqual({ added: 2, deleted: 0 })
  })
})

describe("diffParts", () => {
  test("signs both sides", () => {
    expect(diffParts({ added: 12, deleted: 3 })).toEqual([
      { side: "added", text: "+12" },
      { side: "deleted", text: "-3" },
    ])
  })

  test("a zero side drops out and a clean tree draws nothing", () => {
    expect(diffParts({ added: 5, deleted: 0 })).toEqual([{ side: "added", text: "+5" }])
    expect(diffParts({ added: 0, deleted: 7 })).toEqual([{ side: "deleted", text: "-7" }])
    expect(diffParts({ added: 0, deleted: 0 })).toEqual([])
  })

  test("large counts are compact", () => {
    expect(diffParts({ added: 1_250, deleted: 2_000_000 })).toEqual([
      { side: "added", text: "+1.3k" },
      { side: "deleted", text: "-2.0M" },
    ])
  })
})

describe("diffDue", () => {
  test("a missing reading is always due", () => {
    expect(diffDue(undefined, 10_000, 5_000)).toBe(true)
  })

  test("a fresh reading waits out the interval", () => {
    const reading = { stat: { added: 1, deleted: 0 }, at: 10_000 }
    expect(diffDue(reading, 14_999, 5_000)).toBe(false)
    expect(diffDue(reading, 15_000, 5_000)).toBe(true)
  })
})

describe("diffKey", () => {
  test("one key per working tree, workspaces kept apart", () => {
    expect(diffKey({ directory: "/work/a" })).toBe(diffKey({ directory: "/work/a" }))
    expect(diffKey({ directory: "/work/a" })).not.toBe(diffKey({ directory: "/work/b" }))
    expect(diffKey({ directory: "/work/a", workspaceID: "one" })).not.toBe(
      diffKey({ directory: "/work/a", workspaceID: "two" }),
    )
    expect(diffKey(undefined)).toBe(diffKey({}))
  })
})
