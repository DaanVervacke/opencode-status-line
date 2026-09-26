import { describe, expect, test } from "bun:test"
import {
  HOST_PALETTE,
  inkColor,
  isHexColor,
  isPaletteChoice,
  PALETTE_FAMILIES,
  PALETTES,
  resolvePalette,
  TONE_KEYS,
} from "../src/palette.ts"

describe("registry", () => {
  test("every variant carries a unique name and five hex inks", () => {
    const names = new Set<string>()
    for (const palette of PALETTES) {
      expect(names.has(palette.name)).toBe(false)
      names.add(palette.name)
      expect(PALETTE_FAMILIES).toContain(palette.family)
      expect(palette.mode === "dark" || palette.mode === "light").toBe(true)
      for (const key of TONE_KEYS) expect(isHexColor(palette.tones[key])).toBe(true)
    }
  })

  test("the monochrome palettes keep every status ink on the text shade", () => {
    for (const name of ["grey", "white"]) {
      const palette = resolvePalette(name, "dark")
      expect(palette?.name).toBe(name)
      expect(palette?.tones.success).toBe(palette?.tones.text)
      expect(palette?.tones.warning).toBe(palette?.tones.text)
      expect(palette?.tones.error).toBe(palette?.tones.text)
      expect(palette?.tones.muted).not.toBe(palette?.tones.text)
    }
  })

  test("every family resolves in both modes to one of its own", () => {
    for (const family of PALETTE_FAMILIES) {
      for (const mode of ["dark", "light"] as const) {
        const resolved = resolvePalette(family, mode)
        expect(resolved?.family).toBe(family)
        expect(resolved?.mode).toBeDefined()
      }
    }
  })
})

describe("resolvePalette", () => {
  test("a variant name resolves to itself", () => {
    const mocha = resolvePalette("catppuccin-mocha")
    expect(mocha?.name).toBe("catppuccin-mocha")
    expect(mocha?.family).toBe("catppuccin")
    expect(mocha?.tones.success).toBe("#a6e3a1")
  })

  test("a family follows the mode: the first variant of that mode wins", () => {
    expect(resolvePalette("catppuccin", "dark")?.name).toBe("catppuccin-mocha")
    expect(resolvePalette("catppuccin", "light")?.name).toBe("catppuccin-latte")
    expect(resolvePalette("gruvbox", "light")?.name).toBe("gruvbox-light")
    expect(resolvePalette("tokyonight")?.name).toBe("tokyonight-night")
  })

  test("a mode that is neither light nor dark counts as dark", () => {
    expect(resolvePalette("catppuccin", "system")?.name).toBe("catppuccin-mocha")
  })

  test("a family with one variant resolves in both modes", () => {
    expect(resolvePalette("nord", "dark")?.name).toBe("nord")
    expect(resolvePalette("nord", "light")?.name).toBe("nord")
  })

  test("overrides replace single inks and leave the registry alone", () => {
    const resolved = resolvePalette("nord", "dark", { success: "#123456", muted: "#abcdef" })
    expect(resolved?.tones.success).toBe("#123456")
    expect(resolved?.tones.muted).toBe("#abcdef")
    expect(resolved?.tones.warning).toBe("#ebcb8b")
    expect(PALETTES.find((palette) => palette.name === "nord")?.tones.success).toBe("#a3be8c")
  })

  test("unknown names resolve to nothing", () => {
    expect(resolvePalette("catpuccin")).toBeUndefined()
    expect(resolvePalette("")).toBeUndefined()
  })
})

describe("inkColor", () => {
  const theme = {
    base: "#base",
    muted: "#muted",
    feedback: {
      success: { base: "#green" },
      warning: { base: "#yellow", muted: "#yellowdim" },
      error: { base: "#red" },
    },
  }

  test("host tokens colour each role, with the dim shade where the theme has one", () => {
    expect(inkColor(undefined, false, undefined, {}, theme)).toBe("#base")
    expect(inkColor(undefined, true, undefined, {}, theme)).toBe("#muted")
    expect(inkColor("muted", false, undefined, {}, theme)).toBe("#muted")
    expect(inkColor("success", false, undefined, {}, theme)).toBe("#green")
    expect(inkColor("success", true, undefined, {}, theme)).toBe("#green")
    expect(inkColor("warning", true, undefined, {}, theme)).toBe("#yellowdim")
    expect(inkColor("error", false, undefined, {}, theme)).toBe("#red")
  })

  test("a palette replaces the host tokens; held figures take its muted ink", () => {
    const palette = resolvePalette("nord", "dark")
    expect(inkColor(undefined, false, palette, {}, theme)).toBe("#d8dee9")
    expect(inkColor("success", false, palette, {}, theme)).toBe("#a3be8c")
    expect(inkColor("success", true, palette, {}, theme)).toBe("#4c566a")
    expect(inkColor("muted", false, palette, {}, theme)).toBe("#4c566a")
  })

  test("overrides win over the host tokens, and the palette carries its own", () => {
    expect(inkColor("success", true, undefined, { success: "#00ff00" }, theme)).toBe("#00ff00")
    expect(inkColor(undefined, false, undefined, { text: "#111111" }, theme)).toBe("#111111")
    expect(inkColor("muted", false, undefined, { muted: "#222222" }, theme)).toBe("#222222")
    const palette = resolvePalette("nord", "dark", { success: "#00ff00" })
    expect(inkColor("success", false, palette, {}, theme)).toBe("#00ff00")
  })

  test("a theme without feedback falls back to its body ink", () => {
    const bare = { base: "#base", muted: "#muted", feedback: {} }
    expect(inkColor("success", false, undefined, {}, bare)).toBe("#base")
  })
})

describe("choices and hexes", () => {
  test("host, variants and families are known; typos are not", () => {
    expect(isPaletteChoice(HOST_PALETTE)).toBe(true)
    for (const palette of PALETTES) expect(isPaletteChoice(palette.name)).toBe(true)
    for (const family of PALETTE_FAMILIES) expect(isPaletteChoice(family)).toBe(true)
    expect(isPaletteChoice("catpuccin")).toBe(false)
    expect(isPaletteChoice("")).toBe(false)
  })

  test("hex validation takes six digits only", () => {
    expect(isHexColor("#a6e3a1")).toBe(true)
    expect(isHexColor("#A6E3A1")).toBe(true)
    expect(isHexColor("#abc")).toBe(false)
    expect(isHexColor("a6e3a1")).toBe(false)
    expect(isHexColor("#a6e3a1ff")).toBe(false)
  })
})
