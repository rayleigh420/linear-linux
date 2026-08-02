import { dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { setQuitting } from './state'

export class Updater {
	static #isNix = process.execPath.includes('/nix/store')
	static #explicit = false

	static setup(): void {
		if (Updater.#isNix) return

		autoUpdater.autoDownload = false
		autoUpdater.autoInstallOnAppQuit = true

		autoUpdater.on('update-not-available', () => {
			if (Updater.#explicit) {
				Updater.#explicit = false
				dialog.showMessageBox({
					type: 'info',
					title: 'Up to Date',
					message: 'Linear is up to date.'
				})
			}
		})

		autoUpdater.on('update-available', (info) => {
			dialog
				.showMessageBox({
					type: 'info',
					title: 'Update Available',
					message: `Linear v${info.version} is available`,
					detail: 'Download now and install when you quit?',
					buttons: ['Download', 'Later'],
					defaultId: 0
				})
				.then(({ response }) => {
					if (response === 0) autoUpdater.downloadUpdate()
				})
		})

		autoUpdater.on('update-downloaded', () => {
			dialog
				.showMessageBox({
					type: 'info',
					title: 'Update Ready',
					message: 'Update downloaded',
					detail: 'Restart Linear to install the new version.',
					buttons: ['Restart Now', 'Later'],
					defaultId: 0
				})
				.then(({ response }) => {
					if (response === 0) {
						setQuitting(true)
						autoUpdater.quitAndInstall()
					}
				})
		})

		autoUpdater.on('error', () => {})
		setTimeout(() => Updater.check(false), 5000)
	}

	static check(explicit = false): void {
		if (Updater.#isNix) {
			if (explicit)
				dialog.showMessageBox({
					type: 'info',
					title: 'Managed by Nix',
					message: 'Run nix flake update to check for updates.'
				})
			return
		}
		Updater.#explicit = explicit
		autoUpdater.checkForUpdates().catch(() => {
			Updater.#explicit = false
		})
	}
}
