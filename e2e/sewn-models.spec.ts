import { expect, test } from '@playwright/test'

// Cloth-simulated GLBs (models/sew_garment.py): every catalog panel exists as a mesh, the garment stands
// upright at real-world size, and each panel's UVs read the right way round from outside
// (same rules as e2e/real-model.spec.ts; a crossed sleeve or mirrored back is caught here).
const MODELS = (process.env.SEWN_MODELS ?? 'tshirt:basic-tee').split(',').map((s) => s.split(':') as [string, string])

for (const [product, model] of MODELS) {
  test(`sewn ${model}: all panels present, upright, print UVs oriented`, async ({ page }) => {
    await page.goto(`/?product=${product}&model=${model}`)
    await page.waitForFunction((m) => {
      const c = (window as any).__configurator
      const d = c?.viewer()?.debug?.()
      if (!d || c.store.getState().design.modelId !== m) return false
      let n = 0
      d.scene.traverse((o: any) => { if (o.isMesh && o.userData.panelId && !o.userData.overlay) n++ })
      const want = c.store.getState().catalog.products.flatMap((p: any) => p.models).find((x: any) => x.id === m).panels.length
      return n === want
    }, model, { timeout: 60_000 })

    const r = await page.evaluate(() => {
      const d = (window as any).__configurator.viewer().debug()
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
        if (!o.isMesh || o.userData.overlay || !o.userData.panelId || o.userData.inside) return
        o.updateWorldMatrix(true, false)
        const p = o.geometry.attributes.position, uv = o.geometry.attributes.uv
        const tube = /sleeve|cuff/.test(o.userData.panelId)
        const a: number[] = [], u: number[] = [], y: number[] = [], v: number[] = []
        for (let i = 0; i < p.count; i++) {
          V.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)
          minY = Math.min(minY, V.y); maxY = Math.max(maxY, V.y); depth = Math.max(depth, Math.abs(V.z))
          if (tube && Math.abs(uv.getX(i) - 0.5) > 0.2) continue
          a.push(tube ? V.z : V.x); u.push(uv.getX(i)); y.push(V.y); v.push(uv.getY(i))
        }
        panels[o.userData.panelId] = { across: corr(a, u), down: corr(y, v) }
      })
      return { height: maxY - minY, depth, panels }
    })

    expect(r.height).toBeGreaterThan(r.depth * 2)
    expect(r.height).toBeGreaterThan(15) // real inches, not metres
    expect(r.panels.front.across).toBeGreaterThan(0.9)
    expect(r.panels.back.across).toBeLessThan(-0.9)
    if (r.panels.left_sleeve) {
      expect(r.panels.left_sleeve.across).toBeLessThan(-0.8)
      expect(r.panels.right_sleeve.across).toBeGreaterThan(0.8)
    }
    // V grows downward. Torso panels hang straight (strict); sleeves sit in an A-pose, so their length runs
    // partly sideways and only the sign of the correlation with height is meaningful.
    for (const id of ['front', 'back']) expect(r.panels[id].down, `${id} V direction`).toBeLessThan(-0.9)
    for (const id of ['left_sleeve', 'right_sleeve']) if (r.panels[id]) expect(r.panels[id].down, `${id} V direction`).toBeLessThan(-0.5)
  })
}
