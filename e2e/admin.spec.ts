import { expect, test } from '@playwright/test'

test('admin blocks publishing an invalid print area', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Print areas' }).click()
  const first = page.locator('details.a-area').first()
  await first.locator('summary').click()
  await first.getByLabel('Width "').fill('99')
  await expect(page.getByRole('alert')).toContainText('extends beyond its panel')
  await expect(page.getByRole('button', { name: 'Publish changes' })).toBeDisabled()
  await first.getByLabel('Width "').fill('11')
  await expect(page.locator('.a-errors')).toHaveCount(0)
})

test('licence report lists every asset source', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Asset licences' }).click()
  await expect(page.getByRole('cell', { name: 'OFL-1.1' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: /Built-in library/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'MISSING' })).toHaveCount(0)
})

test('second tenant is fully re-branded from the same build', async ({ page }) => {
  await page.goto('/?tenant=brand-b')
  await expect(page).toHaveTitle('Customise · Northfield Teamwear', { timeout: 45_000 })
  await expect(page.locator('.price strong')).toHaveText(/£/)
  await expect(page.locator('.tool-rail').getByRole('button', { name: 'Patterns' })).toHaveCount(0) // feature flag off
})
