// Composes per-area artwork bitmaps into one CanvasTexture per garment panel.
// Textures are created once per model and only flagged `needsUpdate` afterwards.
import * as THREE from 'three'
import type { Finish, GarmentModel, PrintArea } from '../core/types'

export type AreaBitmap = HTMLCanvasElement | ImageBitmap

interface PanelTex { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; ppi: number }

const MAX_PANEL_PX = 2048

let stitchTile: HTMLCanvasElement | null = null
function stitches(): HTMLCanvasElement {
  if (stitchTile) return stitchTile
  const c = document.createElement('canvas')
  c.width = c.height = 12
  const x = c.getContext('2d')!
  x.strokeStyle = 'rgba(255,255,255,0.35)'
  x.lineWidth = 1.2
  x.beginPath(); x.moveTo(0, 12); x.lineTo(12, 0); x.stroke()
  x.strokeStyle = 'rgba(0,0,0,0.28)'
  x.beginPath(); x.moveTo(0, 14); x.lineTo(14, 0); x.stroke()
  return (stitchTile = c)
}

export class PrintSurface {
  readonly panels = new Map<string, PanelTex>()
  private bitmaps = new Map<string, AreaBitmap>()
  finish: Finish = 'soft'
  guides: { areaId: string | null; show: boolean } = { areaId: null, show: false }
  onUpdate: () => void = () => {}
  readonly model: GarmentModel

  constructor(model: GarmentModel, ppi: number) {
    this.model = model
    for (const p of model.panels) {
      const scale = Math.min(ppi, MAX_PANEL_PX / Math.max(p.widthIn, p.heightIn))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(2, Math.round(p.widthIn * scale))
      canvas.height = Math.max(2, Math.round(p.heightIn * scale))
      const texture = new THREE.CanvasTexture(canvas)
      // glTF UVs start at the top; procedural geometry uses bottom-origin UVs.
      texture.flipY = model.source.type !== 'glb'
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      texture.generateMipmaps = true
      this.panels.set(p.id, { canvas, ctx: canvas.getContext('2d')!, texture, ppi: scale })
    }
  }

  areasOn(panelId: string): PrintArea[] {
    return this.model.printAreas.filter((a) => a.panel === panelId)
  }

  setAreaBitmap(areaId: string, bmp: AreaBitmap | null) {
    if (bmp) this.bitmaps.set(areaId, bmp)
    else this.bitmaps.delete(areaId)
    const area = this.model.printAreas.find((a) => a.id === areaId)
    if (area) this.compose(area.panel)
  }

  setFinish(f: Finish) {
    if (f === this.finish) return
    this.finish = f
    this.composeAll()
  }

  setGuides(areaId: string | null, show: boolean) {
    const prev = this.guides.areaId
    this.guides = { areaId, show }
    const panels = new Set([prev, areaId].map((id) => this.model.printAreas.find((a) => a.id === id)?.panel).filter(Boolean) as string[])
    panels.forEach((p) => this.compose(p))
  }

  composeAll() {
    for (const id of this.panels.keys()) this.compose(id)
  }

  compose(panelId: string) {
    const pt = this.panels.get(panelId)
    if (!pt) return
    const { ctx, canvas, ppi } = pt
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const area of this.areasOn(panelId)) {
      const bmp = this.bitmaps.get(area.id)
      const x = area.rect.xIn * ppi, y = area.rect.yIn * ppi, w = area.rect.wIn * ppi, h = area.rect.hIn * ppi
      if (bmp) {
        if (this.finish === 'embroidery') this.drawEmbroidered(ctx, bmp, x, y, w, h)
        else {
          ctx.globalAlpha = this.finish === 'dye' ? 1 : 0.97
          ctx.drawImage(bmp, x, y, w, h)
          ctx.globalAlpha = 1
        }
      }
      if (this.guides.show && this.guides.areaId === area.id) {
        ctx.save()
        ctx.lineWidth = Math.max(2, ppi * 0.06)
        ctx.setLineDash([ppi * 0.25, ppi * 0.15])
        ctx.strokeStyle = 'rgba(40,120,255,0.9)'
        ctx.strokeRect(x, y, w, h)
        ctx.restore()
      }
    }
    pt.texture.needsUpdate = true
    this.onUpdate()
  }

  /** Visualisation only: thread hatch + raised edge. Real stitch output comes from digitising. */
  private drawEmbroidered(ctx: CanvasRenderingContext2D, bmp: AreaBitmap, x: number, y: number, w: number, h: number) {
    const tmp = document.createElement('canvas')
    tmp.width = Math.max(1, Math.round(w)); tmp.height = Math.max(1, Math.round(h))
    const t = tmp.getContext('2d')!
    t.drawImage(bmp, 0, 0, tmp.width, tmp.height)
    t.globalCompositeOperation = 'source-atop'
    t.fillStyle = t.createPattern(stitches(), 'repeat')!
    t.fillRect(0, 0, tmp.width, tmp.height)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 2
    ctx.shadowOffsetY = 1
    ctx.drawImage(tmp, x, y)
    ctx.restore()
  }

  /** Canvas-space inches → area hit test used by 3D raycasting. */
  hitArea(panelId: string, u: number, v: number) {
    const panel = this.model.panels.find((p) => p.id === panelId)
    if (!panel) return null
    const xIn = u * panel.widthIn, yIn = (this.model.source.type === 'glb' ? v : 1 - v) * panel.heightIn
    for (const a of this.areasOn(panelId)) {
      const lx = xIn - a.rect.xIn, ly = yIn - a.rect.yIn
      if (lx >= 0 && ly >= 0 && lx <= a.rect.wIn && ly <= a.rect.hIn) return { area: a, xIn: lx, yIn: ly }
    }
    return null
  }

  /** Frees GPU memory only. Canvases stay intact so a remount (React StrictMode) can reuse the surface; three re-uploads on next use. */
  dispose() {
    for (const p of this.panels.values()) p.texture.dispose()
  }
}
