// Browser-Test Phase 3: Partie aufgeben → landet im Profil; vorbereitetes Puzzle
// lösen (falsch, dann richtig); Statistik-Seite rendert.
// Aufruf: node scripts/e2e-phase3.mjs [url] [screenshot-ordner]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const dir = process.argv[3] ?? '.'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const puzzle = {
  id: 'p1',
  fen: '4k3/pp6/8/1r6/8/8/PP6/4KB2 w - - 0 1',
  bestUci: 'f1b5',
  bestSan: 'Bxb5+',
  motif: 'missed_capture',
  explanation: 'Der Turm auf b5 war ungedeckt – mit Bxb5+ hättest du ihn gewinnen können.',
  createdAt: 0, box: 0, due: 0, attempts: 0, correct: 0,
}
await page.addInitScript((p) => {
  if (!localStorage.getItem('schach-trainer:profile'))
    localStorage.setItem('schach-trainer:profile', JSON.stringify({ version: 1, games: [], mistakes: [], puzzles: [p] }))
}, puzzle)

await page.goto(url)
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))

// 1) Partie: e4, dann aufgeben
await page.click('#play-square-e2'); await page.click('#play-square-e4')
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'), null, { timeout: 20000 })
await page.click('text=Aufgeben')
await page.waitForSelector('.summary', { timeout: 20000 })
console.log('Auswertung:', (await page.textContent('.summary'))?.replace(/\s+/g, ' '))
await page.waitForFunction(() => JSON.parse(localStorage.getItem('schach-trainer:profile')).games.length === 1, null, { timeout: 15000 })
console.log('Partie gespeichert ✓')
await page.click('text=Partie genau analysieren')
await page.waitForSelector('.summary:visible', { timeout: 30000 })
console.log('Genaue Analyse geöffnet, Züge:', await page.$$eval('#review-square-e4 [data-piece]', (e) => e.length) >= 0 ? (await page.textContent('.move-list:visible'))?.replace(/\s+/g, ' ').trim() : '')

// 2) Training: erst falsch (Ke1-d2), dann nochmal richtig (Lxb5)
await page.click('nav >> text=Training')
await page.waitForSelector('text=Puzzle aus deiner Partie')
await page.click('#puzzle-square-e1'); await page.click('#puzzle-square-d2')
await page.waitForSelector('.status.bad:visible, .status.ok:visible', { timeout: 20000 })
console.log('Versuch 1:', (await page.textContent('.status:visible'))?.trim())
await page.screenshot({ path: `${dir}/p3-puzzle.png` })
await page.click('button:has-text("⟲ Nochmal") >> visible=true')
await page.click('#puzzle-square-f1'); await page.click('#puzzle-square-b5')
await page.waitForSelector('.status.ok:visible', { timeout: 20000 })
console.log('Versuch 2:', (await page.textContent('.status:visible'))?.trim())
const p = await page.evaluate(() => JSON.parse(localStorage.getItem('schach-trainer:profile')).puzzles[0])
console.log('Puzzle-Box:', p.box, 'Versuche:', p.attempts, 'richtig:', p.correct)

// 3) Statistik
await page.click('nav >> text=Statistik')
await page.waitForSelector('.kpis')
console.log('KPIs:', (await page.textContent('.kpis'))?.replace(/\s+/g, ' '))
await page.screenshot({ path: `${dir}/p3-stats.png`, fullPage: true })

await browser.close()
if (errors.length) { console.log('Fehler:', errors); process.exit(1) }
