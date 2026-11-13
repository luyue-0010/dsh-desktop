'use strict'

/**
 * Dark appearance layer for the wrapped GUI: the bundled background image, a
 * top-to-bottom gradient that resolves into solid darkness, and frosted glass on
 * the surfaces that float above it.
 *
 * Two rules shape the implementation:
 *
 * 1. **The app's own dark theme does the colour work.** The desktop shell only
 *    flips `nativeTheme.themeSource` to `dark`, so every label, border and state
 *    colour comes from the app's own dark tokens. This layer therefore never
 *    repaints text or controls — it only replaces surfaces (backgrounds) and adds
 *    blur. If the user picks “浅色” inside the app, the layer steps aside.
 * 2. **Anchors are semantic.** Everything is keyed off `data-slot` names and the
 *    `data-dsh-dark` flag, never off hashed CSS-module class names.
 *
 * The palette is drawn from the Japanese traditional colours of the
 * nippon-color chart (<https://ssshooter.github.io/nippon-color/>), chosen to
 * match the accompanying artwork: 浅葱 for her hair, 山吹 for the suit's
 * accents, 錆青磁 as the calm field, 紅 for her eyes as the single warm accent,
 * and 黒橡 / 墨 for the dark ground.
 *
 * @module dsh-desktop/theme
 */

const fs = require('node:fs')
const path = require('node:path')

/** The nippon-color entries this shell uses, with their names for documentation. */
const NIPPON_COLORS = {
  asagi: { hex: '#33A6B8', name: '浅葱', romaji: 'ASAGI' },
  yamabuki: { hex: '#FFB11B', name: '山吹', romaji: 'YAMABUKI' },
  sabiseiji: { hex: '#86A697', name: '錆青磁', romaji: 'SABISEIJI' },
  kurenai: { hex: '#CB1B45', name: '紅', romaji: 'KURENAI' },
  kamenozoki: { hex: '#A5DEE4', name: '瓶覗', romaji: 'KAMENOZOKI' },
  shironeri: { hex: '#FCFAF2', name: '白練', romaji: 'SHIRONERI' },
  ginnezumi: { hex: '#91989F', name: '銀鼠', romaji: 'GINNEZUMI' },
  ainisumicha: { hex: '#373C38', name: '藍墨茶', romaji: 'AISUMICHA' },
  sumi: { hex: '#1C1C1C', name: '墨', romaji: 'SUMI' },
  kurotsurubami: { hex: '#0B1013', name: '黒橡', romaji: 'KUROTSURUBAMI' },
}

