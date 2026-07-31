import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { WindowState } from './window-state'
import { isQuitting } from './state'

export function focusOrCreate(): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) {
    new LinearWindow()
  } else {
    wins.forEach((w) => {
      w.show()
      w.focus()
    })
  }
}

export class LinearWindow {
  #win: BrowserWindow

  constructor(initialUrl: string | null = null) {
    const bounds = WindowState.load()
    this.#win = new BrowserWindow({
      width: bounds.width ?? 1280,
      height: bounds.height ?? 800,
      autoHideMenuBar: true,
      ...(bounds.x != null && bounds.y != null ? { x: bounds.x, y: bounds.y } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        sandbox: false
      }
    })

    // Pass initialUrl via query param so the renderer has it at startup
    // and creates exactly one tab (avoids the default tab + IPC race).
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const devUrl = new URL(process.env['ELECTRON_RENDERER_URL'])
      if (initialUrl) devUrl.searchParams.set('url', initialUrl)
      this.#win.loadURL(devUrl.toString())
    } else {
      if (initialUrl) {
        this.#win.loadFile(join(__dirname, '../renderer/index.html'), { query: { url: initialUrl } })
      } else {
        this.#win.loadFile(join(__dirname, '../renderer/index.html'))
      }
    }

    this.#win.webContents.once('did-finish-load', () => {
      if (is.dev) this.#win.setTitle('Linear [DEV]')
    })

    this.#win.on('close', (e) => {
      WindowState.save(this.#win.getBounds())
      if (!isQuitting) {
        e.preventDefault()
        this.#win.hide()
      }
    })
  }

  show(): void {
    this.#win.show()
    this.#win.focus()
  }

  getBrowserWindow(): BrowserWindow {
    return this.#win
  }
}
