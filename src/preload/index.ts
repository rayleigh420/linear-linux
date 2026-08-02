import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld('electron', electronAPI)
		contextBridge.exposeInMainWorld('tabAPI', {
			platform: process.platform,

			openExternal: (url: string) => ipcRenderer.send('open-external', url),
			openNewWindow: (url: string) => ipcRenderer.send('open-new-window', url),
			showContextMenu: (tabId: string) => ipcRenderer.send('tab-context-menu', tabId),
			onShortcut: (cb: (action: string) => void) =>
				ipcRenderer.on('shortcut', (_, action) => cb(action)),
			onReloadTab: (cb: (tabId: string) => void) =>
				ipcRenderer.on('reload-tab', (_, tabId) => cb(tabId)),
			onCloseTab: (cb: (tabId: string) => void) =>
				ipcRenderer.on('close-tab', (_, tabId) => cb(tabId)),
			onCloseOtherTabs: (cb: (tabId: string) => void) =>
				ipcRenderer.on('close-other-tabs', (_, tabId) => cb(tabId)),
			onOpenUrl: (cb: (url: string) => void) =>
				ipcRenderer.on('open-url', (_, url) => cb(url))
		})
	} catch (error) {
		console.error(error)
	}
}
