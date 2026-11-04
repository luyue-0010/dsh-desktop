/** Isolated bridge for the desktop-owned appearance settings window. */

import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'

contextBridge.exposeInMainWorld('dshUiSettings', {
  get: () => ipcRenderer.invoke(DESKTOP_IPC.uiSettingsGet),
  save: (patch: unknown) => ipcRenderer.invoke(DESKTOP_IPC.uiSettingsSave, patch),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke(DESKTOP_IPC.uiSettingsAutostart, enabled),
  close: () => ipcRenderer.invoke(DESKTOP_IPC.uiSettingsClose),
})
