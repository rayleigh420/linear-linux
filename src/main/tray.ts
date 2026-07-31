import { app, Menu, Tray, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { focusOrCreate } from './window'
import { setQuitting } from './state'
import { Updater } from './updater'

function getIconPath(): string {
  if (is.dev) return join(__dirname, '../../resources/icon.png')
  return join(process.resourcesPath, 'icon.png')
}

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 22, height: 22 })
  const tray = new Tray(icon)
  const label = is.dev ? 'Linear [DEV]' : 'Linear'
  tray.setToolTip(label)
  tray.on('click', focusOrCreate)
  tray.on('double-click', focusOrCreate)

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${label}`, click: focusOrCreate },
      { type: 'separator' },
      { label: 'Check for Updates', click: () => Updater.check(true) },
      { type: 'separator' },
      {
        label: `Quit ${label}`,
        click: () => {
          setQuitting(true)
          // Destroy windows directly so the close handlers don't block quit
          BrowserWindow.getAllWindows().forEach((w) => w.destroy())
          // Destroy tray before exiting so AppIndicator removes the icon
          tray.destroy()
          app.exit(0)
        }
      }
    ])
  )

  return tray
}
