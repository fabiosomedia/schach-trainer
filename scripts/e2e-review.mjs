// Browser-Test Partie-Analyse: die „Opernpartie“ (Morphy – Herzog von Braunschweig/Graf Isouard, Paris 1858,
// gemeinfrei) als Weiss analysieren; prüft Eröffnungsname, Bewertungsgraph (Klick springt zum Zug),
// Schlüsselmomente und geschätzte Leistung. Screenshots Desktop + Handy (390×844).
// Aufruf: node scripts/e2e-review.mjs [url] [screenshot-ordner]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const dir = process.argv[3] ?? '.'
const PGN = `[Event "Paris"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
const fail = (msg) => errors.push(msg)
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(url)
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))
await page.click('nav >> text=Analyse')
await page.fill('textarea', PGN)
await page.click('text=Ich war Weiss')
await page.click('button:text-is("Analysieren")')
const t0 = Date.now()
await page.waitForSelector('.key-moments', { timeout: 300000 })
console.log(`Analyse fertig nach ${Math.round((Date.now() - t0) / 1000)} s`)

const opening = (await page.textContent('.opening-name'))?.trim()
console.log('Eröffnung:', opening)
if (!opening?.includes('Philidor-Verteidigung') || !opening.includes('C41')) fail(`Eröffnung falsch: ${opening}`)

const counts = (await page.textContent('.summary-counts'))?.replace(/\s+/g, ' ').trim()
console.log('Zähler:', counts)
if (!counts?.includes('📖')) fail('Kein Buchzug-Zähler')
console.log('Genauigkeit:', (await page.textContent('.summary-acc strong'))?.trim(), '·', (await page.textContent('.perf'))?.replace(/\s+/g, ' ').trim())

const hits = await page.$$eval('.eg-hit', (r) => r.length)
const area = await page.getAttribute('.eg-area', 'd')
console.log('Graph: Klickflächen', hits, '· Fläche', area?.length, 'Zeichen')
if (hits !== 34 || !area || area.length < 100) fail('Graph unvollständig')

// Klick in den Graphen → Halbzug 20 = 11. Bxb5+
await page.click('.eg-hit[data-ply="20"]', { force: true })
await page.waitForTimeout(400)
const st = (await page.textContent('.status:visible'))?.trim()
console.log('Nach Graph-Klick:', st)
if (!st?.includes('11. Bxb5+')) fail(`Graph-Klick springt nicht: ${st}`)
const sel = await page.getAttribute('.eg-sel', 'x1')
console.log('Markierung bei x =', sel)

const moments = await page.$$eval('.moments li', (li) => li.map((x) => x.textContent?.replace(/\s+/g, ' ').trim()))
console.log('Schlüsselmomente:\n  ' + moments.join('\n  '))
if (moments.length < 1) fail('Keine Schlüsselmomente')
await page.click('.moments li button')
await page.waitForTimeout(400)
console.log('Nach Moment-Klick:', (await page.textContent('.status:visible'))?.trim())
// Gegnerzüge werden nicht analysiert → dort gibt es keine Coach-Karte
const coach = await page.$('.coach .coach-text:visible')
console.log('Coach:', coach ? (await coach.textContent())?.trim() : '(Gegnerzug, keine Analyse)')
await page.screenshot({ path: `${dir}/review-desktop.png`, fullPage: true })

// Gleiche Partie aus Sicht von Schwarz: hier gibt es Fehler und erklärte Motive
await page.click('text=Ich war Schwarz')
await page.click('button:text-is("Analysieren")')
await page.waitForSelector('.key-moments', { timeout: 300000 })
console.log('Schwarz – Genauigkeit:', (await page.textContent('.summary-acc strong'))?.trim(), '· Zähler:', (await page.textContent('.summary-counts'))?.replace(/\s+/g, ' ').trim())
const marks = await page.$$eval('.eg-mark', (m) => m.length)
console.log('Fehler-Markierungen im Graph:', marks)
if (marks < 1) fail('Keine Fehler-Markierungen im Graph')
const bm = await page.$$eval('.moments li', (li) => li.map((x) => x.textContent?.replace(/\s+/g, ' ').trim()))
console.log('Schwarz – Schlüsselmomente:\n  ' + bm.join('\n  '))
for (const b of await page.$$('.jump button')) {
  await b.click()
  await page.waitForTimeout(150)
  console.log('  ', (await b.textContent())?.trim(), '→', (await page.textContent('.coach .coach-text:visible'))?.trim())
}
await page.click('.moments li button')
await page.waitForTimeout(500)
await page.screenshot({ path: `${dir}/review-black.png`, fullPage: true })
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(400)
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 1) fail(`Horizontaler Überlauf auf dem Handy: ${overflow}px`)
await page.screenshot({ path: `${dir}/review-mobile.png`, fullPage: true })

await browser.close()
if (errors.length) {
  console.log('Fehler:', errors)
  process.exit(1)
}
console.log('OK')
