// Imperative handles the 3D viewer exposes to the rest of the app (screenshots, zoom, reset).
export interface CaptureOptions { views: string[]; background: 'transparent' | 'studio'; size?: number }
export interface ViewerHandle {
  capture(opts: CaptureOptions): Promise<Record<string, string>>
  zoom(factor: number): void
  element(): HTMLElement | null
  /** Dev-only introspection (scene graph, camera). */
  debug?: () => unknown
}

let handle: ViewerHandle | null = null
export const registerViewer = (h: ViewerHandle | null) => { handle = h }
export const viewer = () => handle

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
