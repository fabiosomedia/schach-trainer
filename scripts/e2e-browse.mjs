// Browser-Test: in der laufenden Partie zurückblättern (Knöpfe, Pfeiltasten, Zugliste),
// Brett ist dabei gesperrt, "Zur aktuellen Stellung" bringt zurück.
// Aufruf: node scripts/e2e-browse.mjs [url] [screenshot.png]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const shot = process.argv[3] ?? 'browse.png'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const ready = () => page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'), null, { timeout: 20000 })
const piece = (sq) => page.getAttribute(`#play-square-${sq} [data-piece]`, 'data-piece').catch(() => null)
const status = async () => (await page.textContent('.status:visible'))?.trim()
const fail = (msg) => { console.log('FEHLER:', msg); process.exitCode = 1 }

await page.goto(url)
await ready()
await page.click('#play-square-e2'); await page.click('#play-square-e4'); await ready()
await page.click('#play-square-d2'); await page.click('#play-square-d4'); await ready()
console.log('Live:', await status())

await page.click('button[title="Zug zurück (←)"]')
await page.waitForTimeout(500)
console.log('1× zurück:', await status())
await page.click('button[title="Zug zurück (←)"]')
await page.waitForTimeout(500)
console.log('2× zurück:', await status(), '| d4 =', await piece('d4'), '| d2 =', await piece('d2'))
if ((await piece('d2')) !== 'wP') fail('d2 sollte in der Ansicht noch den Bauern zeigen')

// Brett gesperrt: Zug versuchen darf nichts ändern
await page.click('#play-square-g1'); await page.click('#play-square-f3')
await page.waitForTimeout(400)
const n = await page.$$eval('.move-row .move', (els) => els.filter((e) => e.textContent?.trim()).length)
console.log('Züge nach Klickversuch:', n)
if (n !== 4) fail('Während der Ansicht darf kein Zug möglich sein')

await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(400)
console.log('Pfeil links:', await status())
await page.screenshot({ path: shot })

// Klick in die Zugliste
await page.click('.move-row .move >> nth=0')
await page.waitForTimeout(400)
console.log('Klick auf 1. Zug:', await status(), '| Coach:', (await page.textContent('.coach .badge:visible').catch(() => '-'))?.trim())

await page.click('button[title="Zur aktuellen Stellung"]')
await page.waitForTimeout(400)
console.log('Zurück live:', await status(), '| d4 =', await piece('d4'))
if (!(await piece('d4'))) fail('Live-Stellung sollte auf d4 eine Figur zeigen (d4 oder exd4)')

await browser.close()
if (errors.length) { console.log('Seitenfehler:', errors); process.exit(1) }
