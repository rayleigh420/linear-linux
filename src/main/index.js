import { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, Tray, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox')
    app.commandLine.appendSwitch('disable-dev-shm-usage')
    app.commandLine.appendSwitch('disable-gpu-sandbox')
    app.commandLine.appendSwitch('disable-vulkan')
}

const TAB_HEIGHT = 38
let tray = null
let isQuitting = false

// ── Tab ───────────────────────────────────────────────────────────────────────

class Tab {
    constructor(win) {
        this.title = 'Linear'
        this.view = new WebContentsView({
            webPreferences: { nodeIntegration: false, contextIsolation: true },
        })
        win.contentView.addChildView(this.view)
    }
}

// ── LinearWindow ──────────────────────────────────────────────────────────────

class LinearWindow {
    static #instances = new Map() // WebContents → LinearWindow

    static fromSender(sender) {
        return LinearWindow.#instances.get(sender) ?? null
    }

    #win
    #tabBarView
    #tabs = []
    #activeIndex = -1

    constructor(url = 'https://linear.app') {
        const bounds = WindowState.load()
        this.#win = new BrowserWindow({
            width: bounds.width ?? 1280,
            height: bounds.height ?? 800,
            autoHideMenuBar: true,
            ...(bounds.x != null && bounds.y != null ? { x: bounds.x, y: bounds.y } : {}),
        })

        this.#setupTabBar()
        this.createTab(url)

        this.#win.on('resize', () => this.#relayout())
        this.#win.on('close', (e) => {
            WindowState.save(this.#win.getBounds())
            if (!isQuitting) {
                e.preventDefault()
                this.#win.hide()
            }
        })
        this.#win.on('closed', () => this.#destroy())
    }

    show() {
        this.#win.show()
        this.#win.focus()
    }

    getBrowserWindow() { return this.#win }

    #setupTabBar() {
        this.#tabBarView = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: join(__dirname, '../preload/index.js'),
            },
        })
        this.#win.contentView.addChildView(this.#tabBarView)
        LinearWindow.#instances.set(this.#tabBarView.webContents, this)

        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
            this.#tabBarView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
        } else {
            this.#tabBarView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
        }
    }

    createTab(url = 'https://linear.app') {
        const tab = new Tab(this.#win)
        this.#tabs.push(tab)
        LinearWindow.#instances.set(tab.view.webContents, this)

        tab.view.webContents.on('page-title-updated', (_, title) => {
            tab.title = title || 'Linear'
            this.#syncTabBar()
        })

        tab.view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
            if (openUrl.startsWith('https://linear.app')) {
                setImmediate(() => this.createTab(openUrl))
            } else {
                shell.openExternal(openUrl)
            }
            return { action: 'deny' }
        })

        tab.view.webContents.on('before-input-event', (event, input) => {
            this.#handleKeyboardShortcut(event, input)
        })

        tab.view.webContents.loadURL(url)
        this.switchToTab(this.#tabs.length - 1)
    }

    switchToTab(index) {
        if (index < 0 || index >= this.#tabs.length) return
        this.#activeIndex = index
        this.#relayout()
        this.#syncTabBar()
        this.#tabs[index].view.webContents.focus()
    }

    closeTab(index) {
        if (index < 0 || index >= this.#tabs.length) return
        if (this.#tabs.length === 1) { this.#win.close(); return }

        const [removed] = this.#tabs.splice(index, 1)
        LinearWindow.#instances.delete(removed.view.webContents)
        this.#win.contentView.removeChildView(removed.view)
        removed.view.webContents.close()

        this.#activeIndex = -1
        this.switchToTab(Math.min(index, this.#tabs.length - 1))
    }

    closeOtherTabs(keepIndex) {
        this.#tabs.map((_, i) => i).filter((i) => i !== keepIndex).reverse()
            .forEach((i) => this.closeTab(i))
    }

    reloadTab(index) {
        this.#tabs[index]?.view.webContents.reload()
    }

    showContextMenu(index) {
        const url = this.#tabs[index]?.view.webContents.getURL() ?? 'https://linear.app'
        Menu.buildFromTemplate([
            { label: 'New tab', click: () => this.createTab() },
            { label: 'Open in new window', click: () => new LinearWindow(url) },
            { type: 'separator' },
            { label: 'Reload', click: () => this.reloadTab(index) },
            { type: 'separator' },
            { label: 'Close tab', click: () => this.closeTab(index) },
            {
                label: 'Close other tabs', enabled: this.#tabs.length > 1,
                click: () => this.closeOtherTabs(index)
            },
        ]).popup({ window: this.#win })
    }

    // ── private ───────────────────────────────────────────────────────────────

    #relayout() {
        const { width, height } = this.#win.getContentBounds()
        this.#tabBarView.setBounds({ x: 0, y: 0, width, height: TAB_HEIGHT })
        this.#tabs.forEach((tab, i) => {
            if (i === this.#activeIndex) {
                tab.view.setBounds({ x: 0, y: TAB_HEIGHT, width, height: height - TAB_HEIGHT })
            } else {
                tab.view.setBounds({ x: -(width + 10), y: TAB_HEIGHT, width, height: height - TAB_HEIGHT })
            }
        })
    }

    #syncTabBar() {
        if (this.#tabBarView.webContents.isDestroyed()) return
        this.#tabBarView.webContents.send('tabs-updated', this.#tabs.map((t, i) => ({
            index: i,
            title: t.title,
            active: i === this.#activeIndex,
        })))
    }

    #handleKeyboardShortcut(event, input) {
        if (input.type !== 'keyDown') return
        const mod = process.platform === 'darwin' ? input.meta : input.control
        if (!mod) return

        if (input.key === 't') {
            event.preventDefault(); this.createTab()
        } else if (input.key === 'w') {
            event.preventDefault(); this.closeTab(this.#activeIndex)
        } else if (input.key === 'Tab') {
            event.preventDefault()
            const dir = input.shift ? -1 : 1
            this.switchToTab((this.#activeIndex + dir + this.#tabs.length) % this.#tabs.length)
        } else {
            const num = parseInt(input.key)
            if (num >= 1 && num <= 9) { event.preventDefault(); this.switchToTab(num - 1) }
        }
    }

    #destroy() {
        LinearWindow.#instances.delete(this.#tabBarView.webContents)
        this.#tabs.forEach((t) => LinearWindow.#instances.delete(t.view.webContents))
    }
}

