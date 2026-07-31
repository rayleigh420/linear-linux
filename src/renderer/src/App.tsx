import { useCallback, useEffect, useRef } from 'react'
import { DockviewReact, DockviewReadyEvent, themeAbyss } from 'dockview-react'
import type { DockviewApi } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import '../assets/style.css'
import { WebviewPanel, type WebviewPanelParams } from './WebviewPanel'
import { CustomTab } from './CustomTab'
import { setShortcutHandler, setOpenUrlHandler, reloadWebview, getWebviewUrl } from './webviewManager'

const LINEAR_URL = 'https://linear.app'
const preloadPath = window.tabAPI.webviewPreloadPath

// URL passed via query param when this window was opened for a specific page
const startupUrl = new URLSearchParams(window.location.search).get('url') || LINEAR_URL

let tabCounter = 0

function addTab(api: DockviewApi, url = LINEAR_URL): void {
  const id = `tab-${++tabCounter}`
  api.addPanel<WebviewPanelParams>({
    id,
    title: 'Linear',
    component: 'webview',
    tabComponent: 'custom',
    params: { url, preloadPath },
  })
}

function openInNewWindow(panelId: string, api: DockviewApi): void {
  const url = getWebviewUrl(panelId) ?? LINEAR_URL
  window.tabAPI.openNewWindow(url)
  const panel = api.getPanel(panelId)
  if (panel) api.removePanel(panel)
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
      if (id) openInNewWindow(id, api)
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

    window.tabAPI.onShortcut((action) => handleShortcut(action, api.activePanel?.id, api))
    window.tabAPI.onReloadTab((tabId) => reloadWebview(tabId))
    window.tabAPI.onCloseTab((tabId) => {
      const panel = api.getPanel(tabId)
      if (panel) api.removePanel(panel)
    })
    window.tabAPI.onCloseOtherTabs((keepId) => {
      api.panels.filter((p) => p.id !== keepId).forEach((p) => api.removePanel(p))
    })
    window.tabAPI.onOpenUrl((url) => addTab(api, url))

    // startupUrl is either the specific URL passed via query param (when opening
    // a tab in a new window) or the default LINEAR_URL for a fresh window.
    addTab(api, startupUrl)
  }, [])

  // Keyboard shortcuts when focus is in the renderer frame (not inside webview)
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
