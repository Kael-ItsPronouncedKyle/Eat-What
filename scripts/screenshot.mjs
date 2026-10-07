// Usage: node scripts/screenshot.mjs [path=/] [out=shot.png] [textSize=A] [theme=light|dark]
// Builds nothing: expects a server on http://localhost:4173 (npm run preview) or SCREENSHOT_URL.
import { chromium, devices } from '@playwright/test'
const [, , path = '/', out = 'shot.png', textSize = 'A', theme = 'light'] = process.argv
const base = process.env.SCREENSHOT_URL || 'http://localhost:4173'
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: theme === 'dark' ? 'dark' : 'light' })
const page = await ctx.newPage()
await page.addInitScript((ts) => {
  localStorage.setItem('qm.prefs.v1', JSON.stringify({ textSize: ts }))
}, textSize)
await page.goto(base + path, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: out, fullPage: false })
await browser.close()
console.log('wrote', out)
