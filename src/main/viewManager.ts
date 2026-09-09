import { ipcMain, session, shell, BrowserWindow, WebContentsView } from 'electron'
import { join } from 'path'

interface ViewEntry {
	view: WebContentsView
	winId: number
	isVisible: boolean
	intendedBounds?: Electron.Rectangle
	// True while the view is fully removed from the window (during tab-drag suspend).
	// Detaching (removeChildView) instead of moving off-screen to 1×1 avoids Chromium's
	// GPU compositor tearing down the view's layer — a re-added view gets a fresh layer
	// that composites correctly, exactly like a newly created view does.
	detached?: boolean
}

const views = new Map<string, ViewEntry>()
const preloadPath = join(__dirname, '../preload/webview.js')
const suspendedWindows = new Set<number>()

// The ONLY reliable way to make Chromium PRESENT a repositioned/re-attached
// WebContentsView on GNOME Wayland: force a real xdg_toplevel configure round-trip.
// Toggling the maximized state makes Mutter send configure → Electron ack_configure →
// full recomposite, which flushes the views' pending surface state onto the screen.
//
// Everything cheaper fails (proven via WAYLAND_DEBUG — see REPAINT_BUG.md):
//   • setSize / a size nudge is absorbed by wp_viewport (no real configure)
//   • DOM opacity, setBackgroundColor, invalidate, sendInputEvent, focus, a real scroll,
//     removeChildView/addChildView — none produce the frame that lands pending state
//     (matches electron#51808: pending state applies only on a real frame submission).
// Only a genuine xdg state change (maximize/fullscreen) does it — hence the toggle.
async function nativeReconfigure(win: BrowserWindow): Promise<void> {
	if (process.platform !== 'linux' || win.isDestroyed()) return
	if (win.isMaximized()) {
		win.unmaximize()
		win.maximize()
	} else {
		win.maximize()
		win.unmaximize()
	}
	// Let the configure → ack_configure → recomposite round-trip settle before callers
	// reveal the live views (remove the frozen drag thumbnails).
	await new Promise<void>((r) => setTimeout(r, 180))
}

export function getViewUrl(panelId: string): string {
	return views.get(panelId)?.view.webContents.getURL() ?? ''
}

export function destroyView(panelId: string): void {
	const entry = views.get(panelId)
	if (!entry) return
	views.delete(panelId)
	const win = BrowserWindow.fromId(entry.winId)
	if (win) win.contentView.removeChildView(entry.view)
	try {
		entry.view.webContents.stop()
	} catch {
		/* already destroyed */
	}
}

