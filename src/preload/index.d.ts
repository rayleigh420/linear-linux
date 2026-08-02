import { ElectronAPI } from '@electron-toolkit/preload'

interface TabAPI {
	platform: string
	openExternal: (url: string) => void
	openNewWindow: (url: string) => void
	showContextMenu: (tabId: string) => void
	onShortcut: (cb: (action: string) => void) => void
	onReloadTab: (cb: (tabId: string) => void) => void
	onCloseTab: (cb: (tabId: string) => void) => void
	onCloseOtherTabs: (cb: (tabId: string) => void) => void
	onOpenUrl: (cb: (url: string) => void) => void
}

declare global {
	interface Window {
		electron: ElectronAPI
		tabAPI: TabAPI
	}
}