/** Expand `#rgb` / `#rrggbb` into an `rgba()` string; unparsable input passes through. */
function withAlpha(color, alpha) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!match) return String(color || 'transparent')
  let hex = match[1]
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('')
  const value = Number.parseInt(hex, 16)
  const a = Number(Number(alpha).toFixed(3))
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${a})`
}

/** Clamp a numeric setting, falling back when it is not a finite number. */
function clamp(value, min, max, fallback) {
  const number = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/**
 * The shipped fade profile, as `[percentDown, darkness]` anchors: light at the
 * top, 30% dark at half height, 50% at 70%, solid at the bottom. The anchors are
 * the configuration — the stylesheet emits exactly these stops, and a linear
 * gradient interpolates between them, so "30% at 50%" is literally in the CSS.
 */
const DEFAULT_FADE_STOPS = [
  [0, 0.12],
  [50, 0.44],
  [70, 0.75],
  [100, 1],
]

/**
 * Validate a fade-anchor list: numeric pairs, sorted, spanning 0–100%.
 * @param stops - the raw `theme.fadeStops` value.
 * @returns a usable, ascending anchor list.
 */
function normalizeFadeStops(stops, fallback = DEFAULT_FADE_STOPS) {
  const list = Array.isArray(stops) ? stops : []
  const parsed = list
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([percent, darkness]) => [clamp(percent, 0, 100, 0), clamp(darkness, 0, 1, 0)])
  if (parsed.length < 2) return fallback
  parsed.sort((a, b) => a[0] - b[0])
  if (parsed[0][0] > 0) parsed.unshift([0, parsed[0][1]])
  if (parsed[parsed.length - 1][0] < 100) parsed.push([100, 1])
  return parsed
}

/** The backdrop presets the derivation script can produce. */
const IMAGE_PRESETS = ['selective', 'mono', 'blackgold', 'none']

/** Selectable appearances; `system` follows the operating system. */
const APPEARANCES = ['light', 'dark', 'system']

/** Dark appearance defaults: the shipped 黒橡 look. */
const DARK_DEFAULTS = {
  colors: { ground: NIPPON_COLORS.kurotsurubami.hex, text: NIPPON_COLORS.shironeri.hex, accent: NIPPON_COLORS.kurenai.hex },
  imageOpacity: 0.92,
  fadeStops: DEFAULT_FADE_STOPS,
  glass: { blur: 18, saturation: 1.25, opacity: 0.46 },
}

/** Light appearance defaults: warm paper ground, ink text, a heavy white wash over the artwork. */
const LIGHT_DEFAULTS = {
  colors: { ground: '#F6F4EF', text: '#1C1C1E', accent: NIPPON_COLORS.kurenai.hex },
  imageOpacity: 0.34,
  fadeStops: [[0, 0.18], [45, 0.62], [72, 0.86], [100, 0.97]],
  glass: { blur: 20, saturation: 1.1, opacity: 0.62 },
}

/** Normalize one palette block (colors, wash, fade, glass) against its defaults. */
function normalizeSurface(raw, defaults) {
  const glass = raw.glass || {}
  const colors = raw.colors || {}
  return {
    colors: {
      ground: colors.ground || defaults.colors.ground,
      text: colors.text || defaults.colors.text,
      accent: colors.accent || defaults.colors.accent,
    },
    imageOpacity: clamp(raw.imageOpacity, 0.05, 1, defaults.imageOpacity),
    fadeStops: normalizeFadeStops(raw.fadeStops, defaults.fadeStops),
    glass: {
      blur: clamp(glass.blur, 0, 40, defaults.glass.blur),
      saturation: clamp(glass.saturation, 1, 2.5, defaults.glass.saturation),
      opacity: clamp(glass.opacity, 0, 1, defaults.glass.opacity),
    },
  }
}

/**
 * Normalize a settings `theme` block into a complete, validated config.
 *
 * The top-level `colors` / `glass` / `fadeStops` / `imageOpacity` fields are the
 * dark palette kept for compatibility with settings written before appearances
 * existed; the light palette lives in `theme.light` and falls back to
 * {@link LIGHT_DEFAULTS}.
 */
function normalizeThemeConfig(theme = {}) {
  const preset = typeof theme.imagePreset === 'string' ? theme.imagePreset : 'selective'
  const appearance = APPEARANCES.includes(theme.appearance) ? theme.appearance : 'light'
  const light = theme.light || {}
  return {
    enabled: theme.enabled !== false,
    forceDark: theme.forceDark !== false,
    appearance,
    image: typeof theme.image === 'string' ? theme.image : '',
    /** Which derived artwork to use: selective (keep the hair and eyes), mono,
     * blackgold, or none for the untouched source. */
    imagePreset: IMAGE_PRESETS.includes(preset) ? preset : 'selective',
    dark: normalizeSurface(theme, DARK_DEFAULTS),
    light: normalizeSurface(light, LIGHT_DEFAULTS),
  }
}

/**
 * Resolve which artwork file to paint.
 *
 * Order: an explicit `theme.image` (what the settings window stores when the user
 * picks a file) wins; then a derived file next to that image; then the bundled
 * artwork — the shipped derivation for the preset, falling back to the shipped
 * source so a missing derivation degrades to a working backdrop, never to none.
 *
 * @param theme - the raw `theme` settings block.
 * @param dirs - `{ appRoot, userArtworkDir }`.
 * @returns an absolute image path.
 */
function resolveBackgroundPath(theme, dirs = {}) {
  const appRoot = dirs.appRoot || process.cwd()
  const userArtworkDir = dirs.userArtworkDir || null
  const config = normalizeThemeConfig(theme)
  const bundledSource = path.join(appRoot, 'assets', 'background.jpg')
  const exists = (candidate) => {
    try {
      return Boolean(candidate) && fs.existsSync(candidate)
    } catch {
      return false
    }
  }

  /* A chosen picture never falls back to the bundled artwork — that would swap
     the picture behind the user's back; its own derivation or itself is all. */
  if (config.image) {
    const chosen = path.resolve(config.image)
    if (config.imagePreset === 'none') return chosen
    const derived = path.join(path.dirname(chosen), `background-${config.imagePreset}.jpg`)
    return exists(derived) ? derived : chosen
  }

  if (config.imagePreset === 'none') return bundledSource
  const shipped = path.join(appRoot, 'assets', `background-${config.imagePreset}.jpg`)
  if (exists(shipped)) return shipped
  /* Only if a shipped variant is missing does a locally derived one step in. */
  if (userArtworkDir) {
    const local = path.join(userArtworkDir, `background-${config.imagePreset}.jpg`)
    if (exists(local)) return local
  }
  return bundledSource
}

/**
 * Read the background image and inline it as a data URI.
 *
 * Inlining keeps the image out of every CSP argument: a `file://` subresource
 * is refused from an `http://127.0.0.1` page, and registering a custom scheme
 * would mean rewriting the server's headers. At ~360 KB the base64 form is
 * small enough to inject once per page load.
 *
 * @param imagePath - absolute path to a JPEG/PNG/WebP image.
 * @returns the data URI, or null when the file cannot be read.
 */
