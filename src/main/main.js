'use strict'

/**
 * DeepSeek Harness Desktop — Electron shell around the `dsh web` GUI.
 *
 * Responsibilities, in order:
 *   1. boot the real `dsh web` server on a free loopback port,
 *   2. load its authenticated URL into a BrowserWindow (so every web feature is
 *      the web app's own, unmodified),
 *   3. inject the left-sidebar three-zone restyle,
 *   4. provide desktop-only affordances: menus, external links, downloads,
 *      window state, and clean server shutdown.
 *
 * @module dsh-desktop/main
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const { readSettings, writeSettings, settingsFile } = require('./settings')
const { DshServer, buildLauncher, findDshInstall } = require('./dsh')
const { buildZoneOptions, buildZoneScript } = require('./zones')
const { buildThemeCss, loadBackgroundDataUri, normalizeThemeConfig, resolveBackgroundPath } = require('./theme')
const { openSettingsWindow, registerSettingsIpc } = require('./settings-window')

/** The desktop shell's own directory (works from source and from a packaged app). */
const APP_ROOT = path.resolve(__dirname, '..', '..')
const RENDERER_DIR = path.join(APP_ROOT, 'src', 'renderer')
const PRELOAD = path.join(APP_ROOT, 'src', 'preload', 'preload.js')

/** A confined sandbox cannot host Chromium; keep the override for such runs. */
if (process.env.DSH_DESKTOP_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.DSH_DESKTOP_USER_DATA))
}

/** Window state, server handle, and the status the renderers subscribe to. */
let mainWindow = null
let server = null
let appOrigin = null
let logPath = null
let restarting = false
let quitting = false
let boundsTimer = null
let lastStatus = { phase: 'idle', message: '', url: null, port: null }

/** Append one line to the desktop log and stdout. */
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  process.stdout.write(`${line}\n`)
  if (!logPath) return
  try {
    fs.appendFileSync(logPath, `${line}\n`, 'utf8')
  } catch {
    /* logging must never be fatal */
  }
}

/** Merge and broadcast the current boot status. */
function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:status', lastStatus)
  }
}

/** True when a URL belongs to the wrapped server (token URL and root alike). */
function isAppUrl(target) {
  if (!target) return false
  try {
    const url = new URL(target)
    if (!/^https?:$/.test(url.protocol)) return false
    if (appOrigin) return url.origin === appOrigin
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  } catch {
    return false
  }
}

/** Persist window geometry so the next launch opens where the user left it. */
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const settings = readSettings(app.getPath('userData'))
  const maximized = mainWindow.isMaximized()
  const bounds = maximized ? settings.window : mainWindow.getNormalBounds()
  writeSettings(app.getPath('userData'), {
    window: {
      width: bounds.width,
      height: bounds.height,
      x: maximized ? settings.window.x : bounds.x,
      y: maximized ? settings.window.y : bounds.y,
      maximized,
    },
  })
}

/** Debounced geometry persistence for resize/move storms. */
function scheduleWindowStateSave() {
  if (boundsTimer) clearTimeout(boundsTimer)
  boundsTimer = setTimeout(saveWindowState, 500)
}

/** Create the single application window and load the local splash page. */
function createWindow() {
  const settings = readSettings(app.getPath('userData'))
  const { window: geometry } = settings

  mainWindow = new BrowserWindow({
    width: geometry.width,
    height: geometry.height,
    x: typeof geometry.x === 'number' ? geometry.x : undefined,
    y: typeof geometry.y === 'number' ? geometry.y : undefined,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'DeepSeek Harness',
    backgroundColor: '#F9FAFB',
    alwaysOnTop: Boolean(geometry.alwaysOnTop),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  })

  // The wrapped GUI keeps its own document title; the window keeps the product name.
  mainWindow.on('page-title-updated', (event) => event.preventDefault())
  mainWindow.once('ready-to-show', () => {
    if (geometry.maximized) mainWindow.maximize()
    mainWindow.show()
  })
  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  wireNavigationPolicy()
  mainWindow.loadFile(path.join(RENDERER_DIR, 'loading.html'))
}

/** Keep the window inside the wrapped app; send everything else to the OS. */
function wireNavigationPolicy() {
  const contents = mainWindow.webContents

  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      }
    }
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url)
  })

  contents.on('did-finish-load', () => {
    const current = contents.getURL()
    if (isAppUrl(current)) injectZones()
  })
}

/**
 * Apply the configured appearance to the OS layer. Because the wrapped GUI is
 * forced to dark through `prefers-color-scheme`, every one of its own dark tokens
 * applies — labels, borders and states included — instead of this shell
 * repainting them. A user who picks “浅色” inside the app still wins.
 */
function applyAppearance(settings) {
  const theme = normalizeThemeConfig(settings.theme)
  nativeTheme.themeSource = theme.enabled && theme.forceDark ? 'dark' : 'system'
  return theme
}

