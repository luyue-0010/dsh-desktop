/** Linux XDG autostart entry for the packaged application. */

import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Absolute path of the XDG autostart entry. */
export function autostartFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'autostart', 'deepseek-harness.desktop')
}

/** Quote one Desktop Entry Exec argument. */
function quote(value: string): string {
  return `"${value.replace(/(["\\$`])/gu, '\\$1')}"`
}

/** Command line that starts this installation. */
function autostartCommand(): string {
  if (!app.isPackaged) return `${quote(process.execPath)} --no-sandbox ${quote(app.getAppPath())}`
  return `${quote(process.env.APPIMAGE || process.execPath)} --no-sandbox`
}

/** Whether the current user has a DeepSeek Harness autostart entry. */
export function isAutostartEnabled(): boolean {
  if (process.platform !== 'linux') return false
  try { return existsSync(autostartFilePath()) } catch { return false }
}

/** Create or remove the XDG autostart entry. */
export function setAutostart(enabled: boolean): boolean {
  if (process.platform !== 'linux') return false
  const file = autostartFilePath()
  if (!enabled) {
    try { rmSync(file, { force: true }) } catch (error) {
      console.warn('desktop autostart: remove failed', error)
      return false
    }
    return true
  }
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, [
      '[Desktop Entry]',
      'Type=Application',
      'Name=DeepSeek Harness',
      'Comment=DeepSeek Harness desktop client',
      `Exec=${autostartCommand()}`,
      'Icon=deepseek-harness',
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      'StartupWMClass=deepseek-harness',
      '',
    ].join('\n'))
    return true
  } catch (error) {
    console.warn('desktop autostart: write failed', error)
    return false
  }
}
