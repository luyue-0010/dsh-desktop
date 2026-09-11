'use strict'

/**
 * The desktop settings window: its IPC surface and its lifecycle.
 *
 * Settings live in the same `desktop-settings.json` the app already reads, so a
 * change made here is applied by re-injecting into the wrapped GUI — the window
 * never edits the app's own configuration.
 *
 * @module dsh-desktop/settings-window
 */

const { BrowserWindow, app, dialog, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const { DEFAULT_SETTINGS, readSettings, writeSettings } = require('./settings')
const { PRESET_IDS, deriveArtworkFile } = require('./artwork')
const { loadBackgroundDataUri, normalizeThemeConfig, resolveBackgroundPath } = require('./theme')

let settingsWindow = null

/** The bundled artwork directory, which is read-only inside a packaged app. */
let appAssetsDir = null
/** Where a user-picked source image and its derivations are stored. */
let userArtworkDir = null
/** Called after every settings write so the shell can re-apply them. */
let onApplied = () => {}

/** Directory layout this module works against. */
function dirs() {
  return { appRoot: path.dirname(appAssetsDir), userArtworkDir }
}

/** Turn an absolute path into a data URI for previews, or null. */
function previewUri(filePath) {
  return filePath ? loadBackgroundDataUri(filePath) : null
}

/** Register every settings-related IPC handler. Call once, after app ready. */
function registerSettingsIpc({ appRoot, userDataDir, apply }) {
  appAssetsDir = path.join(appRoot, 'assets')
  userArtworkDir = path.join(userDataDir, 'artwork')
  onApplied = typeof apply === 'function' ? apply : () => {}

  ipcMain.handle('desktop:get-settings', () => readSettings(userDataDir))

  ipcMain.handle('desktop:set-settings', (_event, patch) => {
    const next = writeSettings(userDataDir, patch && typeof patch === 'object' ? patch : {})
    onApplied()
    return next
  })

  ipcMain.handle('desktop:reset-settings', () => {
    writeSettings(userDataDir, DEFAULT_SETTINGS)
    onApplied()
    return readSettings(userDataDir)
  })

  /* Copy the chosen picture next to the settings, so the shell never depends on
     a file the user may later move, and drop stale derivations of the old one. */
  ipcMain.handle('desktop:pick-background-image', async () => {
    const result = await dialog.showOpenDialog(settingsWindow, {
      title: '选择背景图',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    })
    const picked = result.canceled ? undefined : result.filePaths[0]
    if (!picked) return null
    fs.mkdirSync(userArtworkDir, { recursive: true })
    const extension = (path.extname(picked) || '.jpg').toLowerCase()
    const stored = path.join(userArtworkDir, `source${extension}`)
    fs.copyFileSync(picked, stored)
    for (const preset of PRESET_IDS) {
      const stale = path.join(userArtworkDir, `background-${preset}.jpg`)
      if (fs.existsSync(stale)) fs.rmSync(stale, { force: true })
    }
    return { path: stored, name: path.basename(picked), dataUri: previewUri(stored) }
  })

  /* Drop the user's picture and everything derived from it, so "use the bundled
     one" really returns to the shipped artwork. */
  ipcMain.handle('desktop:clear-background-image', () => {
    try {
      if (fs.existsSync(userArtworkDir)) fs.rmSync(userArtworkDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    return true
  })

  ipcMain.handle('desktop:derive-artwork', async (_event, payload) => {
    const preset = PRESET_IDS.includes(payload && payload.preset) ? payload.preset : 'selective'
    const settings = readSettings(userDataDir)
    const chosen = (payload && payload.sourcePath) || settings.theme.image || path.join(appAssetsDir, 'background.jpg')
    const source = path.resolve(chosen)
    if (!fs.existsSync(source)) return { ok: false, error: `图片不存在：${source}` }
    /* A shipped source derives into the writable user directory, so a packaged
       (read-only) app can still produce new variants. */
    const insideApp = source.startsWith(appAssetsDir)
    const outputDir = insideApp ? userArtworkDir : path.dirname(source)
    try {
      const result = await deriveArtworkFile({ sourcePath: source, preset, outputDir })
      return { ok: true, preset, path: result.path, width: result.width, height: result.height, dataUri: result.dataUri }
    } catch (error) {
      return { ok: false, error: (error && error.message) || String(error) }
    }
  })

  /* What the preview should show: the file the shell would actually paint, for a
     given preset, without changing any settings. */
  ipcMain.handle('desktop:artwork-preview', (_event, payload) => {
    const settings = readSettings(userDataDir)
    const theme = { ...settings.theme }
    if (payload && PRESET_IDS.includes(payload.preset)) theme.imagePreset = payload.preset
    const resolved = resolveBackgroundPath(theme, dirs())
    return {
      preset: normalizeThemeConfig(theme).imagePreset,
      path: resolved,
      bundled: resolved.startsWith(appAssetsDir),
      source: theme.image || null,
      dataUri: previewUri(resolved),
    }
  })

  ipcMain.handle('desktop:close-settings', () => {
    closeSettingsWindow()
    return true
  })
}

/** Open (or focus) the settings window. */
function openSettingsWindow({ preload, rendererDir }) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }
  settingsWindow = new BrowserWindow({
    width: 1040,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: '桌面端设置',
    backgroundColor: '#0B1013',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  settingsWindow.once('ready-to-show', () => settingsWindow.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  settingsWindow.loadFile(path.join(rendererDir, 'settings.html'))
  return settingsWindow
}

/** Close the settings window when it is open. */
function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
}

module.exports = { closeSettingsWindow, openSettingsWindow, registerSettingsIpc }
