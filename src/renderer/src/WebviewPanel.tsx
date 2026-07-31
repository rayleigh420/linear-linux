import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { createWebview, removeWebview, syncWebviewPosition, hideWebview } from './webviewManager'

export interface WebviewPanelParams {
  url: string
  preloadPath: string
}

export function WebviewPanel({ api, params }: IDockviewPanelProps<WebviewPanelParams>): React.JSX.Element {
  const placeholderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = api.id
    const placeholder = placeholderRef.current!

    createWebview(id, params.url, params.preloadPath, (title) => {
      api.setTitle(title)
    })

    // Sync position whenever the placeholder is resized (split resize, tab drag)
    const observer = new ResizeObserver(() => syncWebviewPosition(id, placeholder))
    observer.observe(placeholder)

    // Explicit visibility signal from dockview when switching tabs
    const disposeVis = api.onDidVisibilityChange((e) => {
      if (!e.isVisible) {
        hideWebview(id)
      } else {
        requestAnimationFrame(() => syncWebviewPosition(id, placeholder))
      }
    })

    // Initial position after first layout frame
    requestAnimationFrame(() => syncWebviewPosition(id, placeholder))

    return () => {
      observer.disconnect()
      disposeVis.dispose()
      removeWebview(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={placeholderRef} style={{ width: '100%', height: '100%' }} />
}
