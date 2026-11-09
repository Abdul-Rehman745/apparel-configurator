import { expect, test } from '@playwright/test'

// Guards the real (CC0) GLB garment: loads, stands upright, and every print panel's UVs read the right
// way round when that panel is seen from outside. Mirrored back/left-sleeve UVs were real bugs caught
// only by this kind of check -- flat-colour Blender renders cannot show them.
test('real-tee GLB loads upright with correctly oriented print UVs on every panel', async ({ page }) => {
  await page.goto('/?product=tshirt&model=real-tee&checker=full_front')
  await page.waitForFunction(() => {
    const d = (window as any).__configurator?.viewer()?.debug?.()
    let n = 0
    d?.scene.traverse((o: any) => { if (o.isMesh && o.userData.panelId && !o.userData.overlay) n++ })
    return n === 4
  }, null, { timeout: 45_000 })

  const r = await page.evaluate(() => {
    const d = (window as any).__configurator.viewer().debug()
    const state = (window as any).__configurator.store.getState()
    const V = new d.camera.position.constructor()
    const corr = (xs: number[], ys: number[]) => {
      const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n
      let c = 0, vx = 0, vy = 0
      for (let i = 0; i < n; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2 }
      return c / Math.sqrt(vx * vy)
    }
    const panels: Record<string, { across: number; down: number }> = {}
    let minY = Infinity, maxY = -Infinity, depth = 0
    d.scene.traverse((o: any) => {
      if (!o.isMesh || o.userData.overlay || !o.userData.panelId) return
      o.updateWorldMatrix(true, false)
      const p = o.geometry.attributes.position, uv = o.geometry.attributes.uv
      const sleeve = /sleeve/.test(o.userData.panelId)
      const a: number[] = [], u: number[] = [], y: number[] = [], v: number[] = []
      for (let i = 0; i < p.count; i++) {
        V.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)
        minY = Math.min(minY, V.y); maxY = Math.max(maxY, V.y); depth = Math.max(depth, Math.abs(V.z))
        if (sleeve && Math.abs(uv.getX(i) - 0.5) > 0.2) continue // outer face only; seam is on the inside
        a.push(sleeve ? V.z : V.x); u.push(uv.getX(i)); y.push(V.y); v.push(uv.getY(i))
      }
      panels[o.userData.panelId] = { across: corr(a, u), down: corr(y, v) }
    })
    return { model: state.design.modelId, height: maxY - minY, depth, panels }
  })

  expect(r.model).toBe('real-tee')
  expect(r.height).toBeGreaterThan(r.depth * 2) // upright, not lying on its back
  // U must increase toward the viewer's right when each panel is viewed from outside:
  expect(r.panels.front.across).toBeGreaterThan(0.9)        // front: +X
  expect(r.panels.back.across).toBeLessThan(-0.9)           // back seen from behind: -X
  expect(r.panels.left_sleeve.across).toBeLessThan(-0.9)    // left sleeve seen from +X: -Z
  expect(r.panels.right_sleeve.across).toBeGreaterThan(0.9) // right sleeve seen from -X: +Z
  // GLB texture convention (flipY=false): V grows downward, collar/shoulder at the top.
  for (const id of ['front', 'back', 'left_sleeve', 'right_sleeve']) expect(r.panels[id].down).toBeLessThan(-0.9)
})
