import { ipcRenderer } from 'electron'

// Intercept keyboard shortcuts while this WebContentsView has focus.
// Send to main process — main routes to the owning renderer with the panelId.
document.addEventListener(
	'keydown',
	(e: KeyboardEvent) => {
		const mod = process.platform === 'darwin' ? e.metaKey : e.ctrlKey
		if (!mod) return

		if (e.key === 't') {
			e.preventDefault()
			ipcRenderer.send('wcv-shortcut', 'new-tab')
		} else if (e.key === 'w') {
			e.preventDefault()
			ipcRenderer.send('wcv-shortcut', 'close-tab')
		} else if (e.key === 'Tab') {
			e.preventDefault()
			ipcRenderer.send('wcv-shortcut', e.shiftKey ? 'prev-tab' : 'next-tab')
		} else if (e.key === ',') {
			e.preventDefault()
			ipcRenderer.send('wcv-shortcut', 'open-in-new-window')
		} else {
			const num = parseInt(e.key)
			if (num >= 1 && num <= 9) {
				e.preventDefault()
				ipcRenderer.send('wcv-shortcut', `switch-${num}`)
			}
		}
	},
	true
)
