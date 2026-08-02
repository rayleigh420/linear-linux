type ShortcutHandler = (action: string, panelId: string) => void
type OpenUrlHandler = (url: string) => void
type Snapshot = { panelId: string; dataUrl: string }

const titleHandlers = new Map<string, (title: string) => void>()
let shortcutHandler: ShortcutHandler | null = null
let openUrlHandler: OpenUrlHandler | null = null

// Last sash-adjusted bounds sent to main via wcv:set-bounds. Used to position overlays.
const lastSentBounds = new Map<string, { x: number; y: number; w: number; h: number }>()

// Screenshot overlay elements shown during drag (VSCode-style: freeze content, no black flash).
const thumbnailEls = new Map<string, HTMLImageElement>()

// Nudge the BrowserWindow renderer to emit a fresh full-viewport frame. A no-op-looking
// opacity flip reports full-viewport damage, prompting a repaint of the newly-shown view.
// (Split views additionally need the native reconfigure in the main process; this alone
// is enough for a full-width view shown at x=0.)
function forceCompositorFrame(): void {
	const root = document.documentElement
	root.style.opacity = '0.9999'
	requestAnimationFrame(() => {
		root.style.opacity = ''
	})
}

;(() => {
	window.electron.ipcRenderer.on('wcv:title-update', (_e, panelId, title) => {
		titleHandlers.get(panelId as string)?.((title as string) || 'Linear')
	})
	window.electron.ipcRenderer.on('wcv:shortcut', (_e, panelId, action) => {
		shortcutHandler?.(action as string, panelId as string)
	})
	window.electron.ipcRenderer.on('wcv:new-tab', (_e, url) => {
		openUrlHandler?.(url as string)
	})
	// Main signals view restored — remove thumbnail overlay then force a compositor frame.
	window.electron.ipcRenderer.on('wcv:view-ready', (_e, panelId) => {
		const el = thumbnailEls.get(panelId as string)
		if (el) {
			el.remove()
			thumbnailEls.delete(panelId as string)
		}
		forceCompositorFrame()
	})
	// Main signals a previously-hidden view is now user-visible (new window / tab switch).
	// Force a compositor frame so the view renders without requiring a click.
	window.electron.ipcRenderer.on('wcv:force-composite', () => {
		forceCompositorFrame()
	})
})()

export function setShortcutHandler(h: ShortcutHandler): void {
	shortcutHandler = h
}

export function setOpenUrlHandler(h: OpenUrlHandler): void {
	openUrlHandler = h
}

export function createView(id: string, url: string, onTitleUpdate: (title: string) => void): void {
	if (titleHandlers.has(id)) return
	titleHandlers.set(id, onTitleUpdate)
	window.electron.ipcRenderer.send('wcv:create', id, url)
}

export function removeView(id: string): void {
	titleHandlers.delete(id)
	lastSentBounds.delete(id)
	thumbnailEls.get(id)?.remove()
	thumbnailEls.delete(id)
	window.electron.ipcRenderer.send('wcv:destroy', id)
}

// How close (px) a sash edge must be to a panel edge to count as adjacent.
const SASH_MARGIN = 8

export function syncViewBounds(id: string, placeholder: HTMLElement): void {
	const rect = placeholder.getBoundingClientRect()
	if (rect.width === 0 || rect.height === 0) {
		window.electron.ipcRenderer.send('wcv:hide', id)
		return
	}

	let x = Math.round(rect.left)
	let y = Math.round(rect.top)
	let w = Math.round(rect.width)
	let h = Math.round(rect.height)

	// WebContentsView is an OS-level window — it blocks mouse events to any HTML element
	// beneath it, including dockview sash elements used for panel resizing.
	// Shrink the bounds so sash regions remain accessible for hover and drag.
	for (const sash of document.querySelectorAll<HTMLElement>('.dv-sash')) {
		const sr = sash.getBoundingClientRect()
		if (sr.width === 0 || sr.height === 0) continue

		if (sr.height > sr.width) {
			// Vertical sash (left-right split)
			const sashLeft = Math.round(sr.left)
			const sashRight = Math.round(sr.right)
			if (Math.abs(sashLeft - (x + w)) < SASH_MARGIN) {
				w = sashLeft - x
			} else if (Math.abs(sashRight - x) < SASH_MARGIN) {
				w -= sashRight - x
				x = sashRight
			}
		} else {
			// Horizontal sash (top-bottom split)
			const sashTop = Math.round(sr.top)
			const sashBottom = Math.round(sr.bottom)
			if (Math.abs(sashTop - (y + h)) < SASH_MARGIN) {
				h = sashTop - y
			} else if (Math.abs(sashBottom - y) < SASH_MARGIN) {
				h -= sashBottom - y
				y = sashBottom
			}
		}
	}

	w = Math.max(w, 0)
	h = Math.max(h, 0)
	lastSentBounds.set(id, { x, y, w, h })
	window.electron.ipcRenderer.send('wcv:set-bounds', id, { x, y, width: w, height: h })
	window.electron.ipcRenderer.send('wcv:show', id)
}

