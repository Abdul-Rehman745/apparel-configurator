import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Render the built-in garment itself so navigation thumbnails have no third-party asset licence.
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(process.env.CONFIGURATOR_URL || 'http://localhost:5190')
  await page.waitForFunction(() => !!window.__configurator?.viewer(), undefined, { timeout: 45000 })
  const captures = await page.evaluate(async () => {
    const images = await window.__configurator.viewer().capture({ views: ['front', 'back', 'left', 'right', 'neck'], background: 'transparent' })
    const result = {}
    for (const [name, source] of Object.entries(images)) {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 192
      const context = canvas.getContext('2d')
      const ratio = Math.min(192 / image.width, 192 / image.height)
      context.drawImage(image, (192 - image.width * ratio) / 2, (192 - image.height * ratio) / 2, image.width * ratio, image.height * ratio)
      result[name] = canvas.toDataURL('image/png').split(',')[1]
    }
    return result
  })
  await mkdir('public/assets', { recursive: true })
  for (const [name, data] of Object.entries(captures)) await writeFile(`public/assets/view-${name}.png`, Buffer.from(data, 'base64'))
  console.log('Saved five transparent view thumbnails rendered from the built-in garment.')
} finally { await browser.close() }
