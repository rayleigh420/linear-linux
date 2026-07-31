import { app, ipcMain, shell, session, Menu, BrowserWindow } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { WindowState } from './window-state'
import { LinearWindow, focusOrCreate } from './window'
import { createTray } from './tray'
import { Updater } from './updater'
import { setQuitting } from './state'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-vulkan')
}

// Separate dev instance: different WM_CLASS, userData dir, app ID
// so GNOME won't confuse it with the installed production app.
if (is.dev) {
  app.setName('linear-linux-dev')
  app.setPath('userData', join(app.getPath('appData'), 'linear-linux-dev'))

  // Ctrl+C sends SIGINT to the process group. Force exit after a grace period
  // in case app.quit() hangs on something.
  const devQuit = (): void => {
    setQuitting(true)
    app.quit()
    setTimeout(() => process.exit(0), 800).unref()
  }
  process.on('SIGINT', devQuit)
  process.on('SIGTERM', devQuit)
}

app.whenReady().then(() => {
  WindowState.init(app.getPath('userData'))
  electronApp.setAppUserModelId(is.dev ? 'app.linear.linux.dev' : 'app.linear.linux')

  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  session.defaultSession.setPermissionRequestHandler((_, permission, callback, details) => {
    const isLinear = ((details as Electron.PermissionRequest)?.requestingUrl ?? '').startsWith('https://linear.app')
    callback(permission === 'notifications' && isLinear)
  })

  ipcMain.on('open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.on('open-new-window', (_, url: string) => new LinearWindow(url))

  ipcMain.on('tab-context-menu', (e, tabId: string, url: string) => {
    Menu.buildFromTemplate([
      { label: 'New tab', click: () => e.sender.send('shortcut', 'new-tab') },
      {
        label: 'Open in new window',
        click: () => {
          new LinearWindow(url)
          e.sender.send('close-tab', tabId)
        }
      },
      { type: 'separator' },
      { label: 'Reload', click: () => e.sender.send('reload-tab', tabId) },
      { type: 'separator' },
      { label: 'Close tab', click: () => e.sender.send('close-tab', tabId) },
      { label: 'Close other tabs', click: () => e.sender.send('close-other-tabs', tabId) }
    ]).popup({ window: BrowserWindow.fromWebContents(e.sender) ?? undefined })
  })

  createTray()
  new LinearWindow()
  Updater.setup()

  app.on('activate', focusOrCreate)
})

app.on('window-all-closed', () => {})
