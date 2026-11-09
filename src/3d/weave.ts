// Procedural fabric normal maps (no downloaded texture assets → no licensing exposure).
import * as THREE from 'three'
import type { FabricMaterial } from '../core/types'

const SIZE = 128
/** Physical inches covered by one tile. */
export const WEAVE_TILE_IN: Record<FabricMaterial['weave'], number> = { jersey: 0.18, pique: 0.22, mesh: 0.3, fleece: 0.6, poplin: 0.12, twill: 0.2 }

function heightField(weave: FabricMaterial['weave']): Float32Array {
  const h = new Float32Array(SIZE * SIZE)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE
    let val = 0
    switch (weave) {
      case 'jersey': { // columns of interlocking V loops
        const col = (u * 4) % 1, row = (v * 6) % 1
        val = Math.sin(Math.PI * col) * (0.6 + 0.4 * Math.cos(2 * Math.PI * (row + (col < 0.5 ? col : 1 - col))))
        break
      }
      case 'pique': {
        const cx = (u * 5) % 1 - 0.5, cy = (v * 5) % 1 - 0.5
        val = Math.max(0, 1 - Math.hypot(cx, cy) * 2.6)
        break
      }
      case 'mesh': {
        const cx = (u * 4) % 1 - 0.5, cy = (v * 4 + (Math.floor(u * 4) % 2) * 0.5) % 1 - 0.5
        val = Math.min(1, Math.hypot(cx, cy) * 3)
        break
      }
      case 'fleece': val = 0.5 + (rnd() - 0.5) * 0.9; break
      case 'poplin': val = 0.5 + 0.25 * Math.sin(2 * Math.PI * u * 8) + 0.25 * Math.sin(2 * Math.PI * v * 8); break
      case 'twill': val = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u + v) * 6); break
    }
    h[y * SIZE + x] = val + (rnd() - 0.5) * 0.08
  }
  return h
}

const cache = new Map<string, HTMLCanvasElement>()

function normalCanvas(weave: FabricMaterial['weave']): HTMLCanvasElement {
  const hit = cache.get(weave)
  if (hit) return hit
  const h = heightField(weave)
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  const at = (x: number, y: number) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1)
    const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize()
    const i = (y * SIZE + x) * 4
    img.data[i] = (n.x * 0.5 + 0.5) * 255
    img.data[i + 1] = (n.y * 0.5 + 0.5) * 255
    img.data[i + 2] = (n.z * 0.5 + 0.5) * 255
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  cache.set(weave, c)
  return c
}

const yarnCache = new Map<string, HTMLCanvasElement>()

/** Albedo multiplier (≈0.85–1): yarn-to-yarn tone variation along the knit columns. Heather/marl yarns get a
 *  strong two-tone fleck; solid dyes only a faint unevenness so large areas don't read as flat CG colour. */
function yarnCanvas(heather: boolean): HTMLCanvasElement {
  const key = heather ? 'h' : 's'
  const hit = yarnCache.get(key)
  if (hit) return hit
  const S = 256, c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(S, S)
  let seed = heather ? 11 : 5
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // Per-column yarn lots (vertical streaks) + per-pixel fibre noise, both tileable.
  const cols = Array.from({ length: S }, () => rnd())
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const streak = (cols[x] + cols[(x + 1) % S] + cols[(x + S - 1) % S]) / 3
    const fibre = rnd()
    const v = heather
      ? 1 - 0.1 * (fibre > 0.75 ? 1 : 0) - 0.05 * streak         // dark flecks of the second yarn colour
      : 1 - 0.035 * streak - 0.025 * fibre
    const i = (y * S + x) * 4
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v)
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  yarnCache.set(key, c)
  return c
}

/** Colour texture for the fabric, tiled at real yarn scale on a panel of the given physical size. */
export function yarnMap(weave: FabricMaterial['weave'], heather: boolean, widthIn: number, heightIn: number): THREE.Texture {
  const t = new THREE.CanvasTexture(yarnCanvas(heather))
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  const tile = WEAVE_TILE_IN[weave] * 24 // one 256px tile ≈ 24 weave repeats
  t.repeat.set(widthIn / tile, heightIn / tile)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A normal map repeated so one tile covers WEAVE_TILE_IN inches on a panel of the given physical size. */
export function weaveNormalMap(weave: FabricMaterial['weave'], widthIn: number, heightIn: number): THREE.Texture {
  const t = new THREE.CanvasTexture(normalCanvas(weave))
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  const tile = WEAVE_TILE_IN[weave] * 3 // slightly coarsened: true scale aliases at typical viewing distances
  t.repeat.set(widthIn / tile, heightIn / tile)
  t.anisotropy = 4
  t.colorSpace = THREE.NoColorSpace
  return t
}
