import { useCallback, useEffect, useRef } from 'react'
import { DockviewReact, DockviewReadyEvent, themeAbyss } from 'dockview-react'
import type { DockviewApi } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import '../assets/style.css'
import { WebviewPanel, type WebviewPanelParams } from './WebviewPanel'
import { CustomTab } from './CustomTab'
import {
	setShortcutHandler,
	setOpenUrlHandler,
	reloadView,
	onDockviewLayoutChange
} from './webviewManager'

const LINEAR_URL = 'https://linear.app'

// URL passed via query param when this window was opened for a specific page
const startupUrl = new URLSearchParams(window.location.search).get('url') || LINEAR_URL

function addTab(api: DockviewApi, url = LINEAR_URL): void {
	const id = `tab-${crypto.randomUUID()}`
	api.addPanel<WebviewPanelParams>({
		id,
		title: 'Linear',
		component: 'webview',
		tabComponent: 'custom',
		params: { url }
	})
}

function openInNewWindow(panelId: string): void {
	// Main process fetches the URL, destroys the view, sends close-tab, and opens a new window.
	window.electron.ipcRenderer.send('wcv:open-in-new-window', panelId)
}

function handleShortcut(action: string, sourcePanelId: string | undefined, api: DockviewApi): void {
	const panels = api.panels
	switch (action) {
		case 'new-tab':
			addTab(api)
			break
		case 'close-tab': {
			if (!sourcePanelId) break
			const panel = api.getPanel(sourcePanelId)
			if (panel) api.removePanel(panel)
			break
		}
		case 'open-in-new-window': {
			const id = sourcePanelId ?? api.activePanel?.id
			if (id) openInNewWindow(id)
			break
		}
		case 'next-tab':
		case 'prev-tab': {
			if (panels.length < 2) break
			const idx = panels.findIndex((p) => p.id === api.activePanel?.id)
			const dir = action === 'next-tab' ? 1 : -1
			panels[(idx + dir + panels.length) % panels.length]?.focus()
			break
		}
		default:
			if (action.startsWith('switch-')) {
				const idx = parseInt(action.split('-')[1]) - 1
				panels[idx]?.focus()
			}
	}
}

const components = { webview: WebviewPanel }
const tabComponents = { custom: CustomTab }

export default function App(): React.JSX.Element {
	const apiRef = useRef<DockviewApi | null>(null)

	const handleReady = useCallback((event: DockviewReadyEvent) => {
		const api = event.api
		apiRef.current = api

		setShortcutHandler((action, panelId) => handleShortcut(action, panelId, api))
		setOpenUrlHandler((url) => addTab(api, url))

		// dockview's authoritative "layout settled" signal — the reliable trigger to resume
		// views after a tab drag (DOM dragend/mouseup are unreliable, see webviewManager).
		api.onDidLayoutChange(() => onDockviewLayoutChange())

		window.tabAPI.onShortcut((action) => handleShortcut(action, api.activePanel?.id, api))
		window.tabAPI.onReloadTab((tabId) => reloadView(tabId))
		window.tabAPI.onCloseTab((tabId) => {
			const panel = api.getPanel(tabId)
			if (panel) api.removePanel(panel)
		})
		window.tabAPI.onCloseOtherTabs((keepId) => {
			api.panels.filter((p) => p.id !== keepId).forEach((p) => api.removePanel(p))
		})
		window.tabAPI.onOpenUrl((url) => addTab(api, url))

		addTab(api, startupUrl)
	}, [])

	useEffect(() => {
		const isMac = window.tabAPI.platform === 'darwin'
		const handler = (e: KeyboardEvent): void => {
			const mod = isMac ? e.metaKey : e.ctrlKey
			if (!mod) return
			const api = apiRef.current
			if (!api) return
			if (e.key === 't') {
				e.preventDefault()
				addTab(api)
			} else if (e.key === 'w') {
				e.preventDefault()
				handleShortcut('close-tab', api.activePanel?.id, api)
			} else if (e.key === 'Tab') {
				e.preventDefault()
				handleShortcut(e.shiftKey ? 'prev-tab' : 'next-tab', undefined, api)
			} else if (e.key === ',') {
				e.preventDefault()
				handleShortcut('open-in-new-window', api.activePanel?.id, api)
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [])

	return (
		<div style={{ height: '100%', width: '100%' }}>
			<DockviewReact
				components={components}
				tabComponents={tabComponents}
				onReady={handleReady}
				theme={themeAbyss}
			/>
		</div>
	)
}
