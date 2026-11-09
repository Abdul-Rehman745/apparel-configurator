import { afterEach, expect, it, vi } from 'vitest'
import { PrintSurface } from './printSurface'
import { defaultCatalog } from '../products/defaultCatalog'

afterEach(() => vi.unstubAllGlobals())

it('keeps artwork orientation and raycast coordinates consistent for GLB and procedural UVs', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) })
  for (const glb of [false, true]) {
    const model = structuredClone(defaultCatalog.products[0].models.find((m) => m.id === 'basic-tee')!)
    const garment = model.source.garment!
    model.source = glb ? { type: 'glb', url: '/test.glb' } : { type: 'procedural', garment }
    const area = model.printAreas[0]
    model.printAreas = [area]
    const panel = model.panels.find(p => p.id === area.panel)!
    const surface = new PrintSurface(model, 10)
    const u = (area.rect.xIn + 1) / panel.widthIn
    const topV = (area.rect.yIn + 2) / panel.heightIn
    const hit = surface.hitArea(panel.id, u, glb ? topV : 1 - topV)
    expect(surface.panels.get(panel.id)!.texture.flipY).toBe(!glb)
    expect(hit?.xIn).toBeCloseTo(1)
    expect(hit?.yIn).toBeCloseTo(2)
    surface.dispose()
  }
})