export function setupViewIpc(): void {
	const ses = session.fromPartition('persist:linear')

	const ALLOWED: ReadonlySet<string> = new Set([
		'notifications',
		'clipboard-read',
		'clipboard-sanitized-write'
	])
	const isLinearUrl = (url?: string | null): boolean =>
		!!url && url.startsWith('https://linear.app')

	ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
		const url = (details as Electron.PermissionRequest)?.requestingUrl
		callback(ALLOWED.has(permission) && isLinearUrl(url))
	})

	ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
		const url = requestingOrigin || (details as { requestingUrl?: string })?.requestingUrl
		return ALLOWED.has(permission) && isLinearUrl(url)
	})

	ipcMain.on('wcv-shortcut', (e, action: string) => {
		for (const [panelId, entry] of views) {
			if (entry.view.webContents.id === e.sender.id) {
				BrowserWindow.fromId(entry.winId)?.webContents.send('wcv:shortcut', panelId, action)
				return
			}
		}
	})

	ipcMain.on('wcv:create', (e, panelId: string, url: string) => {
		if (views.has(panelId)) return
		const win = BrowserWindow.fromWebContents(e.sender)
		if (!win) return

		const viewSes = session.fromPartition('persist:linear')
		const view = new WebContentsView({
			webPreferences: {
				session: viewSes,
				preload: preloadPath,
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: false,
				backgroundThrottling: false
			}
		})

		view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
		view.setVisible(true)
		win.contentView.addChildView(view)
		view.webContents.loadURL(url)

		view.webContents.on('page-title-updated', (_, title) => {
			win.webContents.send('wcv:title-update', panelId, title)
		})

		view.webContents.on('did-finish-load', () => {
			// Once the page finishes loading, nudge the renderer to emit a fresh full-viewport
			// frame (a full-width view at x=0 composites fine on its own — only off-x split
			// views need the native reconfigure done in wcv:resume-all).
			const e = views.get(panelId)
			if (e?.isVisible && !suspendedWindows.has(e.winId)) {
				const w = BrowserWindow.fromId(e.winId)
				w?.webContents.invalidate()
				w?.webContents.send('wcv:force-composite')
			}
		})

		view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
			if (newUrl.startsWith('https://linear.app')) {
				win.webContents.send('wcv:new-tab', newUrl)
			} else {
				shell.openExternal(newUrl)
			}
			return { action: 'deny' }
		})

		views.set(panelId, { view, winId: win.id, isVisible: false })
	})

	ipcMain.on('wcv:destroy', (_, panelId: string) => destroyView(panelId))

	ipcMain.on('wcv:set-bounds', (_, panelId: string, bounds: Electron.Rectangle) => {
		const entry = views.get(panelId)
		if (!entry) return
		entry.intendedBounds = bounds
		// While suspended the view is detached; keep the target bounds and apply on resume.
		if (!suspendedWindows.has(entry.winId)) {
			entry.view.setBounds(bounds)
		}
	})

	ipcMain.on('wcv:show', (_, panelId: string) => {
		const entry = views.get(panelId)
		if (!entry) return
		const wasVisible = entry.isVisible
		entry.isVisible = true

		if (!wasVisible && !suspendedWindows.has(entry.winId)) {
			const win = BrowserWindow.fromId(entry.winId)
			// A newly-shown view fills the window at x=0 (single tab / tab switch), which
			// composites without a native reconfigure. Just prompt a fresh full-viewport frame.
			win?.webContents.invalidate()
			win?.webContents.send('wcv:force-composite')
		}
	})

	ipcMain.on('wcv:hide', (_, panelId: string) => {
		const entry = views.get(panelId)
		if (!entry) return
		entry.isVisible = false
		entry.view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
	})

	ipcMain.on('wcv:suspend-all', (e) => {
		const win = BrowserWindow.fromWebContents(e.sender)
		const winId = win?.id
		if (win === null || winId === undefined) return
		suspendedWindows.add(winId)
		for (const entry of views.values()) {
			if (entry.winId === winId && entry.isVisible) {
				// Snapshot current bounds so resume-all can restore even if no wcv:set-bounds
				// arrives during suspension (e.g. drag cancelled without split).
				if (!entry.intendedBounds) {
					entry.intendedBounds = entry.view.getBounds()
				}
				// Detach entirely (frees mouse events for dockview drop zones, same as before)
				// WITHOUT the 1×1 off-screen trick that made Chromium's GPU compositor drop the
				// view's layer — the black-panel root cause. See ViewEntry.detached.
				win.contentView.removeChildView(entry.view)
				entry.detached = true
			}
		}
	})

	ipcMain.on('wcv:resume-all', (e) => {
		const winId = BrowserWindow.fromWebContents(e.sender)?.id
		if (winId === undefined) return
		suspendedWindows.delete(winId)
		const win = BrowserWindow.fromId(winId)

		// Re-attach + reposition every view first. They render but won't be PRESENTED yet
		// (Chromium needs a native configure), so keep the frozen thumbnails in place.
		const resumed: string[] = []
		for (const [panelId, entry] of views) {
			if (entry.winId !== winId) continue
			const reattach = (): void => {
				if (entry.detached && win) {
					win.contentView.addChildView(entry.view)
					entry.detached = false
				}
			}
			if (entry.isVisible && entry.intendedBounds) {
				reattach()
				entry.view.setBounds(entry.intendedBounds)
				entry.intendedBounds = undefined
				resumed.push(panelId)
			} else if (entry.isVisible && !entry.intendedBounds) {
				reattach()
				resumed.push(panelId)
			} else {
				// Not visible: re-attach if detached (so it isn't orphaned), then park off-screen.
				reattach()
				entry.view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
			}
		}

		// Force the single native reconfigure that actually presents the views, THEN reveal
		// them (remove thumbnails) so the user never sees the black intermediate frame.
		if (win) {
			nativeReconfigure(win).then(() => {
				if (win.isDestroyed()) return
				win.webContents.invalidate()
				for (const panelId of resumed) win.webContents.send('wcv:view-ready', panelId)
			})
		}
	})

	ipcMain.handle('wcv:capture-all', async (e) => {
		const winId = BrowserWindow.fromWebContents(e.sender)?.id
		if (!winId) return []
		const captures: Array<{ panelId: string; dataUrl: string }> = []
		await Promise.all(
			[...views.entries()]
				.filter(([, entry]) => entry.winId === winId && entry.isVisible)
				.map(async ([panelId, entry]) => {
					try {
						const img = await entry.view.webContents.capturePage()
						captures.push({ panelId, dataUrl: img.toDataURL() })
					} catch (err) {
						console.error(`wcv:capture-all(${panelId}) failed:`, err)
					}
				})
		)
		return captures
	})

	ipcMain.on('wcv:reload', (_, panelId: string) => {
		views.get(panelId)?.view.webContents.reload()
	})

	ipcMain.handle('wcv:get-url', (_, panelId: string): string => getViewUrl(panelId))

	ipcMain.on('wcv:open-in-new-window', (e, panelId: string) => {
		const url = getViewUrl(panelId) || 'https://linear.app'
		destroyView(panelId)
		e.sender.send('close-tab', panelId)
		import('./window').then(({ LinearWindow }) => new LinearWindow(url))
	})
}
