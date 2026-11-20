// Rauchtest im echten Browser: App laden, als Weiss e2-e4 klicken, warten bis
// Stockfish antwortet. Erwartet einen laufenden Server (npm run preview).
// Aufruf: node scripts/e2e-smoke.mjs [url]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(url)
await page.waitForSelector('[data-square="e2"]')
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))

await page.click('[data-square="e2"]')
await page.click('[data-square="e4"]')
await page.waitForFunction(() => document.querySelectorAll('.move-row .move')[1]?.textContent?.trim(), null, {
  timeout: 15000,
})
const moves = await page.$$eval('.move-row .move', (els) => els.map((e) => e.textContent?.trim()))
const status = await page.textContent('.status')
await page.screenshot({ path: process.argv[3] ?? 'smoke.png' })
await browser.close()

console.log('Züge:', moves.filter(Boolean).join(' '))
console.log('Status:', status)
if (errors.length) {
  console.log('Fehler:', errors)
  process.exit(1)
}
