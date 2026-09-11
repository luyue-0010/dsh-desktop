'use strict'

/**
 * Locates a `dsh` installation and owns the wrapped `dsh web` child process.
 *
 * The desktop shell never reimplements the web GUI: it boots the real CLI
 * (`dsh web --no-open --port <port>`), waits for the authenticated `dsh web:`
 * readiness line, and then hands that URL to the BrowserWindow. Every web
 * feature therefore comes from the same code path a browser would use.
 *
 * @module dsh-desktop/dsh
 */

const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

/** The readiness line the web app prints once its Loader tree has settled. */
const URL_RE = /dsh web:\s*(https?:\/\/\S+)/i

/** Compare two dotted versions, newest first; non-numeric parts sort lowest. */
function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/)
  const pb = String(b).split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i]
    const y = pb[i]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx) return 1
    if (ny) return -1
    return x < y ? -1 : 1
  }
  return 0
}

/** Candidate `node_modules` directories that may hold `@deepseek-ai/dsh`. */
function candidateModuleRoots(appRoot) {
  const roots = new Set()
  const push = (value) => {
    if (value) roots.add(path.resolve(value))
  }
  const home = os.homedir()
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')

  // 1. installed next to the desktop shell (repo checkout or packaged app)
  push(path.join(appRoot, 'node_modules'))
  if (process.resourcesPath) push(path.join(process.resourcesPath, 'node_modules'))
  if (process.resourcesPath) push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'))

  // 2. npx caches, which is where `npx @deepseek-ai/dsh` lands
  for (const cache of [path.join(localAppData, 'npm-cache'), path.join(home, '.npm')]) {
    const npx = path.join(cache, '_npx')
    let entries = []
    try {
      entries = fs.readdirSync(npx, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) push(path.join(npx, entry.name, 'node_modules'))
    }
  }

  // 3. global installs
  const globalRoots =
    process.platform === 'win32'
      ? [path.join(appData, 'npm', 'node_modules'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules')]
      : ['/usr/local/lib/node_modules', '/usr/lib/node_modules', path.join(home, '.npm-global', 'lib', 'node_modules'), '/opt/homebrew/lib/node_modules']
  for (const root of globalRoots) push(root)

  return [...roots]
}

/** Describe one `@deepseek-ai/dsh` package directory, or null when it is not one. */
function inspectPackage(packageDir) {
  const binPath = path.join(packageDir, 'lib', 'bin.js')
  let stat
  try {
    stat = fs.statSync(binPath)
  } catch {
    return null
  }
  let manifest = {}
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  } catch {
    /* a package without a readable manifest still has a usable bin */
  }
  if (manifest.name && manifest.name !== '@deepseek-ai/dsh') return null
  return {
    kind: 'script',
    binPath,
    packageDir: path.resolve(packageDir),
    version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
    mtimeMs: stat.mtimeMs,
  }
}

/** Resolve a user-supplied override into a launcher entry, or null. */
function launcherFromOverride(override) {
  const raw = String(override).trim().replace(/^"|"$/g, '')
  if (!raw) return null
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)

  let stat = null
  try {
    stat = fs.statSync(resolved)
  } catch {
    // not a path on disk: treat it as a bare command on PATH (e.g. `dsh`)
    return { kind: 'command', command: raw, version: 'unknown', binPath: null, packageDir: null }
  }

  if (stat.isDirectory()) {
    for (const candidate of [
      path.join(resolved, '@deepseek-ai', 'dsh'),
      resolved,
      path.join(resolved, 'node_modules', '@deepseek-ai', 'dsh'),
    ]) {
      const found = inspectPackage(candidate)
      if (found) return found
    }
    return null
  }

  if (resolved.endsWith('.js')) {
    return {
      kind: 'script',
      binPath: resolved,
      packageDir: path.dirname(path.dirname(resolved)),
      version: 'unknown',
      mtimeMs: stat.mtimeMs,
    }
  }
  return { kind: 'command', command: resolved, version: 'unknown', binPath: null, packageDir: null }
}

/**
 * Find the best available dsh installation.
 * @param appRoot - the desktop shell's own directory.
 * @param override - optional explicit path from settings.
 * @returns the newest discovered entry, or null when dsh is not installed.
 */
function findDshInstall(appRoot, override) {
  if (override) {
    const explicit = launcherFromOverride(override)
    if (explicit) return { ...explicit, source: 'configured' }
  }

  const found = []
  for (const root of candidateModuleRoots(appRoot)) {
    const entry = inspectPackage(path.join(root, '@deepseek-ai', 'dsh'))
    if (entry) found.push({ ...entry, source: root.includes('_npx') ? 'npx cache' : 'node_modules' })
  }
  if (found.length === 0) return null
  found.sort((a, b) => compareVersions(a.version, b.version) || a.mtimeMs - b.mtimeMs)
  return found[found.length - 1]
}

/** Well-known node locations, for machines whose PATH the shell cannot see. */
function wellKnownNodePaths() {
  const home = os.homedir()
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')

  if (process.platform === 'win32') {
    return [
      path.join(programFiles, 'nodejs', 'node.exe'),
      path.join(programFilesX86, 'nodejs', 'node.exe'),
      path.join(localAppData, 'Programs', 'nodejs', 'node.exe'),
      path.join(home, 'scoop', 'apps', 'nodejs', 'current', 'node.exe'),
      path.join(programFiles, 'nodejs', 'node.exe'),
    ]
  }
  return ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node', path.join(home, '.local', 'bin', 'node')]
}

