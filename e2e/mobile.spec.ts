import { expect, test } from '@playwright/test'
import { design, openConfigurator } from './helpers'

for (const width of [320, 360, 375, 390, 430]) {
  test(`mobile ${width}px: no horizontal overflow, checkout reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await openConfigurator(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const cta = page.locator('.footer .btn-cta')
    await expect(cta).toBeInViewport({ ratio: 1 })
  })
}

test('mobile: bottom sheet editing keeps the garment visible', async ({ page }) => {
  await openConfigurator(page)
  await page.locator('.bottom-bar').getByRole('button', { name: 'Text' }).click()
  const sheet = page.locator('.sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Add heading' }).click()
  await expect.poll(async () => (await design(page)).areas.full_front?.objects.length ?? 0).toBe(1)
  const stage = await page.locator('.stage-wrap').boundingBox()
  expect(stage!.height).toBeGreaterThan(120) // garment area still on screen above the sheet
  await page.locator('.bottom-bar').getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Team' }).click()
  await expect(sheet.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
})
