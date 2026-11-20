// Rauchtest im echten Browser (installiertes Edge): App laden, als Weiss 1.e4
// spielen, auf Engine-Antwort + Coach-Analyse warten, dann 2.Dh5 (früher
// Damenausflug) und prüfen, ob der Coach etwas dazu sagt.
// Erwartet einen laufenden Server: `npm run preview`.
// Aufruf: node scripts/e2e-smoke.mjs [url] [screenshot.png]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const shot = process.argv[3] ?? 'smoke.png'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const moveCount = () => page.$$eval('.move-row .move', (els) => els.filter((e) => e.textContent?.trim()).length)
const waitMoves = (n) =>
  page.waitForFunction(
    (n) => [...document.querySelectorAll('.move-row .move')].filter((e) => e.textContent?.trim()).length >= n,
    n,
    { timeout: 20000 },
  )
const coach = async () => ({
  badge: (await page.textContent('.coach .badge'))?.trim(),
  text: (await page.textContent('.coach .coach-text'))?.trim(),
  tips: await page.$$eval('.coach .coach-tip', (els) => els.map((e) => e.textContent?.trim())),
})
const click = async (from, to) => {
  await page.click(`[data-square="${from}"]`)
  await page.click(`[data-square="${to}"]`)
}

await page.goto(url)
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))

await click('e2', 'e4')
await waitMoves(2)
await page.waitForSelector('.coach .badge', { timeout: 20000 })
console.log('1.e4 →', JSON.stringify(await coach()))

const reply = await page.$$eval('.move-row .move', (els) => els[1].textContent?.trim())
console.log('Stockfish:', reply)

await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))
await click('d1', 'h5')
await waitMoves(4)
await page.waitForFunction(() => document.querySelector('.coach .coach-move')?.textContent?.includes('Qh5'), null, {
  timeout: 20000,
})
console.log('2.Qh5 →', JSON.stringify(await coach()))
console.log('Eval-Leiste:', await page.getAttribute('.eval-bar', 'title'))
console.log('Züge:', await moveCount())

await page.screenshot({ path: shot })
await browser.close()
if (errors.length) {
  console.log('Fehler:', errors)
  process.exit(1)
}
