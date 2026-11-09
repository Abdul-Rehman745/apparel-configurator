import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const area of ['full_front', 'full_back', 'left_sleeve', 'right_sleeve']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('requestfailed', r => console.log('Request failed', new URL(r.url()).pathname, r.failure()?.errorText))
    await page.goto(`http://localhost:5190/?product=tshirt&model=real-tee&checker=${area}`)
    try {
      await page.waitForFunction(area => {
        const app = window.__configurator
        let meshes = 0
        app?.viewer()?.debug?.().scene.traverse(o => { if (o.isMesh && o.userData.panelId && !o.userData.overlay) meshes++ })
        return meshes === 4 && app.store.getState().design.areas[area]?.objects?.length > 0
      }, area, { timeout: 60000 })
      await page.waitForTimeout(1500)
      assert.deepEqual(errors, [])
      console.log(`${area}: four loaded GLB panels and checker artwork`)
    } finally {
      await page.screenshot({ path: `artifacts/glb-qa/checker-${area}.png` })
      await context.close()
    }
  }
} finally { await browser.close() }
