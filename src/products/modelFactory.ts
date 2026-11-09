// Turns a procedural garment spec into a full GarmentModel (panels + standard print areas).
// GLB models skip this and declare panels/areas explicitly in the catalog or admin.
import type { Exclusion, GarmentModel, LicenseInfo, Panel, PrintArea, ProceduralGarment, RectIn } from '../core/types'
import { bodyDims, measureGarment } from '../3d/garmentMath'

export const INTERNAL_LICENSE: LicenseInfo = {
  source: 'internal',
  author: 'Generated in-code (procedural geometry)',
  license: 'Proprietary – owned by platform operator',
  attributionRequired: false,
  redistribution: 'embedded-only',
  modifications: 'n/a – authored in-house',
}

const ALL = ['dtg', 'dtf', 'screen', 'vinyl']
const SMALL = ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery']

/** Area centred horizontally at cx with its top edge at top (panel inches). */
function centred(cx: number, top: number, w: number, h: number): RectIn {
  return { xIn: cx - w / 2, yIn: top, wIn: w, hIn: h }
}

/** Intersect a panel-space rect with an area rect, returning it in area-local coordinates. */
function localExclusion(area: RectIn, ex: RectIn, id: string, label: string, kind: Exclusion['kind']): Exclusion | null {
  const x0 = Math.max(area.xIn, ex.xIn), y0 = Math.max(area.yIn, ex.yIn)
  const x1 = Math.min(area.xIn + area.wIn, ex.xIn + ex.wIn), y1 = Math.min(area.yIn + area.hIn, ex.yIn + ex.hIn)
  if (x1 <= x0 || y1 <= y0) return null
  return { id, label, kind, xIn: x0 - area.xIn, yIn: y0 - area.yIn, wIn: x1 - x0, hIn: y1 - y0 }
}

export interface ModelOptions {
  id: string
  label: string
  garment: ProceduralGarment
  /** Sublimation/all-over products: whole panels become print areas with seam exclusions. */
  allOver?: boolean
  multiZone?: boolean
  /** Cloth-simulated GLB built from this spec by models/sew_garment.py (same panels, so the same print areas). */
  glb?: string
}

export function proceduralModel(opts: ModelOptions): GarmentModel {
  const model = buildModel(opts)
  if (!opts.glb) return model
  return {
    ...model,
    source: { type: 'glb', url: opts.glb, unit: 'm', garment: opts.garment },
    panels: model.panels.map((p) => ({ ...p, mesh: `shirt_${p.id}` })),
    license: SEWN_LICENSE,
  }
}

export const SEWN_LICENSE: LicenseInfo = {
  ...INTERNAL_LICENSE,
  author: 'Generated in-house: pattern drafting + Blender cloth simulation (models/sew_garment.py)',
}

