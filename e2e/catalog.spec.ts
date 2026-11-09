import { expect, test } from '@playwright/test'
import { design } from './helpers'

test('catalog filters by category and opens the chosen garment in the studio', async ({ page }) => {
  await page.goto('/catalog')
  const cards = page.locator('.cat-card')
  await expect(cards).toHaveCount(11)
  await page.getByRole('group', { name: 'Filter by category' }).getByRole('button', { name: 'Sweats' }).click()
  await expect(cards).toHaveCount(2)
  const hoodie = cards.filter({ hasText: 'Pullover Hoodie' })
  await hoodie.getByRole('button', { name: 'Black' }).click()
  await expect(hoodie.locator('svg path').first()).toHaveAttribute('fill', '#1c1c1e')
  await hoodie.getByRole('link', { name: 'Customise' }).click()
  await expect(page).toHaveURL(/\?product=hoodie/)
  await expect.poll(async () => (await design(page)).productId, { timeout: 45_000 }).toBe('hoodie')
})
