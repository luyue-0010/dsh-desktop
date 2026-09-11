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
function normalizeFadeStops(stops) {
  const list = Array.isArray(stops) ? stops : []
  const parsed = list
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([percent, darkness]) => [clamp(percent, 0, 100, 0), clamp(darkness, 0, 1, 0)])
  if (parsed.length < 2) return DEFAULT_FADE_STOPS
  parsed.sort((a, b) => a[0] - b[0])
  if (parsed[0][0] > 0) parsed.unshift([0, parsed[0][1]])
  if (parsed[parsed.length - 1][0] < 100) parsed.push([100, 1])
  return parsed
}

/** The backdrop presets the derivation script can produce. */
const IMAGE_PRESETS = ['selective', 'mono', 'blackgold', 'none']

/** Normalize a settings `theme` block into a complete, validated config. */
function normalizeThemeConfig(theme = {}) {
  const glass = theme.glass || {}
  const colors = theme.colors || {}
  const preset = typeof theme.imagePreset === 'string' ? theme.imagePreset : 'selective'
  return {
    enabled: theme.enabled !== false,
    forceDark: theme.forceDark !== false,
    image: typeof theme.image === 'string' ? theme.image : '',
    /** Which derived artwork to use: selective (keep the hair and eyes), mono,
     * blackgold, or none for the untouched source. */
    imagePreset: IMAGE_PRESETS.includes(preset) ? preset : 'selective',
    imageOpacity: clamp(theme.imageOpacity, 0.05, 1, 0.92),
    /** Top-to-bottom darkening of the conversation column. */
    fadeStops: normalizeFadeStops(theme.fadeStops),
    glass: {
      blur: clamp(glass.blur, 0, 40, 18),
      saturation: clamp(glass.saturation, 1, 2.5, 1.25),
      opacity: clamp(glass.opacity, 0, 1, 0.46),
    },
    colors: {
      ground: colors.ground || NIPPON_COLORS.kurotsurubami.hex,
      text: colors.text || NIPPON_COLORS.shironeri.hex,
      accent: colors.accent || NIPPON_COLORS.kurenai.hex,
    },
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

/**
 * Build the dark appearance stylesheet.
 *
 * Every rule is scoped to `html[data-dsh-dark="true"]`, the flag the page-side
 * bootstrap sets from `prefers-color-scheme`, so a user who picks the light
 * appearance in the app gets the untouched stock UI.
 *
 * @param theme - the raw `theme` settings block.
 * @param imageUri - the inlined background image, or null to use a plain gradient.
 * @returns CSS text.
 */
function buildThemeCss(theme, imageUri) {
  const c = normalizeThemeConfig(theme)
  const ground = c.colors.ground
  const scope = 'html[data-dsh-dark="true"]'
  const blur = `${c.glass.blur}px`
  const sat = String(c.glass.saturation)
  const glassFill = withAlpha(ground, c.glass.opacity)
  const glassFillStrong = withAlpha(ground, Math.min(0.92, c.glass.opacity + 0.3))
  const hairline = `rgba(252, 250, 242, 0.08)`
  /** Panels that sit on the flat dark sidebar read as translucent white, not as more ground. */
  const panelFill = `rgba(252, 250, 242, 0.05)`
  /** A flat wash over the artwork, the equivalent of an image opacity. */
  const wash = withAlpha(ground, Math.max(0, 1 - c.imageOpacity))

  /* The artwork and its fade live on the conversation column rather than on a
     fixed full-window layer: the column is where the picture is actually
     visible (the sidebar is opaque), so anchoring to it keeps the subject
     centred in what the user sees and makes it scale with that area as the
     window changes. The fade is emitted straight from the configured anchors. */
  const fade = `linear-gradient(to bottom, ${c.fadeStops
    .map(([percent, darkness]) => `${withAlpha(ground, darkness)} ${percent}%`)
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
/* DeepSeek Harness desktop — dark appearance layer (injected). */
${scope} {
  background-color: ${ground} !important;
  color-scheme: dark;
  /* Consumed by the sidebar zone cards so both layers share one glass recipe. */
  --dsh-glass-blur: ${blur};
  --dsh-glass-sat: ${sat};
  --dsh-glass-fill: ${glassFill};
  --dsh-glass-fill-strong: ${glassFillStrong};
  --dsh-glass-panel: ${panelFill};
  --dsh-dark-hairline: ${hairline};
  --dsh-dark-ground: ${ground};
  --dsh-dark-accent: ${c.colors.accent};
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
  background-color: ${ground} !important;
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

/* ---- frosted glass surfaces ---- */
${scope} [data-dsh-zone],
${scope} [data-slot="conversation.session.header"] > *,
${scope} [data-slot="conversation.composer.bar"] [class*="_card"],
${scope} [data-slot="conversation.input.dock"] > *,
${scope} [data-slot="conversation.input.dock"] [class*="_root"],
${scope} [data-slot="conversation.input.dock"] [class*="_bar"],
${scope} [data-slot="rightbar"] > *,
${scope} [data-slot="rightbar.session"] > * {
  backdrop-filter: blur(${blur}) saturate(${sat}) !important;
  -webkit-backdrop-filter: blur(${blur}) saturate(${sat}) !important;
}
${scope} [data-slot="conversation.session.header"] > * {
  background-color: ${glassFill} !important;
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
${scope} [data-slot="rightbar"] > *,
${scope} [data-slot="rightbar.session"] > * {
  background-color: ${glassFillStrong} !important;
  border-left: 1px solid ${hairline} !important;
}
`
}

module.exports = {
  DEFAULT_FADE_STOPS,
  IMAGE_PRESETS,
  NIPPON_COLORS,
  buildThemeCss,
  loadBackgroundDataUri,
  normalizeFadeStops,
  normalizeThemeConfig,
  resolveBackgroundPath,
  withAlpha,
}