function buildModel({ id, label, garment: g, allOver, multiZone }: ModelOptions): GarmentModel {
  const m = measureGarment(g)
  const zone = (z: string) => (multiZone ? z : 'body')
  const panels: Panel[] = [
    { id: 'front', label: 'Front', widthIn: m.front.w, heightIn: m.front.h, colorZone: 'body' },
    { id: 'back', label: 'Back', widthIn: m.back.w, heightIn: m.back.h, colorZone: 'body' },
    { id: 'back_inside', label: 'Inside back', widthIn: m.back.w, heightIn: m.back.h, colorZone: 'body' },
  ]
  if (m.sleeve) {
    panels.push({ id: 'left_sleeve', label: 'Left sleeve', widthIn: m.sleeve.w, heightIn: m.sleeve.h, colorZone: zone('sleeves') })
    panels.push({ id: 'right_sleeve', label: 'Right sleeve', widthIn: m.sleeve.w, heightIn: m.sleeve.h, colorZone: zone('sleeves') })
  }
  if (m.cuff) {
    panels.push({ id: 'left_cuff', label: 'Left cuff', widthIn: m.cuff.w, heightIn: m.cuff.h, colorZone: zone('cuffs') })
    panels.push({ id: 'right_cuff', label: 'Right cuff', widthIn: m.cuff.w, heightIn: m.cuff.h, colorZone: zone('cuffs') })
  }
  if (m.collar) panels.push({ id: 'collar', label: 'Collar', widthIn: m.collar.w, heightIn: m.collar.h, colorZone: zone('collar') })

  const colorZones = [{ id: 'body', label: 'Body' }]
  if (multiZone) {
    if (m.sleeve) colorZones.push({ id: 'sleeves', label: 'Sleeves' })
    if (m.cuff) colorZones.push({ id: 'cuffs', label: 'Cuffs' })
    if (m.collar) colorZones.push({ id: 'collar', label: 'Collar' })
  }

  const fw = m.front.w, cx = fw / 2
  const { L } = bodyDims(g)
  // Manufacturing obstacles in front-panel coordinates.
  const obstacles: { rect: RectIn; label: string; kind: Exclusion['kind'] }[] = []
  if (g.placket) {
    const len = g.collar === 'dress' ? m.front.h : 7
    obstacles.push({ rect: centred(cx, 0, 1.6, len), label: g.collar === 'dress' ? 'Button placket' : 'Polo placket', kind: 'button' })
  }
  if (g.pocket) {
    const top = m.front.h - L * 0.4
    obstacles.push({ rect: centred(cx, top, 13, L * 0.3), label: 'Kangaroo pocket', kind: 'pocket' })
  }
  const withObstacles = (rect: RectIn, panel: string) =>
    panel === 'front'
      ? obstacles.flatMap((o, i) => localExclusion(rect, o.rect, `ob${i}`, o.label, o.kind) ?? [])
      : []

  const areas: PrintArea[] = []
  const add = (a: Omit<PrintArea, 'exclusions' | 'safeInsetIn' | 'bleedIn'> & Partial<PrintArea>) =>
    areas.push({ safeInsetIn: 0.25, bleedIn: 0, ...a, exclusions: [...(a.exclusions ?? []), ...withObstacles(a.rect, a.panel)] })

  if (allOver) {
    const seam = (w: number, h: number): Exclusion[] => [
      { id: 'seamL', label: 'Side seam', kind: 'seam', xIn: 0, yIn: 0, wIn: 0.6, hIn: h },
      { id: 'seamR', label: 'Side seam', kind: 'seam', xIn: w - 0.6, yIn: 0, wIn: 0.6, hIn: h },
      { id: 'neck', label: 'Collar', kind: 'collar', xIn: w / 2 - 4.2, yIn: 0, wIn: 8.4, hIn: 1.6 },
      { id: 'hem', label: 'Hem stitching', kind: 'stitching', xIn: 0, yIn: h - 0.8, wIn: w, hIn: 0.8 },
    ]
    for (const p of ['front', 'back'] as const) {
      const pw = m[p].w, ph = m[p].h
      add({ id: `${p}_allover`, label: p === 'front' ? 'Front (all-over)' : 'Back (all-over)', panel: p, rect: { xIn: 0, yIn: 0, wIn: pw, hIn: ph }, bleedIn: 0.5, safeInsetIn: 0.75, methods: ['sublimation'], camera: p, group: 'allover', exclusions: seam(pw, ph) })
    }
    if (m.sleeve) for (const s of ['left_sleeve', 'right_sleeve']) {
      add({ id: `${s}_allover`, label: s === 'left_sleeve' ? 'Left sleeve (all-over)' : 'Right sleeve (all-over)', panel: s, rect: { xIn: 0, yIn: 0, wIn: m.sleeve.w, hIn: m.sleeve.h }, bleedIn: 0.5, safeInsetIn: 0.5, methods: ['sublimation'], camera: s, group: 'allover', exclusions: [
        { id: 'armpit', label: 'Underarm seam', kind: 'armpit', xIn: 0, yIn: 0, wIn: 1, hIn: m.sleeve.h },
        { id: 'armpit2', label: 'Underarm seam', kind: 'armpit', xIn: m.sleeve.w - 1, yIn: 0, wIn: 1, hIn: m.sleeve.h },
      ] })
    }
    return { id, label, source: { type: 'procedural', garment: g }, panels, colorZones, printAreas: areas, license: INTERNAL_LICENSE }
  }

  const bigW = Math.min(12, fw - 6)
  const bigTop = g.collar === 'hood' ? 5 : 4
  const bigH = g.pocket ? Math.min(14, m.front.h - L * 0.4 - bigTop - 0.5) : Math.min(14, m.front.h - bigTop - 6)
  const chestOff = Math.min(4.5, fw / 2 - 3)
  const chestTop = g.collar === 'hood' ? 5.5 : 4.2

  if (g.collar !== 'dress') {
    add({ id: 'full_front', label: 'Full front', panel: 'front', rect: centred(cx, bigTop, bigW, bigH), methods: [...ALL], camera: 'front', group: 'large', conflictsWith: ['left_chest', 'right_chest'] })
  }
  // Wearer's left chest is on the viewer's right when looking at the front.
  add({ id: 'left_chest', label: 'Left chest', panel: 'front', rect: centred(cx + chestOff, chestTop, 4, 4), methods: [...SMALL], camera: 'front', group: 'small', conflictsWith: g.collar !== 'dress' ? ['full_front'] : [] })
  add({ id: 'right_chest', label: 'Right chest', panel: 'front', rect: centred(cx - chestOff, chestTop, 4, 4), methods: [...SMALL], camera: 'front', group: 'small', conflictsWith: g.collar !== 'dress' ? ['full_front'] : [] })

  const bw = m.back.w, bcx = bw / 2
  add({ id: 'full_back', label: 'Full back', panel: 'back', rect: centred(bcx, 5, bigW, Math.min(14, m.back.h - 11)), methods: [...ALL], camera: 'back', group: 'large', conflictsWith: ['upper_back', 'lower_back'] })
  add({ id: 'upper_back', label: 'Upper back', panel: 'back', rect: centred(bcx, 3.2, Math.min(11, bw - 6), 3), methods: [...SMALL], camera: 'back', group: 'small', conflictsWith: ['full_back'] })
  add({ id: 'lower_back', label: 'Lower back', panel: 'back', rect: centred(bcx, m.back.h - 7.5, Math.min(11, bw - 6), 3), methods: [...ALL], camera: 'back', group: 'small', conflictsWith: ['full_back'] })
  if (g.collar !== 'hood') {
    add({ id: 'outside_neck', label: 'Outside neck', panel: 'back', rect: centred(bcx, 1.1, 3, 1.3), methods: ['dtg', 'dtf', 'screen', 'embroidery'], camera: 'back', group: 'label', safeInsetIn: 0.1 })
    add({ id: 'inside_neck', label: 'Inside neck label', panel: 'back_inside', rect: centred(bcx, 1.1, 3, 2), methods: ['dtg', 'dtf', 'screen'], camera: 'neck', group: 'label', safeInsetIn: 0.1 })
  }
  if (m.sleeve) {
    const sw = m.sleeve.w, long = m.sleeve.h > 14
    const w = long ? 3 : 3.5, h = long ? Math.min(14, m.sleeve.h - 5) : Math.min(3.5, m.sleeve.h - 2.5)
    add({ id: 'left_sleeve', label: 'Left sleeve', panel: 'left_sleeve', rect: centred(sw / 2, 1.6, w, h), methods: [...SMALL], camera: 'left_sleeve', group: 'sleeve' })
    add({ id: 'right_sleeve', label: 'Right sleeve', panel: 'right_sleeve', rect: centred(sw / 2, 1.6, w, h), methods: [...SMALL], camera: 'right_sleeve', group: 'sleeve' })
  }
  if (m.cuff) {
    add({ id: 'left_cuff', label: 'Left cuff', panel: 'left_cuff', rect: centred(m.cuff.w / 2, 0.55, 2.6, 1.4), methods: ['embroidery', 'dtf', 'vinyl'], camera: 'left_sleeve', group: 'label', safeInsetIn: 0.1 })
    add({ id: 'right_cuff', label: 'Right cuff', panel: 'right_cuff', rect: centred(m.cuff.w / 2, 0.55, 2.6, 1.4), methods: ['embroidery', 'dtf', 'vinyl'], camera: 'right_sleeve', group: 'label', safeInsetIn: 0.1 })
  }
  if (m.collar) {
    add({ id: 'collar', label: 'Collar', panel: 'collar', rect: centred(m.collar.w / 2, 0.35, 4, 1.1), methods: ['embroidery', 'dtf'], camera: 'neck', group: 'label', safeInsetIn: 0.1 })
  }
  return { id, label, source: { type: 'procedural', garment: g }, panels, colorZones, printAreas: areas, license: INTERNAL_LICENSE }
}
