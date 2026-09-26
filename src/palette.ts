/**
 * The line's bundled colour palettes, so it can wear Catppuccin, Dracula,
 * Gruvbox, Nord, Rosé Pine or Tokyo Night independently of the OpenCode
 * theme. `colors.palette` names one — a variant directly, or a family that
 * follows the host's light/dark mode — and `colors.overrides` lays single
 * hexes over it. Resolution is pure, so the registry can be exercised
 * without a terminal:
 *
 *   bun test test/palette.test.ts
 *
 * Every hex is the theme's own published value (catppuccin/nvim,
 * dracula/dracula-theme, folke/tokyonight.nvim, nordtheme/nord,
 * morhetz/gruvbox, rose-pine/rose-pine-palette), carrying only the inks the
 * line draws with: the body text, the muted secondary ink, and the three
 * status colours.
 */
import type { SpeedTone } from "./rate.ts"
import type { RunTone } from "./render.ts"

/** The `colors.palette` value meaning "follow the OpenCode theme's tokens". */
export const HOST_PALETTE = "host"

/** The ink roles the line draws with; held figures wear `muted`. */
export type ToneKey = "text" | "muted" | SpeedTone

/** The tone keys, in the order validation, warnings and docs list them. */
export const TONE_KEYS: readonly ToneKey[] = ["text", "muted", "success", "warning", "error"]

/** One colour per ink role, as `#rrggbb`. */
export type PaletteTones = Record<ToneKey, string>

/** Per-tone recolours, laid over the chosen palette or the host tokens. */
export type ToneOverrides = Partial<PaletteTones>

/** Which host mode a variant suits. */
export type PaletteMode = "light" | "dark"

export interface Palette {
  /** The variant's canonical name, e.g. `catppuccin-mocha`. */
  name: string
  /** The family a bare `colors.palette` resolves through, e.g. `catppuccin`. */
  family: string
  mode: PaletteMode
  tones: PaletteTones
}

/**
 * Every bundled variant. Within a family the mode's best-known variant comes
 * first — the first variant matching the host's mode is what a bare family
 * name resolves to, so `catppuccin` is mocha in dark and latte in light.
 */
export const PALETTES: readonly Palette[] = [
  // Catppuccin — https://github.com/catppuccin/catppuccin
  {
    name: "catppuccin-mocha",
    family: "catppuccin",
    mode: "dark",
    tones: {
      text: "#cdd6f4",
      muted: "#7f849c",
      success: "#a6e3a1",
      warning: "#f9e2af",
      error: "#f38ba8",
    },
  },
  {
    name: "catppuccin-macchiato",
    family: "catppuccin",
    mode: "dark",
    tones: {
      text: "#cad3f5",
      muted: "#8087a2",
      success: "#a6da95",
      warning: "#eed49f",
      error: "#ed8796",
    },
  },
  {
    name: "catppuccin-frappe",
    family: "catppuccin",
    mode: "dark",
    tones: {
      text: "#c6d0f5",
      muted: "#838ba7",
      success: "#a6d189",
      warning: "#e5c890",
      error: "#e78284",
    },
  },
  {
    name: "catppuccin-latte",
    family: "catppuccin",
    mode: "light",
    tones: {
      text: "#4c4f69",
      muted: "#8c8fa1",
      success: "#40a02b",
      warning: "#df8e1d",
      error: "#d20f39",
    },
  },
  // Dracula — https://github.com/dracula/dracula-theme
  {
    name: "dracula",
    family: "dracula",
    mode: "dark",
    tones: {
      text: "#f8f8f2",
      muted: "#6272a4",
      success: "#50fa7b",
      warning: "#f1fa8c",
      error: "#ff5555",
    },
  },
  {
    name: "alucard",
    family: "dracula",
    mode: "light",
    tones: {
      text: "#1f1f1f",
      muted: "#6c664b",
      success: "#14710a",
      warning: "#846e15",
      error: "#cb3a2a",
    },
  },
  // Gruvbox — https://github.com/morhetz/gruvbox
  {
    name: "gruvbox-dark",
    family: "gruvbox",
    mode: "dark",
    tones: {
      text: "#ebdbb2",
      muted: "#928374",
      success: "#b8bb26",
      warning: "#fabd2f",
      error: "#fb4934",
    },
  },
  {
    name: "gruvbox-light",
    family: "gruvbox",
    mode: "light",
    tones: {
      text: "#3c3836",
      muted: "#928374",
      success: "#79740e",
      warning: "#b57614",
      error: "#9d0006",
    },
  },
  // Nord — https://www.nordtheme.com
  {
    name: "nord",
    family: "nord",
    mode: "dark",
    tones: {
      text: "#d8dee9",
      muted: "#4c566a",
      success: "#a3be8c",
      warning: "#ebcb8b",
      error: "#bf616a",
    },
  },
  // Rosé Pine — https://rosepinetheme.com
  {
    name: "rose-pine",
    family: "rose-pine",
    mode: "dark",
    tones: {
      text: "#e0def4",
      muted: "#6e6a86",
      success: "#31748f",
      warning: "#f6c177",
      error: "#eb6f92",
    },
  },
  {
    name: "rose-pine-moon",
    family: "rose-pine",
    mode: "dark",
    tones: {
      text: "#e0def4",
      muted: "#6e6a86",
      success: "#3e8fb0",
      warning: "#f6c177",
      error: "#eb6f92",
    },
  },
  {
    name: "rose-pine-dawn",
    family: "rose-pine",
    mode: "light",
    tones: {
      text: "#464261",
      muted: "#9893a5",
      success: "#286983",
      warning: "#ea9d34",
      error: "#b4637a",
    },
  },
  // Tokyo Night — https://github.com/folke/tokyonight.nvim
  {
    name: "tokyonight-night",
    family: "tokyonight",
    mode: "dark",
    tones: {
      text: "#c0caf5",
      muted: "#565f89",
      success: "#9ece6a",
      warning: "#e0af68",
      error: "#f7768e",
    },
  },
  {
    name: "tokyonight-storm",
    family: "tokyonight",
    mode: "dark",
    tones: {
      text: "#c0caf5",
      muted: "#565f89",
      success: "#9ece6a",
      warning: "#e0af68",
      error: "#f7768e",
    },
  },
  {
    name: "tokyonight-moon",
    family: "tokyonight",
    mode: "dark",
    tones: {
      text: "#c8d3f5",
      muted: "#636da6",
      success: "#c3e88d",
      warning: "#ffc777",
      error: "#ff757f",
    },
  },
  {
    name: "tokyonight-day",
    family: "tokyonight",
    mode: "light",
    tones: {
      text: "#3760bf",
      muted: "#848cb5",
      success: "#587539",
      warning: "#8c6c3e",
      error: "#f52a65",
    },
  },
  // Monochrome — one hue throughout: the status inks share the text shade, so
  // speeds, the context bar and the diff all read flat, and only the muted
  // secondary ink steps down. Background-agnostic; pick by taste.
  {
    name: "grey",
    family: "grey",
    mode: "dark",
    tones: {
      text: "#9e9e9e",
      muted: "#6b6b6b",
      success: "#9e9e9e",
      warning: "#9e9e9e",
      error: "#9e9e9e",
    },
  },
  {
    name: "white",
    family: "white",
    mode: "dark",
    tones: {
      text: "#ffffff",
      muted: "#dcdcdc",
      success: "#ffffff",
      warning: "#ffffff",
      error: "#ffffff",
    },
  },
]