/** Apply the left-sidebar three-zone restyle and the dark appearance layer. */
async function injectZones() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const settings = readSettings(app.getPath('userData'))
  const theme = applyAppearance(settings)

  const imagePath = resolveBackgroundPath(settings.theme, {
    appRoot: APP_ROOT,
    userArtworkDir: path.join(app.getPath('userData'), 'artwork'),
  })
  const imageUri = theme.enabled ? loadBackgroundDataUri(imagePath) : null
  if (theme.enabled) log(`theme: artwork ${theme.imagePreset} -> ${imagePath}${imageUri ? '' : ' (unreadable)'}`)

  const options = buildZoneOptions(settings.zones, {
    enabled: theme.enabled,
    css: theme.enabled ? buildThemeCss(settings.theme, imageUri) : '',
  })
  try {
    const report = await mainWindow.webContents.executeJavaScript(buildZoneScript(options), true)
    log(
      `zones: ${JSON.stringify(report)} theme=${theme.enabled ? 'on' : 'off'} ` +
        `image=${imageUri ? `${Math.round(imageUri.length / 1024)}KB` : 'none'} appearance=${nativeTheme.themeSource}`,
    )
  } catch (error) {
    log(`zones: injection failed: ${error && error.message}`)
  }
}

/** Turn a known server failure signature into actionable advice. */
function failureAdvice(logTail) {
  if (/expose-internals is required for HMR/i.test(logTail)) {
    return (
      '\n\n提示：dsh web 需要一个真正的 Node.js 运行时（其热重载插件依赖 --expose-internals）。' +
      '请在 desktop-settings.json 的 dsh.nodePath 里指定 node.exe 的完整路径。'
    )
  }
  if (/\bENOENT\b/.test(logTail)) {
    return '\n\n提示：没有找到 node 可执行文件，请安装 Node.js 或在 dsh.nodePath 里指定它的完整路径。'
  }
  return ''
}

/** Show the local failure screen with the server log tail. */
function showFailure(title, message) {
  setStatus({ phase: 'failed', message: `${title}：${message}` })
  log(`failure: ${title}: ${message}`)
  appOrigin = null
  if (!mainWindow || mainWindow.isDestroyed()) return
  const tail = server ? server.tail(14) : ''
  mainWindow
    .loadFile(path.join(RENDERER_DIR, 'error.html'), {
      query: { title, message: `${message}${failureAdvice(tail)}`, log: tail },
    })
    .catch((error) => log(`failure page: ${error && error.message}`))
}

/** Boot the wrapped server and hand its URL to the window. */
async function boot() {
  const settings = readSettings(app.getPath('userData'))
  setStatus({ phase: 'starting', message: '正在启动本地 dsh web 服务…' })

  const install = findDshInstall(APP_ROOT, settings.dsh.command)
  if (!install) {
    showFailure(
      '未找到 dsh',
      '没有在本机找到 @deepseek-ai/dsh。请先执行一次 “npx @deepseek-ai/dsh web”，' +
        '或在 desktop-settings.json 里用 dsh.command 指定 dsh 的 bin.js 路径。',
    )
    return
  }

  const launcher = buildLauncher(install, settings.dsh.nodePath)
  if (!launcher) {
    showFailure('无法启动 dsh', '没有找到可用的 Node 运行时来执行 dsh CLI。')
    return
  }
  log(`using dsh ${install.version} (${install.source}) -> ${install.binPath || install.command}`)
  log(`node runtime: ${launcher.node || 'direct command'}`)

  server = new DshServer({
    launcher,
    extraArgs: Array.isArray(settings.dsh.extraArgs) ? settings.dsh.extraArgs : [],
    timeoutMs: Number(settings.dsh.startupTimeoutMs) || 120000,
    onLog: (line) => log(`dsh | ${line}`),
    onExit: (code, signal) => {
      if (quitting || restarting) return
      showFailure('本地服务已退出', `dsh web 结束运行（code ${code}${signal ? `, signal ${signal}` : ''}）。`)
    },
  })

  try {
    const info = await server.start()
    appOrigin = new URL(info.url).origin
    log(`dsh web ready on port ${info.port} (pid ${server.child ? server.child.pid : 'unknown'})`)
    setStatus({ phase: 'running', message: '已就绪', url: info.url, port: info.port })
    await mainWindow.loadURL(info.url)
  } catch (error) {
    showFailure('启动 dsh web 失败', (error && error.message) || String(error))
  }
}

/** Restart the wrapped server in place (used by the failure screen and the menu). */
async function restartServer() {
  if (restarting) return false
  restarting = true
  try {
    if (server) {
      await server.stop()
      server = null
    }
    await boot()
    return true
  } catch (error) {
    showFailure('重启失败', (error && error.message) || String(error))
    return false
  } finally {
    restarting = false
  }
}

/** Click the web app's own “new session” control. */
function clickNewSession() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const script = `(() => {
    const el = document.querySelector('[class*="_newSession"]')
    if (!el) return false
    el.click()
    return true
  })()`
  mainWindow.webContents.executeJavaScript(script, true).catch(() => {})
}

