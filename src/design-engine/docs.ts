// Fabric document helpers shared by the live editor, offscreen texture rendering and production export.
import { FabricImage, FabricObject, Group, IText, Path, Pattern, StaticCanvas, type Canvas } from 'fabric'
import { DESIGN_PPI, type AreaDesign, type BulkRow, type ObjectKind, type ObjectSummary } from '../core/design'
import type { PrintArea } from '../core/types'
import { assetUrl } from '../assets/assetStore'
import { allClipart, colorizeSvg } from '../assets/clipart'
import { loadFont } from './fonts'

export type AnyObj = FabricObject & Record<string, any>

export interface PatternSpec {
  assetId?: string
  clipartId?: string
  color?: string
  /** Tile width in design units. */
  tile: number
  spacingX: number
  spacingY: number
  rotation: number
  offsetX: number
  offsetY: number
  mode: 'repeat' | 'mirror' | 'brick' | 'half-drop'
  sourceW?: number
  sourceH?: number
}

const MISSING_PX = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fde2e2"/><path d="M60 60l80 80M140 60l-80 80" stroke="#d23b3b" stroke-width="10"/></svg>')

// ---------- serialisation ----------

function walk(objs: any[] | undefined, fn: (o: any) => void) {
  for (const o of objs ?? []) {
    fn(o)
    if (o.objects) walk(o.objects, fn)
  }
}

/** Canvas → storable JSON: raster sources become asset references, patterns become specs. */
export function toStoredJSON(canvas: Canvas | StaticCanvas): Record<string, unknown> {
  const json = canvas.toObject() as { objects: any[] }
  walk(json.objects, (o) => {
    if (o.assetId && o.type?.toLowerCase() === 'image') o.src = ''
    if (o.patternSpec) o.fill = '#d9d9d9'
    if (o.curve) delete o.path // rebuilt deterministically from `curve`
  })
  return json as unknown as Record<string, unknown>
}

/** Stored JSON → loadable JSON (resolves asset URLs). Returns asset ids that could not be found. */
export async function hydrateJSON(json: Record<string, unknown>): Promise<{ json: Record<string, unknown>; missing: string[] }> {
  const copy = structuredClone(json) as { objects: any[] }
  const missing: string[] = []
  const tasks: Promise<void>[] = []
  walk(copy.objects, (o) => {
    if (o.assetId && o.type?.toLowerCase() === 'image') {
      tasks.push(assetUrl(o.assetId).then((u) => {
        if (u) o.src = u
        else { o.src = MISSING_PX; missing.push(o.assetId) }
      }))
    }
    if (o.fontFamily) tasks.push(loadFont(o.fontFamily).then(() => undefined))
  })
  await Promise.all(tasks)
  return { json: copy as unknown as Record<string, unknown>, missing }
}

/** Post-load fix-ups that can't live in JSON: patterns and curved text paths. */
export async function reviveSpecials(objs: FabricObject[]) {
  for (const o of objs as AnyObj[]) {
    if (o.patternSpec) await applyPattern(o, o.patternSpec)
    if (o.curve && o instanceof IText) applyCurve(o, (o as AnyObj).curve)
    if (o instanceof Group) await reviveSpecials(o.getObjects())
  }
}

// ---------- curved text ----------

export function applyCurve(t: IText, curve: number) {
  const anyT = t as AnyObj
  t.set({ path: undefined })
  anyT.curve = curve
  t.initDimensions()
  if (!curve) {
    t.set({ editable: true })
    t.setCoords()
    return
  }
  const w = Math.max(10, t.calcTextWidth())
  const a = (Math.min(100, Math.abs(curve)) / 100) * Math.PI * 1.8
  const R = w / a
  const sx = R * Math.sin(a / 2), dy = R * (1 - Math.cos(a / 2))
  const large = a > Math.PI ? 1 : 0
  const d = curve > 0
    ? `M ${-sx} ${dy} A ${R} ${R} 0 ${large} 1 ${sx} ${dy}`
    : `M ${-sx} ${-dy} A ${R} ${R} 0 ${large} 0 ${sx} ${-dy}`
  t.set({ path: new Path(d, { visible: false, fill: '', stroke: '' }), pathSide: 'left', pathAlign: 'center', pathStartOffset: 0, editable: false })
  t.initDimensions()
  t.setCoords()
}

