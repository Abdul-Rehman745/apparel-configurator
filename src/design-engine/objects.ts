// Factories for every design object type. All objects carry `uid`, `name`, `kind`.
import { Circle, Ellipse, FabricImage, Group, IText, Line, loadSVGFromString, Path, Polygon, Rect, Triangle, util, type FabricObject } from 'fabric'
import qrcode from 'qrcode-generator'
import { DESIGN_PPI } from '../core/design'
import { assetUrl, type AssetMeta } from '../assets/assetStore'
import { allClipart, colorizeSvg } from '../assets/clipart'
import { applyPattern, type AnyObj, type PatternSpec } from './docs'
import { loadFont } from './fonts'

export const uid = () => 'o' + Math.random().toString(36).slice(2, 10)

const meta = (name: string, kind: string, extra: Record<string, unknown> = {}) => ({ uid: uid(), name, kind, lockLevel: 'editable', ...extra })

export interface TextOpts { text: string; fontFamily: string; fontSizeIn: number; fill: string; fontWeight?: string | number; name?: string; stroke?: string; strokeWidth?: number; charSpacing?: number }

export async function createText(o: TextOpts): Promise<IText> {
  await loadFont(o.fontFamily)
  return new IText(o.text, {
    fontFamily: o.fontFamily,
    fontSize: o.fontSizeIn * DESIGN_PPI,
    fill: o.fill,
    fontWeight: o.fontWeight ?? 'normal',
    textAlign: 'center',
    stroke: o.stroke,
    strokeWidth: o.strokeWidth ?? 0,
    paintFirst: 'stroke',
    charSpacing: o.charSpacing ?? 0,
    lineHeight: 1.05,
    ...meta(o.name ?? o.text.split('\n')[0].slice(0, 24), 'text', { autoName: !o.name }),
  } as any)
}

export async function createImage(asset: AssetMeta, name = asset.name): Promise<FabricImage> {
  const url = await assetUrl(asset.id)
  if (!url) throw new Error('Asset missing')
  const img = await FabricImage.fromURL(url)
  img.set({ ...meta(name, 'image', { assetId: asset.id }) } as any)
  img.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
  return img
}

export async function createSvg(svgText: string, name: string, kind: 'svg' | 'clipart', extra: Record<string, unknown> = {}): Promise<FabricObject> {
  const { objects, options } = await loadSVGFromString(svgText)
  const items = objects.filter((x): x is FabricObject => !!x)
  if (!items.length) throw new Error('SVG has no drawable content')
  const g = util.groupSVGElements(items, options)
  g.set({ ...meta(name, kind, extra) } as any)
  g.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
  return g
}

export async function createClipart(id: string, color: string): Promise<FabricObject> {
  const c = allClipart().find((x) => x.id === id)
  if (!c) throw new Error(`Unknown clipart ${id}`)
  if (c.textPreset) {
    return createText({ text: c.textPreset.text, fontFamily: c.textPreset.font, fontSizeIn: 4, fill: color, stroke: '#ffffff', strokeWidth: 3, name: c.name })
  }
  return createSvg(colorizeSvg(c.svg, color), c.name, 'clipart', { clipartId: id, premium: c.premium ?? false })
}

/** Re-colour every non-transparent fill/stroke in an SVG/clipart group. */
export function recolor(o: FabricObject, color: string) {
  const apply = (x: AnyObj) => {
    if (x instanceof Group) { x.getObjects().forEach((c) => apply(c as AnyObj)); x.set({ dirty: true }); return }
    const white = (v: unknown) => typeof v === 'string' && /^(#fff(fff)?|white)$/i.test(v)
    if (x.fill && x.fill !== 'none' && !white(x.fill) && typeof x.fill === 'string') x.set({ fill: color })
    if (x.stroke && x.stroke !== 'none' && typeof x.stroke === 'string') x.set({ stroke: color })
  }
  apply(o as AnyObj)
}

export type ShapeKind = 'rect' | 'rounded' | 'circle' | 'ellipse' | 'triangle' | 'star' | 'line' | 'polygon' | 'badge' | 'banner'

function starPoints(n: number, outer: number, inner: number) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer, a = (Math.PI * i) / n - Math.PI / 2
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

export function createShape(kind: ShapeKind, fill: string, sizeIn = 3): FabricObject {
  const s = sizeIn * DESIGN_PPI
  const base = { fill, stroke: '#000000', strokeWidth: 0, strokeUniform: true }
  const m = (n: string) => meta(n, 'shape')
  switch (kind) {
    case 'rect': return new Rect({ width: s, height: s * 0.7, ...base, ...m('Rectangle') } as any)
    case 'rounded': return new Rect({ width: s, height: s * 0.7, rx: s * 0.12, ry: s * 0.12, ...base, ...m('Rounded rectangle') } as any)
    case 'circle': return new Circle({ radius: s / 2, ...base, ...m('Circle') } as any)
    case 'ellipse': return new Ellipse({ rx: s / 2, ry: s / 3, ...base, ...m('Ellipse') } as any)
    case 'triangle': return new Triangle({ width: s, height: s * 0.87, ...base, ...m('Triangle') } as any)
    case 'star': return new Polygon(starPoints(5, s / 2, s / 4.5), { ...base, ...m('Star') } as any)
    case 'polygon': return new Polygon(Array.from({ length: 6 }, (_, i) => ({ x: (s / 2) * Math.cos((Math.PI / 3) * i), y: (s / 2) * Math.sin((Math.PI / 3) * i) })), { ...base, ...m('Hexagon') } as any)
    case 'line': return new Line([0, 0, s, 0], { stroke: fill, strokeWidth: 0.08 * DESIGN_PPI, strokeLineCap: 'round', ...m('Line') } as any)
    case 'badge': return new Polygon(starPoints(16, s / 2, s / 2.3), { ...base, ...m('Badge') } as any)
    case 'banner': return new Path(`M0 0 H${s} L${s * 0.9} ${s * 0.18} L${s} ${s * 0.36} H0 L${s * 0.1} ${s * 0.18} Z`, { ...base, ...m('Banner') } as any)
  }
}

export function createQr(text: string, color: string, sizeIn = 2): FabricObject {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  const p = new Path(d, { fill: color, ...meta('QR code', 'qr', { qrText: text }) } as any)
  p.scale((sizeIn * DESIGN_PPI) / n)
  p.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
  return p
}

export async function createPatternFill(spec: PatternSpec, w: number, h: number, name = 'Pattern'): Promise<FabricObject> {
  const r = new Rect({ width: w, height: h, ...meta(name, 'pattern') } as any)
  await applyPattern(r, spec)
  return r
}