function loadBackgroundDataUri(imagePath) {
  if (!imagePath) return null
  try {
    const bytes = fs.readFileSync(imagePath)
    const extension = path.extname(imagePath).toLowerCase()
    const mime =
      extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.gif' ? 'image/gif' : 'image/jpeg'
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

/** Mix two `#rrggbb` colours; `weight` is the share of `b`. */
function mixHex(a, b, weight) {
  const parse = (hex) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim())
    return match ? Number.parseInt(match[1], 16) : null
  }
  const ca = parse(a)
  const cb = parse(b)
  if (ca === null || cb === null) return a
  const t = clamp(weight, 0, 1, 0.5)
  const channel = (shift) => Math.round(((ca >> shift) & 255) * (1 - t) + ((cb >> shift) & 255) * t)
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Build one appearance layer, scoped to the `data-dsh-dark` flag the page-side
 * bootstrap mirrors from the app's effective appearance. The two layers are
 * emitted together so an in-app appearance switch applies without a reload.
 *
 * @param mode - normalized palette for this appearance.
 * @param flag - `true` for the dark layer, `false` for the light one.
 * @param imageUri - inlined artwork, or null to keep a plain gradient.
 * @returns CSS text.
 */
function appearanceCss(mode, flag, imageUri) {
  const dark = flag === 'true'
  const ground = mode.colors.ground
  const scope = `html[data-dsh-dark="${flag}"]`
  const blur = `${mode.glass.blur}px`
  const sat = String(mode.glass.saturation)
  const glassFill = withAlpha(ground, mode.glass.opacity)
  const glassFillStrong = withAlpha(ground, Math.min(0.92, mode.glass.opacity + 0.3))
  /** The title row keeps a soft glass instead of an opaque slab so the artwork
   *  flows behind the header; legibility comes from the blur, not from black. */
  const headerInk = dark ? ground : '#FFFFFF'
  const headerFill = withAlpha(headerInk, dark ? 0.55 : 0.62)
  /** The header fades out downward instead of ending in a hard bar: the artwork
   *  keeps flowing behind it and no strip cuts across the top of the column. */
  const headerScrim = `linear-gradient(to bottom, ${headerFill} 0%, ${withAlpha(headerInk, 0)} 100%)`
  const hairline = dark ? 'rgba(252, 250, 242, 0.08)' : 'rgba(28, 28, 30, 0.09)'
  const panelFill = dark ? 'rgba(252, 250, 242, 0.05)' : 'rgba(28, 28, 30, 0.035)'
  const sidebarFill = dark ? ground : mixHex(ground, '#FFFFFF', 0.55)
  const brandInk = dark ? '#FCFAF2' : mode.colors.text
  /** A flat wash over the artwork, the equivalent of an image opacity. */
  const wash = withAlpha(dark ? ground : '#FFFFFF', Math.max(0, 1 - mode.imageOpacity))

  const fade = `linear-gradient(to bottom, ${mode.fadeStops
    .map(([percent, darkness]) => `${withAlpha(dark ? ground : '#FFFFFF', darkness)} ${percent}%`)
    .join(', ')})`

  const layers = [`linear-gradient(${wash}, ${wash})`, fade]
  const sizes = ['100% 100%', '100% 100%']
  const positions = ['center top', 'center top']
  const repeats = ['no-repeat', 'no-repeat']
  if (imageUri) {
    layers.push(`url("${imageUri}")`)
    sizes.push('cover')
    positions.push('center center')
    repeats.push('no-repeat')
  }

  return `
/* DeepSeek Harness desktop — ${dark ? 'dark' : 'light'} appearance layer (injected). */
${scope} {
  background-color: ${ground} !important;
  color-scheme: ${dark ? 'dark' : 'light'};
  /* Consumed by the sidebar zone cards so both layers share one glass recipe. */
  --dsh-glass-blur: ${blur};
  --dsh-glass-sat: ${sat};
  --dsh-glass-fill: ${glassFill};
  --dsh-glass-fill-strong: ${glassFillStrong};
  --dsh-glass-panel: ${panelFill};
  --dsh-dark-hairline: ${hairline};
  --dsh-dark-ground: ${ground};
  --dsh-dark-accent: ${mode.colors.accent};
}
/* The window ground stays flat; the artwork belongs to the conversation column,
   so #root and the frame stay transparent and the column paints the picture. */
${scope} body { background: transparent !important; }
${scope} #root,
${scope} [class*="_frame"] {
  background: transparent !important;
}

/* ---- the sidebar is a flat panel: no artwork, no gradient behind it ---- */
${scope} [class*="_sidebarCol"],
${scope} [data-slot="sidebar"] > *,
${scope} [class*="_handle"][data-side="sidebar"] {
  background-color: ${sidebarFill} !important;
  background-image: none !important;
}
${scope} [class*="_handle"][data-side="sidebar"] {
  border-right: 1px solid ${hairline} !important;
}

/* ---- the artwork and its fade live on the conversation column ---- */
${scope} [data-slot="main.conversation"] > * {
  background-color: transparent !important;
  background-image: ${layers.join(', ')} !important;
  background-size: ${sizes.join(', ')} !important;
  background-position: ${positions.join(', ')} !important;
  background-repeat: ${repeats.join(', ')} !important;
}

/* The composer seat is the app's own fade band under the composer. It fades to
   the APP's opaque background colour, so keeping any part of it stacks a second
   gradient over this layer's own and produces a visible step where the two
   disagree. Gradient stacking only ever multiplies opacity, so the seat is
   dropped entirely and the conversation gradient stays the single source of
   darkening. */
${scope} [class*="_composerSeat"] {
  background-image: none !important;
  background-color: transparent !important;
}

/* ---- empty header: no opaque strip over the artwork ---- */
${scope} [class*="_headerBlank"],
${scope} [class*="_headerBlank"]::before,
${scope} [class*="_headerBlank"]::after {
  background: transparent !important;
}

/* ---- frosted glass surfaces ---- */
${scope} [data-dsh-zone],
${scope} [data-slot="conversation.session.header"] > *,
${scope} [data-slot="conversation.composer.bar"] [class*="_card"],
${scope} [data-slot="conversation.input.dock"] > *,
${scope} [data-slot="conversation.input.dock"] [class*="_root"],
${scope} [data-slot="conversation.input.dock"] [class*="_bar"],
${scope} [data-slot="rightbar"] > *:not([aria-hidden="true"]),
${scope} [data-slot="rightbar.session"] > *:not([aria-hidden="true"]) {
  backdrop-filter: blur(${blur}) saturate(${sat}) !important;
  -webkit-backdrop-filter: blur(${blur}) saturate(${sat}) !important;
}
${scope} [data-slot="conversation.header"] > [class*="_header"]:not([class*="_headerBlank"]),
${scope} [data-slot="conversation.session.header"] > *,
${scope} [data-slot="conversation.session.header"] [class*="_header"],
${scope} [data-slot="conversation.session.header"] [class*="_titleRow"],
${scope} [data-slot="conversation.session.header"] [class*="_tabs"] {
  background-color: transparent !important;
  background-image: ${headerScrim} !important;
}
${scope} [data-slot="conversation.session.header"] > *:not([class*="_headerBlank"]) {
  border-bottom: 1px solid ${hairline} !important;
}
/* The composer keeps its own shape; only its surface becomes glass. The wrapper
   around the card (_root) is a little larger than the card, so filling or
   outlining it would show a rim — it is left alone. */
${scope} [data-slot="conversation.composer.bar"] [class*="_card"],
${scope} [data-slot="conversation.input.dock"] > *,
${scope} [data-slot="conversation.input.dock"] [class*="_root"],
${scope} [data-slot="conversation.input.dock"] [class*="_bar"] {
  background-color: ${glassFillStrong} !important;
  border: 1px solid ${hairline} !important;
}
${scope} [data-slot="rightbar"] > *:not([aria-hidden="true"]),
${scope} [data-slot="rightbar.session"] > *:not([aria-hidden="true"]) {
  background-color: ${glassFillStrong} !important;
  border-left: 1px solid ${hairline} !important;
}

/* ---- brand + version badge: ink only, never a grey sticker ---- */
${scope} [data-slot="sidebar.brand.mark"] svg,
${scope} [data-slot="sidebar.brand.mark"] svg path {
  filter: none !important;
  fill: ${brandInk} !important;
  color: ${brandInk} !important;
}
${scope} [class*="_copyVersion"],
${scope} [class*="_copyVersion"] * {
  background: transparent !important;
  color: ${dark ? brandInk : mode.colors.text} !important;
  border-color: ${hairline} !important;
}
`
}

/**
 * Build the appearance stylesheets for both palettes.
 *
 * @param theme - the raw `theme` settings block.
 * @param imageUri - the inlined background image, or null to use a plain gradient.
 * @returns CSS text covering the light and dark layers.
 */
function buildThemeCss(theme, imageUri) {
  const c = normalizeThemeConfig(theme)
  return `${appearanceCss(c.dark, 'true', imageUri)}
${appearanceCss(c.light, 'false', imageUri)}`
}

module.exports = {
  APPEARANCES,
  DARK_DEFAULTS,
  DEFAULT_FADE_STOPS,
  IMAGE_PRESETS,
  LIGHT_DEFAULTS,
  NIPPON_COLORS,
  buildThemeCss,
  appearanceCss,
  mixHex,
  loadBackgroundDataUri,
  normalizeFadeStops,
  normalizeThemeConfig,
  resolveBackgroundPath,
  withAlpha,
}
