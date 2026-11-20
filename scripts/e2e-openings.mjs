// Browser-Test Eröffnungs-Trainer: Alien Gambit üben (erst mit Fehler, dann fehlerfrei),
// Caro-Kann als Schwarz lernen (Pfeile), Suche, Handy-Layout.
// Aufruf: node scripts/e2e-openings.mjs [url] [screenshot-ordner]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const dir = process.argv[3] ?? '.'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const fail = (m) => {
  console.log('FEHLER:', m)
  process.exitCode = 1
}

const status = async () => (await page.textContent('.op-run .status'))?.trim()
const plies = () => page.$$eval('.op-run .move-row .move', (els) => els.filter((e) => e.textContent?.trim()).length)
const waitPlies = (n) =>
  page.waitForFunction(
    (n) => [...document.querySelectorAll('.op-run .move-row .move')].filter((e) => e.textContent?.trim()).length >= n,
    n,
    { timeout: 10000 },
  )
const play = async (from, to) => {
  await page.click(`#opening-square-${from}`)
  await page.click(`#opening-square-${to}`)
}

await page.goto(url)
await page.click('nav.tabs >> text=Training')
await page.click('.pz-modes button[data-mode="openings"]')
await page.waitForSelector('.op-course[data-course="alien"]', { timeout: 15000 })
console.log('Kurse:', await page.$$eval('.op-course h2', (h) => h.map((x) => x.textContent).join(' | ')))

// --- Alien Gambit üben: 1.d4?? ist falsch ---
await page.click('.op-course[data-course="alien"] button:has-text("Üben")')
await page.waitForSelector('.op-run')
await play('d2', 'd4')
await page.waitForTimeout(300)
console.log('Falscher Zug:', await status())
if (!(await status())?.includes('nicht im Repertoire')) fail('1.d4 sollte abgelehnt werden')
if ((await plies()) !== 0) fail('Falscher Zug darf nicht ausgeführt werden')

const white = [['e2', 'e4'], ['d2', 'd4'], ['b1', 'c3'], ['c3', 'e4'], ['e4', 'g5'], ['g5', 'f7']]
const runLine = async () => {
  for (let i = 0; i < white.length; i++) {
    await play(...white[i])
    if (i < white.length - 1) await waitPlies(2 * i + 2)
  }
  await page.waitForSelector('.op-done', { timeout: 10000 })
}
await runLine()
console.log('Durchgang 1:', await status(), '|', (await page.textContent('.op-name'))?.trim())
if (!(await status())?.includes('1 Fehler')) fail('Durchgang 1 sollte 1 Fehler haben')
await page.waitForFunction(() => !document.querySelector('.op-done')?.textContent?.includes('Stellung danach: …'), null, { timeout: 15000 })
console.log('Bewertung:', (await page.textContent('.op-done .small'))?.trim())

await page.click('text=Nächste Variante')
await page.waitForTimeout(400) // Brett animiert zurück in die Grundstellung
await runLine()
console.log('Durchgang 2:', await status(), '|', (await page.textContent('.op-run .op-meta'))?.trim())
if (!(await status())?.includes('fehlerfrei')) fail('Durchgang 2 sollte fehlerfrei sein')
await page.screenshot({ path: `${dir}/op-alien.png` })

await page.click('text=Zur Auswahl')
const alienMeta = (await page.textContent('.op-course[data-course="alien"] .op-meta'))?.trim()
console.log('Alien-Fortschritt:', alienMeta)
if (alienMeta !== '1 / 1 Varianten gelernt') fail('Alien sollte 1/1 gelernt sein')

// --- Caro-Kann lernen als Schwarz: Weiss beginnt automatisch, Pfeile zeigen 1…c6 ---
await page.click('.op-course[data-course="caro"] button:has-text("Lernen")')
await waitPlies(1)
await page.waitForTimeout(300)
const arrows = await page.$$eval('#opening-board svg line, #opening-board svg path, [id^="opening"] svg line', (e) => e.length)
console.log('Caro-Kann: erster weisser Zug da, Pfeil-Elemente:', arrows, '|', await status())
if (arrows === 0) fail('Im Lern-Modus sollten Pfeile zu sehen sein')
await play('c7', 'c6')
await waitPlies(3)
console.log('Nach 1…c6:', (await page.textContent('.op-name'))?.trim(), '|', await status())
await page.screenshot({ path: `${dir}/op-caro.png` })
await page.click('text=Zur Auswahl')

// --- Suche ---
await page.fill('.op-search', 'najdorf')
const hits = await page.$$eval('.op-result strong', (s) => s.map((x) => x.textContent))
console.log('Suche „najdorf“:', hits.length, 'Treffer, z. B.', hits[0])
if (!hits.some((h) => h?.includes('Najdorf'))) fail('Najdorf sollte gefunden werden')
await page.fill('.op-search', '')

// --- Handy ---
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(300)
const sw = await page.evaluate(() => document.documentElement.scrollWidth)
console.log('Handy scrollWidth:', sw)
if (sw > 390) fail('Horizontales Scrollen auf dem Handy')
await page.screenshot({ path: `${dir}/op-phone.png`, fullPage: false })

await browser.close()
if (errors.length) {
  console.log('Seitenfehler:', errors)
  process.exit(1)
}
if (!process.exitCode) console.log('Alles ok ✓')
