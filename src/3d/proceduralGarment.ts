// Builds a garment as named, UV-mapped meshes. Each printable surface is its own mesh
// (userData.panelId) so print textures map 1:1 to the catalog's panel definitions.
import * as THREE from 'three'
import type { ProceduralGarment } from '../core/types'
import { arcLength, bodyDims, bodyKeyRings, bodyRows, COLLAR_HEIGHT, CUFF_LENGTH, measureGarment, ringAt, sleeveDims } from './garmentMath'

type VertexFn = (row: number, col: number) => { p: [number, number, number]; uv: [number, number] }

/** Grid surface with the same winding as THREE.CylinderGeometry (x = r·sinθ, z = r·cosθ, rows top→bottom). */
function gridGeometry(rows: number, cols: number, fn: VertexFn): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const v = fn(r, c)
    pos.push(...v.p); uv.push(...v.uv)
  }
  const at = (r: number, c: number) => r * (cols + 1) + c
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = at(r, c), b = at(r + 1, c), cc = at(r + 1, c + 1), d = at(r, c + 1)
    idx.push(a, b, d, b, cc, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Half body (front: θ∈[-π/2,π/2], back: θ∈[π/2,3π/2]) with isometric UVs about the centre line. */
function bodyHalf(g: ProceduralGarment, side: 'front' | 'back', panelW: number, panelH: number, mirrorU = false) {
  const rows = bodyRows(g, 72)
  const cols = 56
  const t0 = side === 'front' ? -Math.PI / 2 : Math.PI / 2
  const cache = rows.map((r) => {
    const total = arcLength(r.a, r.b, t0, t0 + Math.PI, 96)
    const s: number[] = []
    for (let c = 0; c <= cols; c++) s.push(arcLength(r.a, r.b, t0, t0 + (Math.PI * c) / cols, 24))
    return { total, s }
  })
  return gridGeometry(rows.length - 1, cols, (ri, c) => {
    const r = rows[ri]
    const t = t0 + (Math.PI * c) / cols
    const { total, s } = cache[ri]
    let u = 0.5 + (s[c] - total / 2) / panelW
    if (mirrorU) u = 1 - u
    return { p: [r.a * Math.sin(t), r.y, r.b * Math.cos(t)], uv: [u, 1 - r.dTop / panelH] }
  })
}

/** A raised patch following the front body surface (plackets, pockets). */
function frontPatch(g: ProceduralGarment, yTop: number, yBottom: number, halfWidthIn: number, lift: number) {
  const rings = bodyKeyRings(g)
  const rows = 12, cols = 16
  return gridGeometry(rows, cols, (ri, c) => {
    const y = yTop - ((yTop - yBottom) * ri) / rows
    const r = ringAt(rings, y)
    const a = r.a + lift, b = r.b + lift
    const tMax = halfWidthIn / b
    const t = -tMax + (2 * tMax * c) / cols
    return { p: [a * Math.sin(t), y, b * Math.cos(t)], uv: [c / cols, 1 - ri / rows] }
  })
}

/** Tube along local −Y from the shoulder (y=0) with UV u centred on θc. */
function tube(len: number, r0: number, r1: number, thetaC: number, uRadius: number, yStart = 0, extraTop = 0) {
  const rows = 24, cols = 40
  const total = len + extraTop
  return gridGeometry(rows, cols, (ri, c) => {
    const d = -extraTop + (total * ri) / rows // distance from shoulder along the axis
    const t = d / len
    const r = r0 + (r1 - r0) * Math.max(0, t)
    const th = thetaC - Math.PI + (2 * Math.PI * c) / cols
    const u = 0.5 + ((th - thetaC) * r) / (2 * Math.PI * uRadius)
    return { p: [r * Math.sin(th), yStart - d, r * Math.cos(th)], uv: [u, 1 - d / len] }
  })
}

export interface BuiltGarment {
  root: THREE.Group
  /** Printable surfaces by panel id. */
  panels: Map<string, THREE.Mesh>
  /** Non-printable trims by colour zone. */
  trims: { mesh: THREE.Mesh; zone: string }[]
  height: number
}

export function buildProceduralGarment(g: ProceduralGarment, panelZone: (panelId: string) => string): BuiltGarment {
  const m = measureGarment(g)
  const { L, neckA, neckB } = bodyDims(g)
  const root = new THREE.Group()
  root.name = 'garment'
  const panels = new Map<string, THREE.Mesh>()
  const trims: BuiltGarment['trims'] = []
  const addPanel = (id: string, geo: THREE.BufferGeometry, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(geo)
    mesh.name = `garment_${id}`
    mesh.userData.panelId = id
    mesh.userData.zone = panelZone(id)
    parent.add(mesh)
    panels.set(id, mesh)
    return mesh
  }
  const addTrim = (name: string, geo: THREE.BufferGeometry, zone: string, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(geo)
    mesh.name = name
    parent.add(mesh)
    trims.push({ mesh, zone })
    return mesh
  }

  addPanel('front', bodyHalf(g, 'front', m.front.w, m.front.h))
  const backGeo = bodyHalf(g, 'back', m.back.w, m.back.h)
  addPanel('back', backGeo)
  // Inside of the back (neck labels): same surface, U mirrored, rendered from the inside.
  addPanel('back_inside', bodyHalf(g, 'back', m.back.w, m.back.h, true)).userData.inside = true

  const s = sleeveDims(g)
  if (s && m.sleeve) {
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1 // wearer's left is world +X
      const pivot = new THREE.Group()
      pivot.name = `${side}_sleeve_pivot`
      pivot.position.set(sign * s.attach.x, s.attach.y, 0)
      pivot.rotation.z = sign * s.angle
      root.add(pivot)
      // Outer face of the sleeve sits on the centre line u=0.5 (local +X for left, −X for right).
      addPanel(`${side}_sleeve`, tube(s.length, s.r0, s.r1, sign * Math.PI / 2, s.r0, 0, 2), pivot)
      if (m.cuff) {
        const rc = s.r1 * 1.04
        addPanel(`${side}_cuff`, tube(CUFF_LENGTH, rc, rc * 0.97, sign * Math.PI / 2, rc, -s.length + 0.3), pivot)
      }
    }
  }

  // Neck finish
  if (g.collar === 'crew' || g.collar === 'v') {
    const rib = new THREE.TorusGeometry(1, 0.42 / neckA, 12, 64)
    rib.rotateX(Math.PI / 2)
    rib.scale(neckA, neckA, neckB)
    addTrim('garment_neck_rib', rib, panelZone('collar'))
    const t = trims[trims.length - 1].mesh
    t.position.y = L - 0.15
  } else if (g.collar === 'polo' || g.collar === 'dress') {
    const cols = 64, rows = 8, gap = g.collar === 'polo' ? 0.28 : 0.2
    const per = m.collar!.w
    const collar = gridGeometry(rows, cols, (ri, c) => {
      const t = gap + ((2 * Math.PI - 2 * gap) * c) / cols
      const k = ri / rows // 0 = top edge, 1 = neck seam
      const flare = 1.05 + 0.18 * (1 - k)
      const y = L - 0.2 + COLLAR_HEIGHT * (1 - k) * 0.85
      const sArc = arcLength(neckA * 1.05, neckB * 1.05, 0, t, 32)
      return { p: [neckA * flare * Math.sin(t), y, neckB * flare * Math.cos(t)], uv: [sArc / per, 1 - k] }
    })
    addPanel('collar', collar)
  } else if (g.collar === 'hood') {
    const hood = new THREE.SphereGeometry(1, 40, 24, Math.PI / 2 + 0.95, 2 * Math.PI - 1.9, 0, Math.PI * 0.72)
    hood.scale(neckA * 1.5, 7.2, neckA * 1.75)
    const h = addTrim('garment_hood', hood, panelZone('hood'))
    h.position.set(0, L - 0.4, -1.4)
    h.rotation.x = -0.18
    const rim = new THREE.TorusGeometry(1, 0.05, 8, 48)
    rim.rotateX(Math.PI / 2); rim.scale(neckA, neckA, neckB)
    addTrim('garment_hood_rim', rim, panelZone('hood')).position.y = L - 0.1
  }

  if (g.placket) {
    const len = g.collar === 'dress' ? L - 1 : 7
    addTrim('garment_placket', frontPatch(g, L - 0.4, L - len, 0.75, 0.06), panelZone('body'))
    const buttons = g.collar === 'dress' ? 7 : 3
    const rings = bodyKeyRings(g)
    for (let i = 0; i < buttons; i++) {
      const y = L - 1.6 - ((len - 2.5) * i) / Math.max(1, buttons - 1)
      const r = ringAt(rings, y)
      const btn = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20)
      btn.rotateX(Math.PI / 2)
      addTrim(`garment_button_${i}`, btn, 'buttons').position.set(0, y, r.b + 0.16)
    }
  }
  if (g.pocket) {
    addTrim('garment_pocket', frontPatch(g, L * 0.4, L * 0.1, 6.4, 0.12), panelZone('body'))
  }
  // Subtle hem/cuff ribs for sweats read as knitwear rather than a cut tube.
  if (g.kind === 'hoodie' || (g.kind === 'longsleeve' && g.cuffs)) {
    const hem = new THREE.CylinderGeometry(1, 1, 2.2, 64, 1, true)
    const h0 = ringAt(bodyKeyRings(g), 0)
    hem.scale(h0.a * 0.99, 1, h0.b * 0.99)
    addTrim('garment_hem_rib', hem, panelZone('cuffs')).position.y = -1.0
  }
  return { root, panels, trims, height: m.height }
}
