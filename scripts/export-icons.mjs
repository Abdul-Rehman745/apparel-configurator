import { chromium } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as L from 'lucide-react'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const out = path.resolve('public/assets/icons')
await mkdir(out, { recursive: true })

const icons = {
  'icon-save': ['Save', 20], 'icon-share': ['Share2', 20], 'icon-help': ['CircleHelp', 20], 'icon-cart': ['ShoppingCart', 22],
  'rail-product': ['Shirt', 28], 'rail-design': ['Palette', 28], 'rail-text': ['Type', 28], 'rail-upload': ['Upload', 28],
  'rail-graphics': ['Image', 28], 'rail-shapes': ['Square', 28], 'rail-templates': ['Grid2X2', 28], 'rail-layers': ['Layers', 28],
  'icon-search': ['Search', 20], 'icon-chevron-right': ['ChevronRight', 16], 'icon-chevron-down': ['ChevronDown', 16],
  'icon-info': ['Info', 14], 'icon-minus': ['Minus', 16], 'icon-plus': ['Plus', 16],
  'icon-zoom-in': ['ZoomIn', 20], 'icon-fullscreen': ['Maximize2', 20], 'icon-arrow-left': ['ChevronLeft', 20],
  'icon-arrow-right': ['ChevronRight', 20], 'icon-3d-cube': ['Box', 18], 'icon-2d-design': ['PenTool', 18], 'icon-mockup': ['Images', 18],
  'info-material': ['Scan', 24], 'info-fit': ['Shirt', 24], 'info-sizes': ['MoveDiagonal', 24],
  'feature-breathable': ['Wind', 32], 'feature-durable': ['ShieldCheck', 32], 'feature-comfort': ['StretchHorizontal', 32],
  'bar-rotate-360': ['Rotate3D', 20], 'bar-zoom': ['ZoomIn', 20], 'bar-reset-view': ['RotateCcw', 20],
  'bar-studio-light': ['Lightbulb', 20], 'bar-hd': ['Hd', 20],
}

const colorFor = (file) => file.startsWith('rail-') ? '#FFFFFF' : '#1B1B1F'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 })
for (const [file, [component, size]] of Object.entries(icons)) {
  const Icon = L[component]
  if (!Icon) throw new Error(`Missing Lucide icon: ${component}`)
  for (const scale of [1, 2, 3]) {
    const pixels = size * scale
    const svg = renderToStaticMarkup(createElement(Icon, { width: pixels, height: pixels, color: colorFor(file), strokeWidth: 1.75 }))
    await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:transparent;width:${pixels}px;height:${pixels}px}body{display:grid;place-items:center}svg{display:block}</style>${svg}`)
    await page.setViewportSize({ width: pixels, height: pixels })
    const suffix = scale === 1 ? '' : `@${scale}x`
    await page.screenshot({ path: path.join(out, `${file}${suffix}.png`), omitBackground: true })
  }
}
for (const [file, component, size] of [['icon-cart-white', 'ShoppingCart', 22], ['icon-3d-cube-white', 'Box', 18]]) {
  const Icon = L[component]
  for (const scale of [1, 2, 3]) {
    const pixels = size * scale
    const svg = renderToStaticMarkup(createElement(Icon, { width: pixels, height: pixels, color: '#FFFFFF', strokeWidth: 1.75 }))
    await page.setContent(`<style>html,body{margin:0;background:transparent;width:${pixels}px;height:${pixels}px}svg{display:block}</style>${svg}`)
    await page.setViewportSize({ width: pixels, height: pixels })
    await page.screenshot({ path: path.join(out, `${file}${scale === 1 ? '' : `@${scale}x`}.png`), omitBackground: true })
  }
}
for (const [size, name] of [[48, 'logo-mark'], [32, 'favicon']]) {
  for (const scale of [1, 2, 3]) {
    const pixels = size * scale
    const svg = `<svg width="${pixels}" height="${pixels}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path fill="#111318" d="M7 5h34a7 7 0 0 1 0 14H31v23a6 6 0 0 1-12 0V19H7A7 7 0 0 1 7 5Z"/><path fill="#fff" d="M24 11h12v3h-4v4h-4v-4h-4z"/></svg>`
    await page.setContent(`<style>html,body{margin:0;background:transparent;width:${pixels}px;height:${pixels}px}svg{display:block}</style>${svg}`)
    await page.setViewportSize({ width: pixels, height: pixels })
    await page.screenshot({ path: path.join(out, `${name}${scale === 1 ? '' : `@${scale}x`}.png`), omitBackground: true })
  }
}
const garments = {
  tshirt: '<path d="m22 12-11 6-6 14 10 5 5-9-1 28h26l-1-28 5 9 10-5-6-14-11-6c-2 7-18 7-20 0Z"/><path d="M22 12c1 12 19 12 20 0M19 52h26M8 29l9 4m30 0 9-4" fill="none"/>',
  polo: '<path d="m22 12-11 6-6 14 10 5 5-9-1 28h26l-1-28 5 9 10-5-6-14-11-6-10 3Z"/><path d="m22 12 10 5-6 10-7-12m23-3-10 5 6 10 7-12M32 17v17m-13 18h26" fill="none"/><circle cx="32" cy="25" r=".7"/><circle cx="32" cy="30" r=".7"/>',
  hoodie: '<path d="M23 16c-8-17 26-17 18 0l11 5 7 32-9 3-6-25 1 25H19l1-25-6 25-9-3 7-32Z"/><path d="M23 16c0-13 18-13 18 0l-9 8Zm3 5-1 12m13-12 1 12M25 40h14l4 10H21Zm-6 12h26M6 49l9 2m34 0 9-2" fill="none"/>',
  sweatshirt: '<path d="m23 12-11 7-7 34 9 3 6-29-1 29h26l-1-29 6 29 9-3-7-34-11-7c-1 8-17 8-18 0Z"/><path d="M23 12c0 13 18 13 18 0M19 52h26M6 49l9 2m34 0 9-2" fill="none"/>',
}
for (const [name, paths] of Object.entries(garments)) {
  for (const scale of [1, 2, 3]) {
    const pixels = 64 * scale
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 64 64" fill="#f2f2f2" stroke="#6b6b70" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`)
    await page.setViewportSize({ width: pixels, height: pixels })
    await page.screenshot({ path: path.join(out, `garment-${name}${scale === 1 ? '' : `@${scale}x`}.png`), omitBackground: true })
  }
}
await browser.close()
console.log(`Exported ${Object.keys(icons).length * 3 + 24} transparent PNG assets to ${out}`)