// ── WindowState ───────────────────────────────────────────────────────────────

class WindowState {
    static #path = null

    static init(userDataPath) {
        WindowState.#path = join(userDataPath, 'window-state.json')
    }

    static load() {
        if (!WindowState.#path) return {}
        try {
            const { width, height, x, y } = JSON.parse(fs.readFileSync(WindowState.#path, 'utf8'))
            if (Number.isFinite(width) && Number.isFinite(height)) {
                return {
                    width, height,
                    x: Number.isFinite(x) ? x : null,
                    y: Number.isFinite(y) ? y : null
                }
            }
        } catch (_) { }
        return {}
    }

    static save(bounds) {
        if (!WindowState.#path || !bounds) return
        try {
            fs.mkdirSync(join(WindowState.#path, '..'), { recursive: true })
            fs.writeFileSync(WindowState.#path, JSON.stringify(bounds), 'utf8')
        } catch (_) { }
    }
}

// ── System Tray ───────────────────────────────────────────────────────────────

function getIconPath() {
    if (is.dev) return join(__dirname, '../../resources/icon.png')
    return join(process.resourcesPath, 'icon.png')
}

function focusOrCreate() {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) {
        new LinearWindow()
    } else {
        wins.forEach((w) => { w.show(); w.focus() })
    }
}

function createTray() {
    const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 22, height: 22 })
    tray = new Tray(icon)
    tray.setToolTip('Linear')
    tray.on('activate', focusOrCreate)    // macOS click
    tray.on('double-click', focusOrCreate) // Windows/Linux double-click

    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Linear', click: focusOrCreate },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => Updater.check(true) },
        { type: 'separator' },
        { label: 'Quit Linear', click: () => { isQuitting = true; app.quit() } },
    ]))
}

// ── Auto Updater ──────────────────────────────────────────────────────────────

class Updater {
    static #isNix = process.execPath.includes('/nix/store')

    static setup() {
        if (Updater.#isNix) return

        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = true

        autoUpdater.on('update-available', (info) => {
            dialog.showMessageBox({
                type: 'info',
                title: 'Update Available',
                message: `Linear v${info.version} is available`,
                detail: 'Download now and install when you quit?',
                buttons: ['Download', 'Later'],
                defaultId: 0,
            }).then(({ response }) => {
                if (response === 0) autoUpdater.downloadUpdate()
            })
        })

        autoUpdater.on('update-downloaded', () => {
            dialog.showMessageBox({
                type: 'info',
                title: 'Update Ready',
                message: 'Update downloaded',
                detail: 'Restart Linear to install the new version.',
                buttons: ['Restart Now', 'Later'],
                defaultId: 0,
            }).then(({ response }) => {
                if (response === 0) { isQuitting = true; autoUpdater.quitAndInstall() }
            })
        })

        autoUpdater.on('error', () => {})
        setTimeout(() => Updater.check(false), 5000)
    }

    static check(explicit = false) {
        if (Updater.#isNix) {
            if (explicit) dialog.showMessageBox({
                type: 'info', title: 'Managed by Nix',
                message: 'Run nix flake update to check for updates.',
            })
            return
        }
        autoUpdater.checkForUpdates().catch(() => {})
    }
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.on('tab-create', (e) => LinearWindow.fromSender(e.sender)?.createTab())
ipcMain.on('tab-switch', (e, i) => LinearWindow.fromSender(e.sender)?.switchToTab(i))
ipcMain.on('tab-close', (e, i) => LinearWindow.fromSender(e.sender)?.closeTab(i))
ipcMain.on('tab-reload', (e, i) => LinearWindow.fromSender(e.sender)?.reloadTab(i))
ipcMain.on('tab-close-others', (e, i) => LinearWindow.fromSender(e.sender)?.closeOtherTabs(i))
ipcMain.on('tab-context-menu', (e, i) => LinearWindow.fromSender(e.sender)?.showContextMenu(i))

// ── app lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    WindowState.init(app.getPath('userData'))
    electronApp.setAppUserModelId('app.linear.linux')

    app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

    session.defaultSession.setPermissionRequestHandler((_, permission, callback, details) => {
        const isLinear = (details?.requestingUrl ?? '').startsWith('https://linear.app')
        callback(permission === 'notifications' && isLinear)
    })

    createTray()
    new LinearWindow()
    Updater.setup()

    app.on('activate', focusOrCreate) // macOS dock click
})

// App lives in tray — don't quit when all windows are closed
app.on('window-all-closed', () => { })