// ---------- patterns ----------

async function loadImg(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  return img
}

export async function patternSource(spec: PatternSpec): Promise<HTMLImageElement | null> {
  if (spec.assetId) {
    const u = await assetUrl(spec.assetId)
    return u ? loadImg(u) : null
  }
  const c = allClipart().find((x) => x.id === spec.clipartId)
  if (!c?.svg) return null
  return loadImg('data:image/svg+xml;utf8,' + encodeURIComponent(colorizeSvg(c.svg, spec.color ?? '#111111')))
}

export function buildTile(img: CanvasImageSource & { width: number; height: number }, spec: PatternSpec): HTMLCanvasElement {
  const aspect = (img.height || 1) / (img.width || 1)
  const sw = Math.max(2, spec.tile), sh = Math.max(2, spec.tile * aspect)
  const cw = sw + spec.spacingX, ch = sh + spec.spacingY
  const c = document.createElement('canvas')
  const wide = spec.mode === 'mirror' || spec.mode === 'half-drop'
  const tall = spec.mode === 'mirror' || spec.mode === 'brick'
  c.width = Math.ceil(cw * (wide ? 2 : 1)); c.height = Math.ceil(ch * (tall ? 2 : 1))
  const x = c.getContext('2d')!
  const draw = (dx: number, dy: number, fx = 1, fy = 1) => {
    x.save(); x.translate(dx + cw / 2, dy + ch / 2); x.scale(fx, fy); x.drawImage(img, -sw / 2, -sh / 2, sw, sh); x.restore()
  }
  switch (spec.mode) {
    case 'repeat': draw(0, 0); break
    case 'mirror': draw(0, 0); draw(cw, 0, -1, 1); draw(0, ch, 1, -1); draw(cw, ch, -1, -1); break
    case 'brick': draw(0, 0); draw(-cw / 2, ch); draw(cw / 2, ch); break
    case 'half-drop': draw(0, 0); draw(cw, -ch / 2); draw(cw, ch / 2); break
  }
  return c
}

export async function applyPattern(o: FabricObject, spec: PatternSpec) {
  const img = await patternSource(spec)
  const anyO = o as AnyObj
  anyO.patternSpec = spec
  if (!img) { o.set({ fill: '#fde2e2' }); return }
  const tile = buildTile(img, { ...spec, sourceW: img.naturalWidth, sourceH: img.naturalHeight })
  const r = (spec.rotation * Math.PI) / 180
  o.set({
    fill: new Pattern({ source: tile, repeat: 'repeat', offsetX: spec.offsetX, offsetY: spec.offsetY, patternTransform: [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0] }),
    dirty: true,
  })
  anyO.patternSpec = { ...spec, sourceW: img.naturalWidth, sourceH: img.naturalHeight }
}

// ---------- summaries ----------

function collectColors(o: AnyObj, out: Set<string>) {
  const push = (v: unknown) => { if (typeof v === 'string' && v && v !== 'none' && v !== 'transparent' && !v.startsWith('rgba(0,0,0,0')) out.add(v) }
  if (o instanceof Group) o.getObjects().forEach((c) => collectColors(c as AnyObj, out))
  else if (!(o instanceof FabricImage)) {
    push(o.fill); if (o.stroke && o.strokeWidth > 0) push(o.stroke)
    if (o.styles) for (const line of Object.values(o.styles as Record<string, Record<string, { fill?: string }>>)) for (const ch of Object.values(line)) push(ch.fill)
  }
  if (o.patternSpec?.color) out.add(o.patternSpec.color)
}

function hasGradient(o: AnyObj): boolean {
  if (o instanceof Group) return o.getObjects().some((c) => hasGradient(c as AnyObj))
  return !!(o.fill && typeof o.fill === 'object' && 'colorStops' in o.fill)
}

export function kindOf(o: AnyObj): ObjectKind {
  return (o.kind as ObjectKind) ?? (o instanceof IText ? 'text' : o instanceof FabricImage ? 'image' : o instanceof Group ? 'group' : 'shape')
}

