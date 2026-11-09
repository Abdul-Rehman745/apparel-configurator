import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  await mkdir('artifacts/garment-verification', { recursive: true })
  for (const [product, model] of [['tshirt', 'basic-tee'], ['hoodie', 'hoodie'], ['polo', 'polo']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`http://localhost:5190/?product=${product}&model=${model}`)
    await page.waitForFunction(() => !!window.__configurator?.viewer(), undefined, { timeout: 45000 })
    const summary = await page.evaluate(() => {
      const { catalog, design } = window.__configurator.store.getState()
      return { product: design.productId, model: design.modelId, source: catalog.products.find(p => p.id === design.productId).models.find(m => m.id === design.modelId).source.type }
    })
    assert.equal(summary.product, product)
    assert.equal(summary.model, model)
    assert.equal(summary.source, 'procedural')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `artifacts/garment-verification/${product}.png` })
    assert.deepEqual(errors, [])
    console.log(`${product}: procedural, viewer ready, no page errors`)
    await page.close()
  }
} finally { await browser.close() }
