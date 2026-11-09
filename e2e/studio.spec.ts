import { expect, test } from '@playwright/test'
import { openConfigurator, design } from './helpers'

test('studio navigation, transparent assets, product options and mobile checkout', async ({ page }) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await openConfigurator(page)
  await expect(page.getByRole('complementary', { name: 'Product information' })).toBeVisible()
  await expect(page.locator('.view-strip button')).toHaveCount(5)
  await page.locator('.view-strip').getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('.camera-tabs').getByRole('button', { name: 'Back', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next garment view' }).click()
  await expect(page.locator('.view-strip').getByRole('button', { name: 'Left', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Design your shirt' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Printing Areas' }).click()
  await page.locator('.info-areas').getByRole('tab', { name: 'Full back', exact: true }).click()
  await expect(page.locator('.inspector-editor-head strong')).toHaveText('Full back')
  await page.locator('.workflow').getByRole('button', { name: '1 Product' }).click()
  await expect(page.locator('.product-info')).toBeVisible()
  await page.getByRole('textbox', { name: 'Product quantity', exact: true }).fill('3')
  expect((await design(page)).quantity).toBe(3)
  await expect(page.locator('.price strong')).toHaveText('$54.00')
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.garment-types img, .model-grid img, .view-strip img')].every(i => i.complete && i.naturalWidth > 0))
  await page.locator('.view-strip').getByRole('button', { name: 'Front', exact: true }).click()
  await page.locator('.product-panel').evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: 'artifacts/studio-desktop.png' })
  for (const width of [320, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('.footer .btn-cta')).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/studio-mobile.png' })
  expect(errors).toEqual([])
})

test('second brand retains its identity in the new studio', async ({ page }) => {
  await openConfigurator(page, '?tenant=brand-b')
  await expect(page.locator('.brand-name')).toContainText('Northfield Teamwear')
  await expect(page.locator('.price strong')).toHaveText('£18.00')
  await expect(page.locator('.tool-rail').getByRole('button', { name: 'Patterns', exact: true })).toHaveCount(0)
})