export function summarize(objs: FabricObject[]): ObjectSummary[] {
  return (objs as AnyObj[]).map((o) => {
    const r = o.getBoundingRect()
    const kind = kindOf(o)
    const colors = new Set<string>()
    collectColors(o, colors)
    const sx = Math.abs(o.scaleX ?? 1), sy = Math.abs(o.scaleY ?? 1)
    const s: ObjectSummary = {
      id: o.uid, name: o.name ?? kind, kind, visible: o.visible !== false, locked: !!o.lockedLayer, lockLevel: o.lockLevel ?? 'editable',
      required: o.required || undefined, bulkField: o.bulkField || undefined, bbox: { x: r.left, y: r.top, w: r.width, h: r.height },
      colors: [...colors], assetId: o.assetId || o.patternSpec?.assetId || undefined, premium: o.premium || undefined,
      hasShadow: !!o.shadow || undefined, hasGradient: hasGradient(o) || undefined,
    }
    if (o instanceof FabricImage) {
      s.image = { naturalW: o.width, naturalH: o.height, displayW: o.width * sx, displayH: o.height * sy }
    } else if (o.patternSpec?.assetId && o.patternSpec.sourceW) {
      const p = o.patternSpec as PatternSpec
      s.image = { naturalW: p.sourceW!, naturalH: p.sourceH!, displayW: p.tile * sx, displayH: p.tile * (p.sourceH! / p.sourceW!) * sy }
    }
    if (o instanceof IText) {
      s.text = o.text
      s.fontFamily = o.fontFamily
      s.textHeightIn = ((o.fontSize ?? 0) * sy * 0.7) / DESIGN_PPI // approximate cap height
    }
    if (o.stroke && o.strokeWidth > 0) s.minStrokeIn = (o.strokeWidth * Math.min(sx, sy)) / DESIGN_PPI
    return s
  })
}

// ---------- offscreen rendering ----------

function substituteBulk(objs: FabricObject[], row: BulkRow) {
  for (const o of objs as AnyObj[]) {
    const field = o.bulkField as 'name' | 'number' | undefined
    if (o instanceof IText && field) {
      const v = field === 'name' ? row.name : row.number
      const upper = o.text === o.text.toUpperCase()
      o.set({ text: upper ? v.toUpperCase() : v })
      const curve = (o as AnyObj).curve
      if (curve) applyCurve(o, curve)
    }
    if (o instanceof Group) substituteBulk(o.getObjects(), row)
  }
}

/** Loads a stored area document into a throwaway StaticCanvas. Caller must dispose. */
export async function loadDocCanvas(doc: AreaDesign, area: PrintArea, row?: BulkRow) {
  const W = area.rect.wIn * DESIGN_PPI, H = area.rect.hIn * DESIGN_PPI
  const el = document.createElement('canvas')
  const sc = new StaticCanvas(el, { width: W, height: H, enableRetinaScaling: false, renderOnAddRemove: false })
  const { json, missing } = await hydrateJSON(doc.json ?? { objects: [] })
  await sc.loadFromJSON(json)
  sc.backgroundColor = ''
  await reviveSpecials(sc.getObjects())
  if (row) substituteBulk(sc.getObjects(), row)
  return { canvas: sc, missing }
}

/** Renders a stored area at `pxPerIn` (texture preview or production DPI). */
export async function renderDoc(doc: AreaDesign, area: PrintArea, pxPerIn: number, row?: BulkRow): Promise<HTMLCanvasElement> {
  const { canvas } = await loadDocCanvas(doc, area, row)
  try {
    return canvas.toCanvasElement(pxPerIn / DESIGN_PPI)
  } finally {
    canvas.dispose()
  }
}

export async function renderDocSvg(doc: AreaDesign, area: PrintArea, row?: BulkRow): Promise<string> {
  const { canvas } = await loadDocCanvas(doc, area, row)
  try {
    // Physical dimensions in the SVG root; viewBox in design units — vectors stay vectors.
    return canvas.toSVG({ width: `${area.rect.wIn}in`, height: `${area.rect.hIn}in`, viewBox: { x: 0, y: 0, width: area.rect.wIn * DESIGN_PPI, height: area.rect.hIn * DESIGN_PPI } })
  } finally {
    canvas.dispose()
  }
}
