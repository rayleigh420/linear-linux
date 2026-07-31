/**
 * Manages webview elements in a fixed overlay layer outside the React tree.
 * Webviews must NEVER be moved in the DOM after first insertion —
 * any DOM move causes Electron to reload the webview and lose session.
 */

interface WebviewTag extends HTMLElement {
  src: string
  preload: string
  partition: string
  getURL(): string
  reload(): void
}

type ShortcutHandler = (action: string, panelId: string) => void
type OpenUrlHandler = (url: string) => void

const layer = (() => {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1'
  document.body.appendChild(el)
  return el
})()

const webviews = new Map<string, WebviewTag>()
let shortcutHandler: ShortcutHandler | null = null
let openUrlHandler: OpenUrlHandler | null = null
// True while the user is dragging a dockview resize sash
let sashDragging = false

export function setShortcutHandler(h: ShortcutHandler): void {
  shortcutHandler = h
}

export function setOpenUrlHandler(h: OpenUrlHandler): void {
  openUrlHandler = h
}

export function createWebview(
  id: string,
  url: string,
  preloadPath: string,
  onTitleUpdate: (title: string) => void
): void {
  // Guard against StrictMode double-invoke
  if (webviews.has(id)) return

  const wv = document.createElement('webview') as unknown as WebviewTag
  wv.src = url
  wv.preload = preloadPath
  // partition must be set BEFORE the webview is appended to DOM
  wv.partition = 'persist:linear'
  wv.setAttribute('allowpopups', '')
  Object.assign(wv.style, {
    position: 'absolute',
    border: 'none',
    visibility: 'hidden',
    pointerEvents: 'none',
  })

  wv.addEventListener('page-title-updated', (e) => {
    const title = (e as any).title || 'Linear'
    onTitleUpdate(title)
  })

  wv.addEventListener('new-window', (e) => {
    const newUrl = (e as any).url as string | undefined
    if (!newUrl) return
    if (newUrl.startsWith('https://linear.app')) {
      openUrlHandler?.(newUrl)
    } else {
      window.tabAPI.openExternal(newUrl)
    }
  })

  wv.addEventListener('ipc-message', (e) => {
    const ev = e as any
    if (ev.channel === 'shortcut') {
      shortcutHandler?.(ev.args[0] as string, id)
    }
  })

  // Insert into fixed layer — never moved again
  layer.appendChild(wv)
  webviews.set(id, wv)
}

export function removeWebview(id: string): void {
  const wv = webviews.get(id)
  if (wv) {
    wv.remove()
    webviews.delete(id)
  }
}

export function syncWebviewPosition(id: string, placeholder: HTMLElement): void {
  const wv = webviews.get(id)
  if (!wv) return

  const rect = placeholder.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    Object.assign(wv.style, { visibility: 'hidden', pointerEvents: 'none' })
  } else {
    wv.style.top = `${rect.top}px`
    wv.style.left = `${rect.left}px`
    wv.style.width = `${rect.width}px`
    wv.style.height = `${rect.height}px`
    wv.style.visibility = 'visible'
    // Don't restore pointer-events mid-drag — sash drag protection handles that
    if (!sashDragging) {
      wv.style.pointerEvents = 'auto'
    }
  }
}

export function hideWebview(id: string): void {
  const wv = webviews.get(id)
  if (wv) {
    Object.assign(wv.style, { visibility: 'hidden', pointerEvents: 'none' })
  }
}

export function reloadWebview(id: string): void {
  webviews.get(id)?.reload()
}

export function getWebviewUrl(id: string): string | undefined {
  return webviews.get(id)?.getURL?.()
}

// When the user drags a dockview resize sash, the cursor can move over a webview
// which is an OS-level window — it steals mouse events and breaks the drag.
// Fix: disable pointer-events on all webviews for the duration of the sash drag.
;(() => {
  document.addEventListener('mousedown', (e) => {
    if (!(e.target as HTMLElement).closest?.('.dv-sash')) return
    sashDragging = true
    webviews.forEach((wv) => {
      wv.style.pointerEvents = 'none'
    })
    window.addEventListener(
      'mouseup',
      () => {
        sashDragging = false
        webviews.forEach((wv) => {
          if (wv.style.visibility !== 'hidden') {
            wv.style.pointerEvents = 'auto'
          }
        })
      },
      { once: true }
    )
  })
})()
