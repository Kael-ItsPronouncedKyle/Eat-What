# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> shell >> every button meets the 48px tap target
- Location: e2e/smoke.spec.ts:31:3

# Error details

```
Error: [{"w":144.78125,"h":40.640625,"label":"Skip to content"}]

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 7

- Array []
+ Array [
+   Object {
+     "h": 40.640625,
+     "label": "Skip to content",
+     "w": 144.78125,
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - link "Skip to content" [ref=e4] [cursor=pointer]:
      - /url: "#main"
    - banner [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: Quartermaster
        - generic [ref=e11]:
          - generic "Active household" [ref=e12]: Denton
          - button "Text size A. Tap to change." [ref=e16] [cursor=pointer]:
            - generic [ref=e19]: A
    - main [ref=e20]:
      - generic [ref=e21]:
        - heading "Home" [level=1] [ref=e23]
        - paragraph [ref=e24]: Coming up.
    - button "Talk to Quartermaster" [ref=e26] [cursor=pointer]
    - navigation "Main" [ref=e29]:
      - link "Home" [ref=e30] [cursor=pointer]:
        - /url: /
      - link "Pantry" [ref=e34] [cursor=pointer]:
        - /url: /pantry
      - link "Cook" [ref=e38] [cursor=pointer]:
        - /url: /cook
      - link "Shop" [ref=e42] [cursor=pointer]:
        - /url: /shop
      - link "House" [ref=e46] [cursor=pointer]:
        - /url: /house
  - status
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('shell', () => {
  4  |   test('loads, shows five tabs, and navigates', async ({ page }) => {
  5  |     await page.goto('/')
  6  |     await expect(page.getByRole('banner')).toBeVisible()
  7  |     const nav = page.getByRole('navigation', { name: 'Main' })
  8  |     for (const label of ['Home', 'Pantry', 'Cook', 'Shop', 'House']) {
  9  |       await expect(nav.getByRole('link', { name: label })).toBeVisible()
  10 |     }
  11 |     await nav.getByRole('link', { name: 'Pantry' }).click()
  12 |     await expect(page).toHaveURL(/\/pantry/)
  13 |     await expect(page.getByRole('heading', { level: 1 })).toContainText('Pantry')
  14 |   })
  15 | 
  16 |   test('text size toggle cycles A, A+, A++ and persists', async ({ page }) => {
  17 |     await page.goto('/')
  18 |     const btn = page.getByRole('button', { name: /Text size/ })
  19 |     await expect(btn).toContainText('A')
  20 |     await btn.click()
  21 |     await expect(page.locator('html')).toHaveAttribute('data-text-size', 'A+')
  22 |     await btn.click()
  23 |     await expect(page.locator('html')).toHaveAttribute('data-text-size', 'A++')
  24 |     await page.reload()
  25 |     await expect(page.locator('html')).toHaveAttribute('data-text-size', 'A++')
  26 |     // No horizontal scroll at A++.
  27 |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  28 |     expect(overflow).toBe(false)
  29 |   })
  30 | 
  31 |   test('every button meets the 48px tap target', async ({ page }) => {
  32 |     await page.goto('/')
  33 |     const boxes = await page.locator('button:visible, a[href]:visible').evaluateAll((els) =>
  34 |       els.map((el) => {
  35 |         const r = el.getBoundingClientRect()
  36 |         return { w: r.width, h: r.height, label: (el as HTMLElement).innerText || el.getAttribute('aria-label') }
  37 |       }),
  38 |     )
  39 |     const small = boxes.filter((b) => b.w < 48 || b.h < 48)
> 40 |     expect(small, JSON.stringify(small)).toEqual([])
     |                                          ^ Error: [{"w":144.78125,"h":40.640625,"label":"Skip to content"}]
  41 |   })
  42 | })
  43 | 
```