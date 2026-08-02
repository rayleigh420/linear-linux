import { app, ipcMain, shell, Menu, BrowserWindow } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { WindowState } from './window-state'
import { LinearWindow, focusOrCreate } from './window'
import { createTray } from './tray'
import { Updater } from './updater'
import { setQuitting } from './state'
import { setupViewIpc, getViewUrl, destroyView } from './viewManager'

if (process.platform === 'linux') {
	app.commandLine.appendSwitch('no-sandbox')
	app.commandLine.appendSwitch('disable-dev-shm-usage')
	app.commandLine.appendSwitch('disable-gpu-sandbox')
	app.commandLine.appendSwitch('disable-vulkan')
	app.commandLine.appendSwitch('disable-renderer-backgrounding')
	app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
	app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
	// Keep GPU compositing (do NOT add --disable-gpu-compositing) so Chromium uses
	// vsync-driven wl_surface::frame callbacks on Wayland. Without GPU compositing,
	// CPU rendering skips frame callbacks — Mutter never recomposites after our
	// wl_surface::commit. Vulkan is disabled; Chromium falls back to ANGLE/OpenGL.
}

if (is.dev) {
	app.setName('linear-linux-dev')
	app.setPath('userData', join(app.getPath('appData'), 'linear-linux-dev'))

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

	// All WebContentsView IPC + session permissions for persist:linear
	setupViewIpc()

	ipcMain.on('open-external', (_, url: string) => shell.openExternal(url))

	// Legacy: open-new-window with explicit URL (from openNewWindow tabAPI call)
	ipcMain.on('open-new-window', (_, url: string) => new LinearWindow(url))

	ipcMain.on('tab-context-menu', (e, tabId: string) => {
		// URL is fetched from the live WebContentsView at click time
		Menu.buildFromTemplate([
			{ label: 'New tab', click: () => e.sender.send('shortcut', 'new-tab') },
			{
				label: 'Open in new window',
				click: () => {
					const url = getViewUrl(tabId) || 'https://linear.app'
					destroyView(tabId)
					e.sender.send('close-tab', tabId)
					new LinearWindow(url)
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
