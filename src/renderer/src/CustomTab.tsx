import { useEffect, useState } from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview-react'

export function CustomTab({ api, containerApi }: IDockviewPanelHeaderProps): React.JSX.Element {
	const [title, setTitle] = useState(api.title || 'Linear')

	useEffect(() => {
		const disposable = api.onDidTitleChange((e) => {
			setTitle(e.title || 'Linear')
		})
		return () => disposable.dispose()
	}, [api])

	const handleContextMenu = (e: React.MouseEvent): void => {
		e.preventDefault()
		window.tabAPI.showContextMenu(api.id)
	}

	const handleMouseDown = (e: React.MouseEvent): void => {
		if (e.button !== 1) return
		e.preventDefault()
		const panel = containerApi.getPanel(api.id)
		if (panel) containerApi.removePanel(panel)
	}

	return (
		<div className="tab-item" onContextMenu={handleContextMenu} onMouseDown={handleMouseDown}>
			<div className="tab-dot" />
			<span className="tab-title">{title}</span>
		</div>
	)
}
