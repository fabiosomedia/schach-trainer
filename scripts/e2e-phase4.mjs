// Browser-Test Phase 4: Endspiel-Übung starten; PGN (Schäfermatt) als Schwarz analysieren.
// Aufruf: node scripts/e2e-phase4.mjs [url] [screenshot-ordner]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const dir = process.argv[3] ?? '.'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(url)
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))

// 1) Endspiel K+D gegen K
await page.selectOption('select', 'kq-k')
await page.click('text=Neues Spiel')
await page.waitForSelector('.goal')
console.log('Aufgabe:', (await page.textContent('.goal p'))?.slice(0, 60), '…')
await page.click('#play-square-d1'); await page.click('#play-square-d4')
await page.waitForFunction(() => [...document.querySelectorAll('.move-row .move')].filter((e) => e.textContent?.trim()).length >= 2, null, { timeout: 20000 })
console.log('Züge:', (await page.textContent('.move-list'))?.replace(/\s+/g, ' ').trim())
await page.screenshot({ path: `${dir}/p4-endgame.png` })

// 2) Analyse: Schäfermatt aus Sicht von Schwarz
await page.click('nav >> text=Analyse')
await page.fill('textarea', '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0')
await page.click('text=Ich war Schwarz')
await page.click('button:text-is("Analysieren")')
await page.waitForSelector('.jump button', { timeout: 30000 })
await page.waitForFunction(() => !document.querySelector('.status:not([hidden])')?.textContent?.includes('Analysiere'), null, { timeout: 30000 })
console.log('Fehler-Sprungliste:', await page.$$eval('.jump button', (b) => b.map((x) => x.textContent)))
await page.click('.jump button')
await page.waitForTimeout(600) // Brett-Animation abwarten
console.log('Coach:', (await page.textContent('.coach .badge:visible'))?.trim(), '–', (await page.textContent('.coach .coach-text:visible'))?.trim())
await page.screenshot({ path: `${dir}/p4-review.png` })

// Bessere Fortsetzung durchspielen: nach "g6" muss auf g6 ein schwarzer Bauer stehen
console.log('Variante:', await page.$$eval('.variation-moves button', (b) => b.map((x) => x.textContent?.trim()).join(' ')))
await page.click('text=Durchspielen')
await page.waitForTimeout(600)
console.log('Status:', (await page.textContent('.status:visible'))?.trim())
console.log('g6 =', await page.getAttribute('#review-square-g6 [data-piece]', 'data-piece'))
await page.click('text=Weiter')
await page.waitForTimeout(600)
console.log('Status:', (await page.textContent('.status:visible'))?.trim())
await page.screenshot({ path: `${dir}/p4-variation.png` })
await page.click('text=Zurück zur Partie')

await browser.close()
if (errors.length) { console.log('Fehler:', errors); process.exit(1) }
