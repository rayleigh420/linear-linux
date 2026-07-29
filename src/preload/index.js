import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const tabAPI = {
    onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_, tabs) => cb(tabs)),
    createTab: () => ipcRenderer.send('tab-create'),
    closeTab: (index) => ipcRenderer.send('tab-close', index),
    switchTab: (index) => ipcRenderer.send('tab-switch', index),
    reloadTab: (index) => ipcRenderer.send('tab-reload', index),
    closeOtherTabs: (index) => ipcRenderer.send('tab-close-others', index),
    showContextMenu: (index) => ipcRenderer.send('tab-context-menu', index),
}

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('tabAPI', tabAPI)
    } catch (error) {
        console.error(error)
    }
}
