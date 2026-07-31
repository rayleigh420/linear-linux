import { ipcRenderer } from 'electron'

// Intercept keyboard shortcuts while webview content has focus
document.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    const mod = process.platform === 'darwin' ? e.metaKey : e.ctrlKey
    if (!mod) return

    if (e.key === 't') {
      e.preventDefault()
      ipcRenderer.sendToHost('shortcut', 'new-tab')
    } else if (e.key === 'w') {
      e.preventDefault()
      ipcRenderer.sendToHost('shortcut', 'close-tab')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      ipcRenderer.sendToHost('shortcut', e.shiftKey ? 'prev-tab' : 'next-tab')
    } else if (e.key === ',') {
      e.preventDefault()
      ipcRenderer.sendToHost('shortcut', 'open-in-new-window')
    } else {
      const num = parseInt(e.key)
      if (num >= 1 && num <= 9) {
        e.preventDefault()
        ipcRenderer.sendToHost('shortcut', `switch-${num}`)
      }
    }
  },
  true
)
