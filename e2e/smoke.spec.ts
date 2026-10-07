import { test, expect } from '@playwright/test'

test.describe('shell', () => {
  test('loads, shows five tabs, and navigates', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const label of ['Home', 'Pantry', 'Cook', 'Shop', 'House']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible()
    }
    await nav.getByRole('link', { name: 'Pantry' }).click()
    await expect(page).toHaveURL(/\/pantry/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pantry')
  })

  test('text size toggle cycles A, A+, A++ and persists', async ({ page }) => {
    await page.goto('/')
    const btn = page.getByRole('button', { name: /Text size/ })
    await expect(btn).toContainText('A')
    await btn.click()
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'A+')
    await btn.click()
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'A++')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'A++')
    // No horizontal scroll at A++.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
  })

  test('every button meets the 48px tap target', async ({ page }) => {
    await page.goto('/')
    const boxes = await page.locator('button:visible, a[href]:visible').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height, label: (el as HTMLElement).innerText || el.getAttribute('aria-label') }
      }),
    )
    const small = boxes.filter((b) => b.w < 48 || b.h < 48)
    expect(small, JSON.stringify(small)).toEqual([])
  })
})
