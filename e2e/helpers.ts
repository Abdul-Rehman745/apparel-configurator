import { expect, type Page } from '@playwright/test'
import zlib from 'node:zlib'

/** Opens the configurator on a fresh design and waits for the 3D viewer and editor. */
export async function openConfigurator(page: Page, query = '') {
  await page.goto('/' + query)
  // Cold Vite dev compiles the three.js chunk on first request; accept the 2D fallback where WebGL is absent.
  await expect(page.locator('.viewer-canvas canvas, .fallback-note').first()).toBeVisible({ timeout: 45_000 })
  // The Fabric editor may be detached (Product Info panel showing); wait for the store + editor instead of a DOM slot.
  await page.waitForFunction(() => !!(window as any).__configurator?.editor?.area)
  const discard = page.getByRole('button', { name: 'Discard' })
  if (await discard.isVisible().catch(() => false)) await discard.click()
}

export const priceText = (page: Page) => page.locator('.price strong')

/** Current design summary straight from the store (assertions on data, UI asserted separately). */
export const design = async (page: Page) => {
  await page.waitForFunction(() => !!(window as any).__configurator?.store)
  return page.evaluate(() => (window as any).__configurator.store.getState().design)
}

export async function tool(page: Page, name: string) {
  const btn = page.locator('.tool-rail').getByRole('button', { name, exact: true })
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click()
}

export async function area(page: Page, name: string) {
  if (await page.locator('.view-strip').isVisible()) {
    await page.getByRole('tab', { name: 'Printing Areas', exact: true }).click()
    await page.locator('.info-areas').getByRole('tab', { name, exact: true }).click()
  } else await page.locator('.stage-areas').getByRole('tab', { name, exact: true }).click()
  await page.waitForFunction((n) => (window as any).__configurator.editor.area?.label === n, name)
}

/** Minimal valid PNG (solid colour) of the given size, for upload tests. */
export function pngBuffer(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x55)])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
