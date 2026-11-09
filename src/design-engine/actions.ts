// High-level "add X to the active print area" actions used by the UI panels.
import { DESIGN_PPI } from '../core/design'
import type { AssetMeta } from '../assets/assetStore'
import { toast, useStore } from '../state/store'
import { track } from '../api/analytics'
import { editor } from './editor'
import { createClipart, createImage, createPatternFill, createQr, createShape, createSvg, createText, type ShapeKind } from './objects'
import { applyCurve, type PatternSpec } from './docs'

function ready() {
  if (!editor.area) { toast('Choose a print area first.'); return false }
  return true
}

const defaultInk = () => {
  const s = useStore.getState()
  const p = s.catalog.products.find((x) => x.id === s.design.productId)
  const body = p?.colors.find((c) => c.id === s.design.colors.body)?.hex ?? '#ffffff'
  // Pick contrasting ink so new artwork is visible on the garment.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(body.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#111111' : '#ffffff'
}

export type TextPreset = 'heading' | 'subheading' | 'body' | 'curved' | 'name' | 'number'

export async function addText(preset: TextPreset, fontFamily?: string) {
  if (!ready()) return
  const s = useStore.getState()
  const font = fontFamily ?? s.design.restrictFonts?.[0] ?? (preset === 'number' || preset === 'name' ? 'Graduate' : 'Montserrat')
  const areaH = editor.H / DESIGN_PPI
  const cfg = {
    heading: { text: 'YOUR TEXT', size: Math.min(1.6, areaH / 5), weight: 700 },
    subheading: { text: 'Subheading', size: Math.min(0.9, areaH / 8), weight: 600 },
    body: { text: 'Add a line of text', size: Math.min(0.5, areaH / 10), weight: 400 },
    curved: { text: 'CURVED TEXT', size: Math.min(1, areaH / 6), weight: 700 },
    name: { text: 'NAME', size: Math.min(1.4, areaH / 5), weight: 400 },
    number: { text: '10', size: Math.min(7, areaH / 1.8), weight: 400 },
  }[preset]
  const t = await createText({ text: cfg.text, fontFamily: font, fontSizeIn: cfg.size, fill: defaultInk(), fontWeight: cfg.weight })
  if (preset === 'name' || preset === 'number') Object.assign(t, { bulkField: preset, name: preset === 'name' ? 'Player name' : 'Player number' })
  if (preset === 'curved') applyCurve(t, 40)
  editor.add(t, 'Add text')
  track('text_added', { preset })
}

export async function addUploaded(meta: AssetMeta, svgText?: string) {
  if (!ready()) return
  const o = svgText ? await createSvg(svgText, meta.name, 'svg', { assetId: meta.id }) : await createImage(meta)
  if (!svgText) {
    // Start rasters at the largest size that still meets the method's minimum DPI (never upscale past it).
    const s = useStore.getState()
    const method = s.catalog.printMethods.find((m) => m.id === s.design.methodId)
    if (method?.minDpi) {
      const maxW = (meta.width / method.minDpi) * DESIGN_PPI
      if (o.getScaledWidth() > maxW) o.scale(maxW / o.width)
    }
  }
  editor.add(o, 'Add image', { fit: 0.8 })
  track('image_uploaded', { kind: meta.kind, width: meta.width, height: meta.height })
}

export async function addClipart(id: string, color = defaultInk()) {
  if (!ready()) return
  try {
    editor.add(await createClipart(id, color), 'Add clipart', { fit: 0.45 })
    track('clipart_added', { id })
  } catch (e) {
    toast((e as Error).message, 'error')
  }
}

export function addShape(kind: ShapeKind, color = defaultInk()) {
  if (!ready()) return
  editor.add(createShape(kind, color, Math.min(3, (editor.W / DESIGN_PPI) * 0.4)), 'Add shape')
}

export function addQr(text: string, color = defaultInk()) {
  if (!ready()) return
  if (!text.trim()) { toast('Enter a link or text for the QR code.'); return }
  editor.add(createQr(text.trim(), color, Math.min(2.5, (editor.W / DESIGN_PPI) * 0.5)), 'Add QR code')
}

export async function addPatternFill(spec: PatternSpec) {
  if (!ready() || !editor.area) return
  const b = editor.area.bleedIn * DESIGN_PPI
  const o = await createPatternFill(spec, editor.W + 2 * b, editor.H + 2 * b, 'Pattern fill')
  editor.add(o, 'Add pattern', { fit: 10 })
  editor.reorder('back')
}