/** The family names, in registry order, for warnings and the README. */
export const PALETTE_FAMILIES: readonly string[] = [...new Set(PALETTES.map((palette) => palette.family))]

/** Whether a `colors.palette` value names the host, a variant or a family. */
export function isPaletteChoice(value: string): boolean {
  return value === HOST_PALETTE || PALETTES.some((palette) => palette.name === value || palette.family === value)
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Whether `value` is the `#rrggbb` form `colors.overrides` takes. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

export interface ResolvedPalette {
  name: string
  family: string
  mode: PaletteMode
  /** All five inks, `overrides` layered over the variant's own. */
  tones: PaletteTones
}

/**
 * The palette `name` asks for: a variant directly, or a family resolved to
 * its variant for `mode` — anything but `"light"` counts as dark, the host's
 * own default. A family with no variant for the mode falls back to its first.
 * `overrides` are laid over the palette's inks; an unknown name resolves to
 * undefined and leaves the caller on the host theme.
 */
export function resolvePalette(
  name: string,
  mode: string = "dark",
  overrides: ToneOverrides = {},
): ResolvedPalette | undefined {
  const variant =
    PALETTES.find((palette) => palette.name === name) ??
    PALETTES.find((palette) => palette.family === name && palette.mode === (mode === "light" ? "light" : "dark")) ??
    PALETTES.find((palette) => palette.family === name)
  if (variant === undefined) return undefined
  const tones = { ...variant.tones }
  for (const key of TONE_KEYS) {
    const value = overrides[key]
    if (typeof value === "string" && value.length > 0) tones[key] = value
  }
  return { name: variant.name, family: variant.family, mode: variant.mode, tones }
}

/**
 * The host theme's resolved text tokens, structurally: `base` is the body
 * ink, `muted` the secondary ink, and `feedback` the tone states (its own
 * `muted` shades are optional — not every theme defines them).
 */
export interface ThemeInk {
  base: string
  muted: string
  feedback: Partial<Record<SpeedTone, { base: string; muted?: string }>>
}

/**
 * The colour one run draws with. An undefined `tone` is the body text and
 * `"muted"` the secondary ink; a status tone takes its own colour, or the
 * muted shade when `dim` marks a held or settled figure. A chosen palette
 * replaces the host tokens wholesale (`overrides` are already in its tones),
 * while overrides laid on the host theme win tone by tone.
 */
export function inkColor(
  tone: RunTone | undefined,
  dim: boolean,
  palette: ResolvedPalette | undefined,
  overrides: ToneOverrides,
  theme: ThemeInk,
): string {
  const body = palette?.tones.text ?? overrides.text ?? theme.base
  const muted = palette?.tones.muted ?? overrides.muted ?? theme.muted
  if (tone === undefined) return dim ? muted : body
  if (tone === "muted") return muted
  if (palette) return dim ? palette.tones.muted : palette.tones[tone]
  const override = overrides[tone]
  if (override !== undefined) return override
  const states = theme.feedback[tone] ?? { base: theme.base, muted: theme.muted }
  return dim ? (states.muted ?? states.base) : states.base
}
