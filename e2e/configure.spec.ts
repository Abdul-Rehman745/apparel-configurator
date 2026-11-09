import { expect, test } from '@playwright/test'
import { area, design, openConfigurator, pngBuffer, priceText, tool } from './helpers'

test('configure a shirt end to end: front, back, sleeve, colour, size, price, cart', async ({ page }) => {
  test.setTimeout(120_000) // Includes software-rendered previews for the completed order.
  // FUNCTIONS_URL: same override as tests/backend.test.ts, for an edge function served outside the Supabase gateway.
  const fn = process.env.FUNCTIONS_URL
  if (fn) await page.route('**/functions/v1/**', (r) => r.continue({ url: r.request().url().replace(/^.*\/functions\/v1/, fn) }))
  await openConfigurator(page)
  await expect(priceText(page)).toHaveText('$18.00')

  // Garment colour changes the material, not the artwork.
  await tool(page, 'Product')
  await page.getByRole('radio', { name: 'Navy' }).click()
  expect((await design(page)).colors.body).toBe('navy')

  // Front logo text.
  await area(page, 'Full front')
  await tool(page, 'Text')
  await page.getByRole('button', { name: 'Add heading' }).click()
  await expect(page.getByRole('textbox', { name: 'Text content' })).toHaveValue('YOUR TEXT')
  await page.getByRole('textbox', { name: 'Text content' }).fill('ACME RUN CLUB')
  await expect(priceText(page)).toHaveText('$23.00')

  // Back text, independent of the front.
  await area(page, 'Full back')
  await page.getByRole('button', { name: 'Add team number' }).click()
  await expect(priceText(page)).toHaveText('$28.00')

  // Sleeve clipart.
  await area(page, 'Left sleeve')
  await tool(page, 'Graphics')
  await page.getByRole('button', { name: 'Add Lightning bolt', exact: true }).click()
  await expect(priceText(page)).toHaveText('$31.00')

  // Front artwork survived switching areas.
  const d = await design(page)
  expect(d.areas.full_front.objects.map((o: { name: string }) => o.name)).toEqual(['ACME RUN CLUB'])
  expect(d.areas.full_back.objects).toHaveLength(1)
  expect(d.areas.left_sleeve.objects[0].name).toBe('Lightning bolt')

  // Size + quantity → tier pricing (10 pcs = 5% off).
  await tool(page, 'Product')
  await page.locator('.product-panel').getByRole('radio', { name: 'L', exact: true }).click()
  await page.getByRole('textbox', { name: 'Product quantity', exact: true }).fill('10')
  await expect(priceText(page)).toHaveText('$294.50') // 31 × 10 × 0.95

  // Undo/redo restores the quantity step.
  await page.getByRole('button', { name: /^Undo/ }).click()
  expect((await design(page)).quantity).toBe(1)
  await page.getByRole('button', { name: /^Redo/ }).click()
  expect((await design(page)).quantity).toBe(10)

  // Review → cart.
  await page.locator('.footer').getByRole('button', { name: 'Add to cart' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review before adding to cart' })
  await expect(dialog.getByText('Everything looks print-ready.')).toBeVisible()
  await dialog.getByRole('button', { name: /Add to cart · \$294\.50/ }).click()
  const cart = page.getByRole('dialog', { name: 'Cart', exact: true })
  await expect(cart).toBeVisible({ timeout: 45_000 })
  await expect(cart.getByText('Classic T-Shirt')).toBeVisible()
  await expect(cart.getByText('$294.50').first()).toBeVisible()
})

test('validation blocks checkout with an actionable message', async ({ page }) => {
  await openConfigurator(page)
  await tool(page, 'Text')
  await page.getByRole('button', { name: 'Add heading' }).click()
  // Push the text off the print area using the numeric position field.
  const x = page.getByRole('textbox', { name: 'X position in inches' })
  await x.fill('-5')
  await x.press('Enter')
  await expect(page.locator('.issues-btn')).toContainText('1 to fix')
  await page.locator('.footer').getByRole('button', { name: 'Add to cart' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review before adding to cart' })
  await expect(dialog.getByText(/extends outside the Full front print area/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Add to cart ·/ })).toBeDisabled()
})

test('upload: low-resolution image gets a DPI warning; renamed non-image is rejected', async ({ page }) => {
  await openConfigurator(page)
  await tool(page, 'Upload')
  await page.getByLabel('I own this artwork or have permission to print it.').check()
  await page.locator('input[type=file]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: pngBuffer(600, 600) })
  await expect(page.locator('.toast', { hasText: 'Added “logo.png”' })).toBeVisible()
  // Placed at the largest size that meets 150 DPI (4") → acceptable, not low.
  await expect(page.locator('.dpi')).toContainText('150 DPI at 4.0" wide')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('MZ\x90\x00 definitely not a png') })
  await expect(page.getByRole('alert')).toContainText('Unsupported file')
})

test('switching garment model keeps compatible artwork', async ({ page }) => {
  await openConfigurator(page)
  await tool(page, 'Text')
  await page.getByRole('button', { name: 'Add heading' }).click()
  await tool(page, 'Product')
  await page.getByRole('radio', { name: 'Oversized Tee' }).click()
  const d = await design(page)
  expect(d.modelId).toBe('oversized-tee')
  expect(d.areas.full_front.objects).toHaveLength(1)
  await expect(priceText(page)).toHaveText('$26.00') // 18 + 3 oversize + 5 front
})