/**
 * Locate a real Node runtime for the dsh CLI.
 *
 * Electron's own binary can masquerade as Node through `ELECTRON_RUN_AS_NODE`,
 * but the web profile mounts a live-reload plugin that requires Node's
 * `--expose-internals` machinery — which Electron's Node does not provide — so
 * that fallback is deliberately not used here.
 *
 * @param nodePath - explicit node executable from settings.
 * @returns `{ command, args, env, source }`.
 */
function findNode(nodePath) {
  const explicit = nodePath || process.env.DSH_DESKTOP_NODE
  if (explicit) return { command: explicit, args: [], env: {}, source: 'configured' }

  const locator = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (!locator.error && locator.status === 0) {
    const first = String(locator.stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0]
    if (first && fs.existsSync(first)) return { command: first, args: [], env: {}, source: 'PATH' }
  }

  for (const candidate of wellKnownNodePaths()) {
    try {
      if (fs.existsSync(candidate)) return { command: candidate, args: [], env: {}, source: 'well-known path' }
    } catch {
      /* keep looking */
    }
  }

  // Nothing detected: let the spawn fail with a clear ENOENT, which the failure
  // screen turns into actionable advice.
  return { command: 'node', args: [], env: {}, source: 'unresolved' }
}

/**
 * Build the exact spawn command for `dsh web`.
 * @param entry - a launcher entry from {@link findDshInstall}.
 * @param nodePath - optional explicit node executable.
 * @returns `{ command, args, env, node }` or null when no runtime is usable.
 */
function buildLauncher(entry, nodePath) {
  if (!entry) return null
  if (entry.kind === 'command') {
    return { command: entry.command, args: [], env: {}, node: null, shell: process.platform === 'win32' }
  }
  const node = findNode(nodePath)
  return {
    command: node.command,
    args: [...node.args, entry.binPath],
    env: node.env,
    node: node.source,
    shell: false,
  }
}

/** Ask the OS for an unused loopback port. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** The wrapped `dsh web` process: spawn, readiness parse, logs, shutdown. */
class DshServer {
  /**
   * @param options - launcher, extra CLI arguments, log sink, and startup budget.
   */
  constructor({ launcher, extraArgs = [], env = {}, timeoutMs = 120000, onLog = () => {}, onExit = () => {} } = {}) {
    this.launcher = launcher
    this.extraArgs = extraArgs
    this.env = env
    this.timeoutMs = timeoutMs
    this.onLog = onLog
    this.onExit = onExit
    this.child = null
    this.url = null
    this.port = null
    this.stopped = false
    this.log = []
  }

  /** Append one server line to the bounded in-memory log. */
  pushLog(line) {
    this.log.push(line)
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400)
    this.onLog(line)
  }

  /** The last lines of server output, for the failure screen. */
  tail(count = 12) {
    return this.log.slice(-count).join('\n')
  }

  /**
   * Boot the server, retrying on a port collision.
   * @returns `{ url, port }` once the readiness line has been seen.
   */
  async start() {
    let lastError = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const port = await getFreePort()
      try {
        return await this.spawnOnce(port)
      } catch (error) {
        lastError = error
        if (!/EADDRINUSE|address already in use/i.test(String(error && error.message))) throw error
      }
    }
    throw lastError || new Error('dsh web 启动失败')
  }

  /** One spawn attempt against a fixed port. */
  spawnOnce(port) {
    return new Promise((resolve, reject) => {
      const args = [...this.launcher.args, 'web', '--no-open', '--port', String(port), ...this.extraArgs]
      this.pushLog(`$ ${this.launcher.command} ${args.join(' ')}`)

      let child
      try {
        child = spawn(this.launcher.command, args, {
          env: { ...process.env, ...this.launcher.env, ...this.env },
          windowsHide: true,
          shell: Boolean(this.launcher.shell),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (error) {
        reject(error)
        return
      }

      let settled = false
      const finish = (error, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          try {
            child.kill()
          } catch {
            /* already gone */
          }
          reject(error)
        } else {
          resolve(value)
        }
      }

      const timer = setTimeout(
        () => finish(new Error(`等待 “dsh web:” 就绪信息超时（${Math.round(this.timeoutMs / 1000)}s）`)),
        this.timeoutMs,
      )

      const consume = (buffer) => {
        for (const line of String(buffer).split(/\r?\n/)) {
          if (!line.trim()) continue
          this.pushLog(line)
          const match = URL_RE.exec(line)
          if (match && !settled) {
            this.child = child
            this.url = match[1]
            this.port = port
            finish(null, { url: this.url, port })
          }
        }
      }

      if (child.stdout) child.stdout.on('data', consume)
      if (child.stderr) child.stderr.on('data', consume)

      child.on('error', (error) => finish(error))
      child.on('exit', (code, signal) => {
        if (!settled) {
          finish(new Error(`dsh web 在就绪前退出（code ${code}${signal ? `, signal ${signal}` : ''}）`))
          return
        }
        if (!this.stopped) this.onExit(code, signal)
      })
    })
  }

  /** Terminate the server and its children. */
  async stop() {
    this.stopped = true
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await new Promise((resolve) => {
      const done = () => resolve()
      child.once('exit', done)
      try {
        child.kill('SIGTERM')
      } catch {
        done()
        return
      }
      setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
          } else {
            child.kill('SIGKILL')
          }
        } catch {
          /* best effort */
        }
        setTimeout(done, 250)
      }, 3000)
    })
  }
}

module.exports = { DshServer, buildLauncher, findDshInstall, findNode, getFreePort, compareVersions }
