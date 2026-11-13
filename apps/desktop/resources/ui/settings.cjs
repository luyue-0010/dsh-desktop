'use strict'

/**
 * Desktop-shell settings, stored as `desktop-settings.json` in the Electron
 * userData directory (never inside the dsh tree, so the wrapped web app's own
 * configuration is left untouched).
 *
 * @module dsh-desktop/settings
 */

const fs = require('node:fs')
const path = require('node:path')

/** The shipped defaults; a missing or partial file is merged onto these. */
const DEFAULT_SETTINGS = {
  /** Left-sidebar three-zone restyle. */
  zones: {
    /** Master switch for the injected zone styling. */
    enabled: true,
    /** Japanese traditional colours from the nippon-color chart: one per zone
     * card plus the single warm accent used for the selected things. */
    colors: {
      workspace: '#33A6B8',
      addFolder: '#FFB11B',
      sessions: '#86A697',
      accent: '#CB1B45',
    },
    /** Thickness of each card's bottom accent, in pixels. */
    accentWidth: 2,
    /** Corner radius of the zone cards. */
    radius: 14,
    /** Vertical gap between the zone cards. */
    gap: 14,
    /** Inner padding of the zone cards. */
    padding: 8,
    /** Zone titles and inline copy; an empty string falls back to a built-in default. */
    labels: {
      addFolder: '添加文件夹',
      sessions: '会话区',
      workspace: '',
      emptyWorkspaces: '还没有工作区，点下面的「添加文件夹」加一个',
      newSessionIn: '在“{name}”中新建会话',
    },
    /** Accent the workspace / session rows to match their zone color. */
    rowAccents: true,
  },
  /** Appearance layer: background artwork, gradient, and frosted glass. */
  theme: {
    /** Master switch for the appearance layer; off keeps the app's stock UI. */
    enabled: true,
    /** `light`, `dark`, or `system`: which palette the shell and the wrapped app start in. */
    appearance: 'light',
    /** Kept for older settings files; the appearance above is the authority. */
    forceDark: false,
    /** Background image; empty uses the bundled `assets/background.jpg`. */
    image: '',
    /** Which derived artwork to use: `selective` keeps only the hair's blue and
     * the eyes' crimson, `mono` is straight black and white, `blackgold` adds a
     * warm cast, `none` keeps the untouched source. Generate with `npm run assets`. */
    imagePreset: 'selective',
    /** Strength of the artwork behind the fade. */
    imageOpacity: 0.92,
    /** Darkening profile down the conversation column, as `[percent, darkness]`:
     * light at the top, 44% at half height, 75% at 70%, fully dark at the bottom. */
    fadeStops: [
      [0, 0.12],
      [50, 0.44],
      [70, 0.75],
      [100, 1],
    ],
    /** Frosted-glass recipe shared by the zone cards and the app surfaces. */
    glass: {
      blur: 18,
      saturation: 1.25,
      opacity: 0.46,
    },
    colors: {
      /** 黒橡 — the dark ground. */
      ground: '#0B1013',
      /** 白練 — primary text tint used for hairlines. */
      text: '#FCFAF2',
      /** 紅 — the selection accent. */
      accent: '#CB1B45',
    },
    /** Light appearance: warm paper ground, ink text, a heavy white wash over the artwork. */
    light: {
      /** Sheet ground; the sidebar sits a touch lighter. */
      colors: {
        ground: '#F6F4EF',
        text: '#1C1C1E',
        accent: '#CB1B45',
      },
      /** Share of the artwork left visible after the white wash. */
      imageOpacity: 0.34,
      /** White wash down the conversation column, as `[percent, opacity]`. */
      fadeStops: [
        [0, 0.18],
        [45, 0.62],
        [72, 0.86],
        [100, 0.97],
      ],
      glass: {
        blur: 20,
        saturation: 1.1,
        opacity: 0.62,
      },
    },
  },
  /** Window geometry, persisted on resize/move. */
  window: {
    width: 1440,
    height: 920,
    x: null,
    y: null,
    maximized: false,
    alwaysOnTop: false,
  },
  /** Desktop-shell UI behaviour. */
  ui: {
    /** Hide the main window instead of quitting when it is closed. */
    closeToTray: true,
    /** Whether the one-time background-running notice has been shown. */
    backgroundNoticeShown: false,
  },
  /** How the wrapped `dsh web` server is launched. */
  dsh: {
    /** Explicit path to `@deepseek-ai/dsh/lib/bin.js`, a dsh package dir, or a dsh executable. */
    command: '',
    /** Explicit node executable used to run the dsh CLI; empty auto-detects. */
    nodePath: '',
    /** Extra arguments appended to `dsh web --no-open --port <port>`. */
    extraArgs: [],
    /** Milliseconds to wait for the `dsh web:` readiness line. */
    startupTimeoutMs: 120000,
    /** Restart the local server automatically after an unexpected exit. */
    autoRestart: true,
  },
}

/** True for plain objects, so arrays and nulls stay leaf values. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recursively merge `patch` onto `base`, returning a new object. */
function merge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base }
  if (!isPlainObject(patch)) return out
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? merge(out[key], value) : value
  }
  return out
}

/** Absolute path of the settings file for one userData directory. */
function settingsFile(userDataDir) {
  return path.join(userDataDir, 'desktop-settings.json')
}

/** Palettes shipped by earlier releases, superseded by the nippon-color set. */
const LEGACY_ZONE_PALETTES = [
  { workspace: '#4D6BFE', addFolder: '#F2A03D', sessions: '#23B26D' },
  { workspace: '#94A3C4', addFolder: '#C9AF8E', sessions: '#8FB3A0' },
]

/** True when a stored `zones.colors` block is exactly a superseded palette. */
function isLegacyZonePalette(colors) {
  if (!isPlainObject(colors)) return false
  return LEGACY_ZONE_PALETTES.some((legacy) => Object.entries(legacy).every(([key, value]) => colors[key] === value))
}

/**
 * Read the merged settings for this installation.
 *
 * A stored palette that still equals a superseded release's colours is dropped so
 * the current nippon-color defaults apply; any palette the user edited by hand is
 * preserved untouched.
 *
 * @param userDataDir - Electron userData directory.
 * @returns the effective settings; defaults when the file is absent or invalid.
 */
function readSettings(userDataDir) {
  let stored = {}
  try {
    stored = JSON.parse(fs.readFileSync(settingsFile(userDataDir), 'utf8'))
  } catch {
    stored = {}
  }
  if (isPlainObject(stored.zones) && isLegacyZonePalette(stored.zones.colors)) {
    delete stored.zones.colors
  }
  return merge(DEFAULT_SETTINGS, stored)
}

/**
 * Merge a partial patch into the on-disk settings file.
 * @param userDataDir - Electron userData directory.
 * @param patch - partial settings to persist.
 * @returns the new effective settings.
 */
function writeSettings(userDataDir, patch) {
  const next = merge(readSettings(userDataDir), patch)
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(settingsFile(userDataDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch {
    /* a read-only userData dir must not break the app */
  }
  return next
}

module.exports = { DEFAULT_SETTINGS, readSettings, writeSettings, settingsFile, merge }
