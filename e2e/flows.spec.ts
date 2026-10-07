import { test, expect } from '@playwright/test'

test.describe('core flows (local mode, seeded Denton)', () => {
  test('pantry: tap a status, see the undo bar, undo it', async ({ page }) => {
    await page.goto('/pantry')
    const card = page.locator('.item-card-wrap', { hasText: 'Beef chuck roast' }).first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'OK', exact: true }).click()
    const undo = page.getByTestId('undo-bar')
    await expect(undo).toContainText('Beef chuck roast: OK')
    await undo.getByRole('button', { name: 'Undo' }).click()
    await expect(card.getByRole('button', { name: 'Out', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('freezer: Eat 1 decrements and logs', async ({ page }) => {
    await page.goto('/pantry/freezer')
    const first = page.locator('.block-card').first()
    const before = Number((await first.locator('.block-count').innerText()).replace(/\D/g, ''))
    await first.getByRole('button', { name: /Eat 1/ }).click()
    await expect(first.locator('.block-count')).toContainText(String(before - 1))
    await page.goto('/house/activity')
    await expect(page.getByText(/Ate 1/).first()).toBeVisible()
  })

  test('cook: suggestions explain themselves and cook mode walks the steps', async ({ page }) => {
    await page.goto('/cook')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cook')
    const card = page.locator('.suggestion-card').first()
    await card.getByRole('button', { name: /Why/ }).click()
    await expect(page.getByRole('dialog')).toContainText(/ingredients|Rule fit/)
    await page.keyboard.press('Escape')
    await page.goto('/cook/recipes')
    await page.getByRole('link', { name: /Brisket chili/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Brisket chili')
    await page.getByRole('button', { name: 'Cook this' }).click()
    await expect(page).toHaveURL(/\/cook\/mode\//)
    await expect(page.locator('.cookmode-step')).toBeVisible()
    const tabbar = page.getByRole('navigation', { name: 'Main' })
    await expect(tabbar).toHaveCount(0)
    await page.getByRole('button', { name: 'Next', exact: true }).last().click()
    await expect(page.locator('.cookmode-body')).toContainText(/Step 2|Sit here/)
  })

  test('shop: send to Instacart moves lines to ordered', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/shop')
    await page.getByRole('button', { name: /Send \d+ items? to Instacart/ }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Estimated')
    const popup = page.waitForEvent('popup').catch(() => null)
    await dialog.getByRole('button', { name: /Send \d+ items? to Instacart/ }).click()
    const p = await popup
    if (p) await p.close()
    await expect(page.getByTestId('undo-bar')).toContainText(/Sent \d+ items?/)
    await page.goto('/shop/ordered')
    await expect(page.getByText('It arrived').first()).toBeVisible()
  })

  test('A++ keeps every screen free of horizontal scroll', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('qm.prefs.v1', JSON.stringify({ textSize: 'A++' })))
    for (const path of ['/', '/pantry', '/pantry/freezer', '/cook', '/cook/plan', '/shop', '/shop/prices', '/house', '/house/rules']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      expect(overflow, `${path} overflows at A++`).toBe(false)
    }
  })
})
