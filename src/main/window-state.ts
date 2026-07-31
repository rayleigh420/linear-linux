import { join } from 'path'
import fs from 'fs'

interface Bounds {
  width: number
  height: number
  x: number | null
  y: number | null
}

export class WindowState {
  static #path: string | null = null

  static init(userDataPath: string): void {
    WindowState.#path = join(userDataPath, 'window-state.json')
  }

  static load(): Partial<Bounds> {
    if (!WindowState.#path) return {}
    try {
      const { width, height, x, y } = JSON.parse(
        fs.readFileSync(WindowState.#path, 'utf8')
      ) as Bounds
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return {
          width,
          height,
          x: Number.isFinite(x) ? x : null,
          y: Number.isFinite(y) ? y : null
        }
      }
    } catch (_) {}
    return {}
  }

  static save(bounds: Electron.Rectangle): void {
    if (!WindowState.#path || !bounds) return
    try {
      fs.mkdirSync(join(WindowState.#path, '..'), { recursive: true })
      fs.writeFileSync(WindowState.#path, JSON.stringify(bounds), 'utf8')
    } catch (_) {}
  }
}
