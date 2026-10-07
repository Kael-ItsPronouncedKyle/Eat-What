import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const svg = readFileSync('./public/favicon.svg', 'utf8')
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })
for (const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-512-maskable', 512, 0.1]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const inner = Math.round(size * (1 - pad * 2))
  await page.setContent(`<html><body style="margin:0;background:#0b1f3a;width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`)
  await page.screenshot({ path: `./public/icons/${name}.png`, omitBackground: false })
  await page.close()
}
await browser.close()
console.log('icons written')