/** The application menu; every entry maps to a real desktop affordance. */
function buildMenu() {
  const userData = app.getPath('userData')
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建会话', accelerator: 'CmdOrCtrl+N', click: clickNewSession },
        { type: 'separator' },
        {
          label: '在浏览器中打开',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            if (lastStatus.url) shell.openExternal(lastStatus.url)
          },
        },
        { label: '重启本地服务', accelerator: 'CmdOrCtrl+Shift+T', click: () => restartServer() },
        { type: 'separator' },
        {
          label: '打开 DSH_HOME 目录',
          click: () => shell.openPath(process.env.DSH_HOME || path.join(app.getPath('home'), '.dsh')),
        },
        { label: '打开桌面端配置目录', click: () => shell.openPath(userData) },
        { label: '编辑桌面端配置', click: () => shell.openPath(settingsFile(userData)) },
        { label: '查看运行日志', click: () => shell.openPath(logPath || userData) },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '设置',
      submenu: [
        {
          label: '桌面端设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettingsWindow({ preload: PRELOAD, rendererDir: RENDERER_DIR }),
        },
        { type: 'separator' },
        { label: '打开桌面端配置目录', click: () => shell.openPath(userData) },
        { label: '查看运行日志', click: () => shell.openPath(logPath || userData) },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.webContents.reload() },
        {
          label: '强制重新加载',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        {
          label: '窗口置顶',
          type: 'checkbox',
          checked: Boolean(readSettings(app.getPath('userData')).window.alwaysOnTop),
          click: (item) => {
            if (!mainWindow) return
            mainWindow.setAlwaysOnTop(item.checked)
            writeSettings(app.getPath('userData'), { window: { alwaysOnTop: item.checked } })
          },
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 DeepSeek Harness 桌面端',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: 'DeepSeek Harness 桌面端',
              detail: [
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
                `本地服务：${lastStatus.url || '未启动'}`,
                `桌面端配置：${settingsFile(app.getPath('userData'))}`,
                '',
                '分区底边色取自日本传统色：工作区 = 浅葱，添加文件夹 = 山吹，会话区 = 錆青磁，选中态 = 紅。',
                '视觉来源：nippon-color（ssshooter.github.io/nippon-color）。',
              ].join('\n'),
              buttons: ['好'],
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** IPC surface exposed to the local pages through the preload bridge. */
function wireIpc() {
  ipcMain.handle('desktop:get-status', () => lastStatus)
  ipcMain.handle('desktop:restart-server', () => restartServer())
  /* Settings read/write live in the settings-window module, which also re-applies
     them here through its `apply` hook. */
  ipcMain.handle('desktop:open-in-browser', () => {
    if (lastStatus.url) shell.openExternal(lastStatus.url)
    return Boolean(lastStatus.url)
  })
  ipcMain.handle('desktop:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:|^mailto:/.test(url)) shell.openExternal(url)
    return true
  })
  ipcMain.handle('desktop:open-path', (_event, target) => {
    const allowed = [app.getPath('userData'), process.env.DSH_HOME || path.join(app.getPath('home'), '.dsh'), logPath]
    const wanted = path.resolve(String(target || ''))
    if (!allowed.some((entry) => entry && path.resolve(entry) === wanted)) return false
    shell.openPath(wanted)
    return true
  })
}

/** Downloads and permission prompts for the loopback app origin. */
function wireSession() {
  const defaultSession = session.defaultSession

  defaultSession.on('will-download', (event, item) => {
    const suggested = path.join(app.getPath('downloads'), item.getFilename())
    const target = dialog.showSaveDialogSync(mainWindow, { title: '保存文件', defaultPath: suggested })
    if (target) item.setSavePath(target)
    else item.cancel()
  })

  const allowed = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
    'media',
    'pointerLock',
    'downloads',
  ])

  defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed.has(permission) && isAppUrl(contents.getURL()))
  })
  defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return allowed.has(permission) && isAppUrl(requestingOrigin)
  })
}

/** Single instance: a second launch focuses the running window. */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.deepseek.dsh.desktop')
    logPath = path.join(app.getPath('userData'), 'desktop.log')
    log(`--- desktop shell starting (pid ${process.pid}, root ${APP_ROOT}, packaged ${app.isPackaged}) ---`)

    // Appearance first: the very first paint must already be dark.
    applyAppearance(readSettings(app.getPath('userData')))

    createWindow()
    buildMenu()
    wireIpc()
    wireSession()
    registerSettingsIpc({
      appRoot: APP_ROOT,
      userDataDir: app.getPath('userData'),
      apply: () => injectZones(),
    })
    await boot()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        boot()
      }
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    saveWindowState()
    const finish = () => app.exit(0)
    if (server) {
      log('stopping dsh web …')
      server.stop().then(finish, finish)
    } else {
      finish()
    }
  })
}
