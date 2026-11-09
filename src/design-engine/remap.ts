// Recalculates artwork transforms when the customer switches garment model.
// Artwork keeps its position relative to the area centre and is uniformly scaled only
// when the destination area is smaller/larger — coordinates are never copied blindly.
import { DESIGN_PPI, type AreaDesign } from '../core/design'
import type { PrintArea } from '../core/types'

export function remapArea(doc: AreaDesign, from: PrintArea, to: PrintArea): AreaDesign {
  const ow = from.rect.wIn * DESIGN_PPI, oh = from.rect.hIn * DESIGN_PPI
  const nw = to.rect.wIn * DESIGN_PPI, nh = to.rect.hIn * DESIGN_PPI
  if (ow === nw && oh === nh) return doc
  // Only shrink to fit; never enlarge artwork (that would drop its DPI without the customer asking).
  const s = Math.min(1, nw / ow, nh / oh)
  const mx = (x: number) => nw / 2 + (x - ow / 2) * s
  const my = (y: number) => nh / 2 + (y - oh / 2) * s
  const json = doc.json
    ? {
        ...doc.json,
        width: nw,
        height: nh,
        objects: ((doc.json.objects as Record<string, number>[]) ?? []).map((o) => ({
          ...o,
          left: mx(o.left ?? 0),
          top: my(o.top ?? 0),
          scaleX: (o.scaleX ?? 1) * s,
          scaleY: (o.scaleY ?? 1) * s,
        })),
      }
    : null
  const objects = doc.objects.map((o) => ({
    ...o,
    bbox: { x: mx(o.bbox.x), y: my(o.bbox.y), w: o.bbox.w * s, h: o.bbox.h * s },
    image: o.image && { ...o.image, displayW: o.image.displayW * s, displayH: o.image.displayH * s },
    textHeightIn: o.textHeightIn !== undefined ? o.textHeightIn * s : undefined,
    minStrokeIn: o.minStrokeIn !== undefined ? o.minStrokeIn * s : undefined,
  }))
  return { json, objects }
}

/** Maps every area present in both models; areas missing from the new model are kept (orphaned) so switching back restores them. */
export function remapAreas(areas: Record<string, AreaDesign>, fromAreas: PrintArea[], toAreas: PrintArea[]) {
  const out: Record<string, AreaDesign> = {}
  for (const [id, doc] of Object.entries(areas)) {
    const f = fromAreas.find((a) => a.id === id), t = toAreas.find((a) => a.id === id)
    out[id] = f && t ? remapArea(doc, f, t) : doc
  }
  return out
}
