import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { createView, removeView, syncViewBounds, hideView } from './webviewManager'

export interface WebviewPanelParams {
	url: string
}

export function WebviewPanel({
	api,
	params
}: IDockviewPanelProps<WebviewPanelParams>): React.JSX.Element {
	const placeholderRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const id = api.id
		const placeholder = placeholderRef.current!
		let visible = true

		createView(id, params.url, (title) => api.setTitle(title))

		const observer = new ResizeObserver(() => {
			if (visible) syncViewBounds(id, placeholder)
		})
		observer.observe(placeholder)

		const disposeVis = api.onDidVisibilityChange((e) => {
			visible = e.isVisible
			if (!e.isVisible) {
				hideView(id)
			} else {
				requestAnimationFrame(() => syncViewBounds(id, placeholder))
			}
		})

		requestAnimationFrame(() => syncViewBounds(id, placeholder))

		return () => {
			observer.disconnect()
			disposeVis.dispose()
			removeView(id)
		}
	}, [])

	return <div ref={placeholderRef} style={{ width: '100%', height: '100%' }} />
}
