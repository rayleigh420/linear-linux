const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabAPI', {
    onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_, tabs) => cb(tabs)),
    createTab: () => ipcRenderer.send('tab-create'),
    closeTab: (index) => ipcRenderer.send('tab-close', index),
    switchTab: (index) => ipcRenderer.send('tab-switch', index),
});
