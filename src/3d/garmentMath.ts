// Pure maths for procedural garments. World unit = 1 inch, hem at y=0.
// UVs are isometric around the garment's centre lines so a print area's physical
// inches map to the same inches on the 3D surface (within the tolerance of a curved body).
import type { ProceduralGarment } from '../core/types'

export interface Ring { y: number; a: number; b: number }

const ELLIPSE_SAMPLES = 96

/** Arc length of ellipse (a sinθ, b cosθ) from θ0 to θ1. */
export function arcLength(a: number, b: number, t0: number, t1: number, n = ELLIPSE_SAMPLES): number {
  let len = 0
  let px = a * Math.sin(t0), pz = b * Math.cos(t0)
  for (let i = 1; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const x = a * Math.sin(t), z = b * Math.cos(t)
    len += Math.hypot(x - px, z - pz)
    px = x; pz = z
  }
  return len
}

export function bodyDims(g: ProceduralGarment) {
  const drop = g.drop ?? 1
  const a = 0.402 * g.chestIn * drop
  const b = a * (g.kind === 'hoodie' ? 0.6 : 0.55)
  const L = g.lengthIn
  const neckA = g.collar === 'hood' ? 3.8 : 3.4
  const neckB = neckA * 0.88
  const shoulder = g.kind === 'tank' ? 0.72 : 0.97
  return { a, b, L, neckA, neckB, shoulder }
}

/** Key rings from hem (y=0) to neck (y=L). */
export function bodyKeyRings(g: ProceduralGarment): Ring[] {
  const { a, b, L, neckA, neckB, shoulder } = bodyDims(g)
  // Shoulders slope in a straight line from the shoulder point to the neckline (≈25°), like a real tee.
  const as = a * shoulder, drop = 2.2
  const slope = [0.18, 0.4, 0.6, 0.8, 0.93, 1].map((t) => ({ y: L - drop * (1 - t), a: as + (neckA - as) * t, b: b * 0.9 + (neckB - b * 0.9) * t }))
  return [
    { y: 0, a: a * 0.99, b: b * 0.98 },
    { y: L * 0.35, a, b },
    { y: L * 0.66, a, b },
    { y: L - drop - 1.2, a: a * Math.max(shoulder, 0.985), b: b * 0.96 },
    { y: L - drop, a: as, b: b * 0.9 },
    ...slope,
  ]
}

export function ringAt(rings: Ring[], y: number): Ring {
  if (y <= rings[0].y) return rings[0]
  for (let i = 1; i < rings.length; i++) {
    const r0 = rings[i - 1], r1 = rings[i]
    if (y <= r1.y) {
      const t = (y - r0.y) / (r1.y - r0.y)
      // smoothstep keeps the silhouette free of visible kinks between key rings
      const s = t * t * (3 - 2 * t)
      return { y, a: r0.a + (r1.a - r0.a) * s, b: r0.b + (r1.b - r0.b) * s }
    }
  }
  return rings[rings.length - 1]
}

/** Rows sampled from neck (index 0) down to hem, with distance-from-top along the front centre line. */
export function bodyRows(g: ProceduralGarment, count = 64) {
  const rings = bodyKeyRings(g)
  const { L } = bodyDims(g)
  const rows: (Ring & { dTop: number })[] = []
  let d = 0
  // Denser rows across the shoulder slope (top 4"), where curvature changes fastest.
  const top = Math.min(4, L / 4), nTop = Math.round(count * 0.3)
  const ys = [...Array.from({ length: nTop }, (_, i) => L - (top * i) / nTop), ...Array.from({ length: count - nTop + 1 }, (_, i) => L - top - ((L - top) * i) / (count - nTop))]
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i]
    const r = ringAt(rings, y)
    if (i > 0) {
      const p = rows[i - 1]
      d += Math.hypot(p.y - r.y, p.b - r.b)
    }
    rows.push({ ...r, dTop: d })
  }
  return rows
}

export function sleeveDims(g: ProceduralGarment) {
  if (g.kind === 'tank' || g.sleeveLengthIn <= 0) return null
  const { a, L, shoulder } = bodyDims(g)
  const long = g.sleeveLengthIn > 14
  const r0 = 0.2 * a + 1.55 // ≈ 9–10" armhole half-circumference on an adult M
  const r1 = long ? 1.9 : r0 * 0.9
  const angle = long ? 0.32 : 0.95 // radians away from hanging straight down
  const attach = { x: a * shoulder * 0.93, y: L - 2.2 - r0 * 0.55 }
  return { r0, r1, length: g.sleeveLengthIn, angle, attach, long }
}

export const CUFF_LENGTH = 2.5
export const COLLAR_HEIGHT = 1.8

export interface GarmentMeasure {
  height: number
  front: { w: number; h: number }
  back: { w: number; h: number }
  sleeve: { w: number; h: number } | null
  cuff: { w: number; h: number } | null
  collar: { w: number; h: number } | null
}

export function measureGarment(g: ProceduralGarment): GarmentMeasure {
  const { a, b, L } = bodyDims(g)
  const rows = bodyRows(g)
  const halfW = arcLength(a, b, -Math.PI / 2, Math.PI / 2)
  const h = rows[rows.length - 1].dTop
  const s = sleeveDims(g)
  const hasCuff = !!(s && g.cuffs)
  const collar = g.collar === 'polo' || g.collar === 'dress'
  const neck = bodyDims(g)
  return {
    height: L + (g.collar === 'hood' ? 10 : collar ? COLLAR_HEIGHT : 0),
    front: { w: halfW, h },
    back: { w: halfW, h },
    sleeve: s ? { w: 2 * Math.PI * s.r0, h: s.length } : null,
    cuff: hasCuff && s ? { w: 2 * Math.PI * s.r1 * 1.04, h: CUFF_LENGTH } : null,
    collar: collar ? { w: arcLength(neck.neckA * 1.05, neck.neckB * 1.05, 0, Math.PI * 2), h: COLLAR_HEIGHT } : null,
  }
}