export function hideView(id: string): void {
	window.electron.ipcRenderer.send('wcv:hide', id)
}

export function reloadView(id: string): void {
	window.electron.ipcRenderer.send('wcv:reload', id)
}

function showThumbnails(snapshots: Snapshot[]): void {
	for (const { panelId, dataUrl } of snapshots) {
		const b = lastSentBounds.get(panelId)
		if (!b) continue
		const img = document.createElement('img')
		img.src = dataUrl
		img.style.cssText = `position:fixed;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;z-index:999;pointer-events:none;display:block;`
		document.body.appendChild(img)
		thumbnailEls.set(panelId, img)
	}
}

function removeAllThumbnails(): void {
	thumbnailEls.forEach((el) => el.remove())
	thumbnailEls.clear()
}

// WebContentsViews (native OS windows) intercept all mouse events in their bounds,
// blocking dockview's tab drop-zone detection during tab drag.
// Sash elements are already accessible via the bounds margin in syncViewBounds,
// so no suspension is needed for sash resize — views paint continuously during resize.
// For tab drag only: suspend views (detach) + show frozen screenshot overlay.

// Active-drag resume hook. Set while a tab drag is suspended; cleared once resumed.
// Exposed so App.tsx can drive resume from dockview's onDidLayoutChange — the only
// RELIABLE drag-end signal. DOM drag-end events (dragend/mouseup) are unreliable here:
// dockview removes/recreates the dragged tab element on drop, so `dragend` fires on a
// detached node and never reaches our window listener → resume-all never runs → black.
let resumeActiveDrag: (() => void) | null = null

export function onDockviewLayoutChange(): void {
	// Fires on every layout change; only does something mid-drag (resumeActiveDrag set).
	resumeActiveDrag?.()
}

;(() => {
	document.addEventListener('mousedown', (e) => {
		const target = e.target as HTMLElement
		// Only tab drag triggers suspension. Sash drag is handled natively (sash elements
		// are never covered by WebContentsView thanks to the SASH_MARGIN inset).
		const isDragTarget = target.closest?.('.dv-tab') !== null
		if (!isDragTarget) return
		if (resumeActiveDrag) return // a drag is already in flight

		let suspended = false
		let dragging = false
		let safetyTimer: ReturnType<typeof setTimeout> | null = null

		const onMove = (): void => {
			if (suspended) return
			suspended = true
			dragging = true

			// Suspend immediately so dockview HTML elements (sashes, drop zones) get mouse events.
			window.electron.ipcRenderer.send('wcv:suspend-all')

			// Hard fallback: if no layout change / drag-end arrives, force resume so views
			// can never get stuck detached (black) forever.
			safetyTimer = setTimeout(() => cleanup(), 2000)

			// Capture screenshots and show as overlay — replaces the brief off-screen black
			// with frozen content. Async: thumbnails appear as soon as capture resolves.
			;(window.electron.ipcRenderer.invoke('wcv:capture-all') as Promise<Snapshot[]>)
				.then((snapshots) => {
					if (dragging) showThumbnails(snapshots)
				})
				.catch((err) => console.error('wcv:capture-all failed:', err))
		}

		const END_EVENTS = ['mouseup', 'dragend'] as const
		let cleanedUp = false
		const cleanup = (): void => {
			if (cleanedUp) return
			cleanedUp = true
			if (safetyTimer) {
				clearTimeout(safetyTimer)
				safetyTimer = null
			}
			resumeActiveDrag = null
			window.removeEventListener('mousemove', onMove, true)
			END_EVENTS.forEach((n) => window.removeEventListener(n, cleanup, true))
			dragging = false
			if (suspended) {
				requestAnimationFrame(() => {
					window.electron.ipcRenderer.send('wcv:resume-all')
					// Safety net: clear any thumbnails left over if wcv:view-ready never arrives.
					setTimeout(removeAllThumbnails, 1500)
				})
			}
		}

		// Primary resume signal is dockview's onDidLayoutChange (via onDockviewLayoutChange);
		// DOM events are kept as best-effort backups.
		resumeActiveDrag = cleanup
		window.addEventListener('mousemove', onMove, { capture: true })
		END_EVENTS.forEach((n) => window.addEventListener(n, cleanup, { capture: true }))
	})
})()
