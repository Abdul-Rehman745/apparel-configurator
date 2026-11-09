import { expect, test } from '@playwright/test'
import { design, openConfigurator, tool } from './helpers'

test('saved design reopens on another device from its link', async ({ page, browser }) => {
  await openConfigurator(page)
  await tool(page, 'Product')
  await page.getByRole('radio', { name: 'Forest Green' }).click()
  await tool(page, 'Text')
  await page.getByRole('button', { name: 'Add heading' }).click()
  await page.getByRole('textbox', { name: 'Text content' }).fill('SHARE ME')

  await page.getByRole('button', { name: 'Share' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share your design' })
  const link = await dialog.getByRole('textbox', { name: 'Share link' }).inputValue()
  expect(link).toMatch(/\/design\/TSHIRT-[A-Z2-9]{6}$/)

  // A brand-new browser context has empty IndexedDB: this only works via the backend.
  const other = await browser.newContext()
  const p2 = await other.newPage()
  await p2.goto(new URL(link).pathname)
  await expect.poll(async () => (await design(p2)).colors.body).toBe('forest')
  const d = await design(p2)
  expect(d.areas.full_front.objects[0].text).toBe('SHARE ME')
  await other.close()
})

test('autosave restores work after a reload', async ({ page }) => {
  await openConfigurator(page)
  await tool(page, 'Text')
  await page.getByRole('button', { name: 'Add subheading' }).click()
  await page.waitForTimeout(1200) // autosave debounce
  await page.reload()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect.poll(async () => (await design(page)).areas.full_front?.objects.length ?? 0).toBe(1)
})

test('production package contains print files and manifest', async ({ page }) => {
  await openConfigurator(page)
  await tool(page, 'Text')
  await page.getByRole('button', { name: 'Add heading' }).click()
  await page.getByRole('button', { name: 'Production files' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Build & download ZIP' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^ORD-[A-Z2-9]{6}\.zip$/)
  const path = await download.path()
  const { unzipSync } = await import('fflate')
  const fs = await import('node:fs')
  const files = unzipSync(new Uint8Array(fs.readFileSync(path!)))
  const names = Object.keys(files).map((n) => n.split('/').slice(1).join('/'))
  expect(names).toEqual(expect.arrayContaining(['manifest.json', 'print/full_front.png', 'print/full_front.svg', 'design/full_front.json']))
  const manifest = JSON.parse(new TextDecoder().decode(files[Object.keys(files).find((n) => n.endsWith('manifest.json'))!]))
  expect(manifest.areas[0]).toMatchObject({ areaId: 'full_front', physicalWidth: 12, physicalHeight: 14, resolution: 300 })
  expect(manifest.areas[0].files[0]).toMatchObject({ widthPx: 3600, heightPx: 4200 })
})
