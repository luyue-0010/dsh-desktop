'use strict'

/**
 * Preload bridge. Exposed to both the local loading/error pages and the wrapped
 * dsh web GUI (which can use `window.dshDesktop.isDesktop` to know it is hosted
 * by the desktop shell).
 *
 * @module dsh-desktop/preload
 */

const { contextBridge, ipcRenderer } = require('electron')

/** Subscribe helper returning an unsubscribe function. */
function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('dshDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  getStatus: () => ipcRenderer.invoke('desktop:get-status'),
  restartServer: () => ipcRenderer.invoke('desktop:restart-server'),
  openInBrowser: () => ipcRenderer.invoke('desktop:open-in-browser'),
  openPath: (target) => ipcRenderer.invoke('desktop:open-path', target),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  onStatus: (callback) => subscribe('desktop:status', callback),

  /* Settings surface, used by the desktop settings window. */
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('desktop:set-settings', patch),
  resetSettings: () => ipcRenderer.invoke('desktop:reset-settings'),
  pickBackgroundImage: () => ipcRenderer.invoke('desktop:pick-background-image'),
  clearBackgroundImage: () => ipcRenderer.invoke('desktop:clear-background-image'),
  deriveArtwork: (payload) => ipcRenderer.invoke('desktop:derive-artwork', payload),
  artworkPreview: (payload) => ipcRenderer.invoke('desktop:artwork-preview', payload),
  closeSettings: () => ipcRenderer.invoke('desktop:close-settings'),
})
