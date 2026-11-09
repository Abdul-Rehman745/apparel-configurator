// Admin QA aid: fills a print area with a numbered checker so UV placement, orientation
// and stretching can be verified on the 3D garment before a product is published.
import { DESIGN_PPI } from '../core/design'
import { setActiveArea, useStore } from '../state/store'
import { editor } from './editor'
import { uid } from './objects'

export async function fillChecker(areaId: string) {
  setActiveArea(areaId)
  for (let i = 0; i < 40 && editor.area?.id !== areaId; i++) await new Promise((r) => setTimeout(r, 50))
  if (!editor.area) return
  const W = editor.W, H = editor.H, cell = DESIGN_PPI // 1" squares
  const c = document.createElement('canvas')
  c.width = Math.ceil(W / cell) * 64; c.height = Math.ceil(H / cell) * 64
  const x = c.getContext('2d')!
  for (let r = 0; r * 64 < c.height; r++) for (let q = 0; q * 64 < c.width; q++) {
    x.fillStyle = (r + q) % 2 ? '#2f6bff' : '#ffffff'
    x.fillRect(q * 64, r * 64, 64, 64)
    x.fillStyle = (r + q) % 2 ? '#ffffff' : '#1a1a1c'
    x.font = '600 20px system-ui'
    x.fillText(`${String.fromCharCode(65 + (r % 26))}${q + 1}`, q * 64 + 8, r * 64 + 38)
  }
  x.strokeStyle = '#e0245e'; x.lineWidth = 6; x.strokeRect(3, 3, c.width - 6, c.height - 6)
  // Arrow marks "up" so flipped/rotated UVs are obvious.
  x.fillStyle = '#e0245e'; x.beginPath(); x.moveTo(c.width / 2, 8); x.lineTo(c.width / 2 - 24, 48); x.lineTo(c.width / 2 + 24, 48); x.fill()
  const { FabricImage } = await import('fabric')
  const img = new FabricImage(c, { left: W / 2, top: H / 2, originX: 'center', originY: 'center' } as any)
  img.scaleToWidth(W)
  Object.assign(img, { uid: uid(), name: 'Checker (admin test)', kind: 'shape', lockLevel: 'editable' })
  editor.add(img, 'Checker test', { fit: 10 })
  useStore.setState({ mode: 'view' })
}
