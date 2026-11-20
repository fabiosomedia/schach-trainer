// Browser-Test der Spielansicht: Brettfarben, Koordinaten, Brett drehen, Premove,
// Remis-Angebot, Schachuhr (1+0 tickt, Zeitüberschreitung) und Handy-Layout.
// Erwartet einen laufenden Server: `npm run preview`.
// Aufruf: node scripts/e2e-play.mjs [url] [screenshot-ordner]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const dir = process.argv[3] ?? 'e2e-shots'
mkdirSync(dir, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []
const fail = (msg) => {
  throw new Error(msg)
}
const check = (cond, msg) => {
  if (!cond) fail(msg)
  console.log('✓', msg)
}

async function open(viewport) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'))
  return page
}

const status = (page) => page.textContent('.status')
const moveCount = (page) =>
  page.$$eval('.move-row .move', (els) => els.filter((e) => e.textContent?.trim()).length)
const waitMoves = (page, n, timeout = 20000) =>
  page.waitForFunction(
    (n) => [...document.querySelectorAll('.move-row .move')].filter((e) => e.textContent?.trim()).length >= n,
    n,
    { timeout },
  )
const yourTurn = (page) =>
  page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Du bist am Zug'), null, {
    timeout: 20000,
  })
const click = async (page, from, to) => {
  await page.click(`#play-square-${from}`)
  await page.click(`#play-square-${to}`)
}
const clockText = (page, pos) => page.textContent(`.player-bar.${pos} .player-clock`)
const toMs = (t) => {
  const [m, s] = t.trim().split(':')
  return (Number(m) * 60 + Number(s)) * 1000
}
const newGame = async (page, tc) => {
  await page.click(`.tc-seg button:text-is("${tc}")`)
  await page.click('button:has-text("Neues Spiel")')
  await yourTurn(page)
}

// ---------------- Desktop ----------------
const page = await open({ width: 1280, height: 800 })

// Spielerleisten
check((await page.textContent('.player-bar.top .player-name'))?.startsWith('Stockfish · Stufe'), 'Gegner oben')
check((await page.textContent('.player-bar.bottom .player-name')) === 'Du', 'Spieler unten')
check((await page.$$('.player-clock')).length === 0, 'ohne Uhr keine Uhranzeige')

// Brettfarben
const sqColor = () => page.$eval('#play-square-a1', (el) => getComputedStyle(el).backgroundColor)
const before = await sqColor()
await page.click('.theme-swatch:has-text("Turnier")')
const after = await sqColor()
check(before !== after, `Brettfarbe wechselt (${before} → ${after})`)
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('schach-trainer:settings') ?? '{}'))
check(saved.boardTheme === 'turnier', 'Brettfarbe gespeichert')

// Koordinaten
const notation = () =>
  page.$$eval('#play-square-a1 *, #play-square-h1 *', (els) => els.filter((e) => /^[a-h1-8]$/.test(e.textContent ?? '') && e.children.length === 0).length)
const nBefore = await notation()
await page.click('label.check:has-text("Koordinaten") input')
const nAfter = await notation()
check(nBefore > 0 && nAfter === 0, `Koordinaten ausblendbar (${nBefore} → ${nAfter})`)
await page.click('label.check:has-text("Koordinaten") input')

// Brett drehen
const y = (sq) => page.$eval(`#play-square-${sq}`, (el) => el.getBoundingClientRect().top)
check((await y('a1')) > (await y('a8')), 'Weiss unten')
await page.click('.flip-btn')
check((await y('a1')) < (await y('a8')), 'Brett gedreht: Weiss oben')
check((await page.textContent('.player-bar.top .player-name')) === 'Du', 'Leisten drehen mit')
await page.click('.flip-btn')

// Remis-Angebot früh → abgelehnt
await click(page, 'e2', 'e4')
await waitMoves(page, 2)
await yourTurn(page)
await page.waitForTimeout(1500) // Bewertung abwarten
await page.click('button:has-text("Remis anbieten")')
const drawText = await status(page)
check(/lehnt|überlegt/.test(drawText ?? ''), `Remis-Angebot abgelehnt: „${drawText}“`)

// Premove: während Stockfish denkt, Zug vormerken (höchste Stufe → längere Bedenkzeit)
await page.focus('.level input')
await page.keyboard.press('End')
await newGame(page, 'Ohne Uhr')
await click(page, 'd2', 'd4')
await click(page, 'g1', 'f3')
const pmStatus = await status(page)
check(pmStatus?.includes('vorgemerkt: g1–f3'), `Premove angezeigt: „${pmStatus}“`)
const pmMarked = await page.$eval('#play-square-f3', (el) =>
  [el, ...el.querySelectorAll('*')].some((e) => (e.getAttribute('style') ?? '').includes('--premove')),
)
check(pmMarked, 'Premove-Feld markiert')
await page.evaluate(() => scrollTo(0, 0))
await page.screenshot({ path: join(dir, 'play-premove.png') })
await waitMoves(page, 3)
const third = await page.$$eval('.move-row .move', (els) => els[2]?.textContent?.trim())
check(third?.startsWith('Nf3'), `Premove nach Engine-Zug ausgeführt (${third})`)

// Premove löschen per Rechtsklick
await yourTurn(page)
await click(page, 'c2', 'c4')
await click(page, 'b1', 'c3')
check((await status(page))?.includes('vorgemerkt'), 'zweiter Premove vorgemerkt')
await page.click('#play-square-h5', { button: 'right' })
check(!(await status(page))?.includes('vorgemerkt'), 'Rechtsklick löscht Premove')
await waitMoves(page, 6)
await yourTurn(page)
await page.waitForTimeout(500)
check((await moveCount(page)) === 6, 'gelöschter Premove wurde nicht gespielt')
await page.focus('.level input')
await page.keyboard.press('Home')

// Schachuhr 1+0
await newGame(page, '1+0')
check((await clockText(page, 'bottom')).trim() === '1:00', 'Uhr startet bei 1:00')
check((await clockText(page, 'top')).trim() === '1:00', 'Engine-Uhr bei 1:00')
await click(page, 'e2', 'e4')
await waitMoves(page, 2)
await yourTurn(page)
const t1 = toMs(await clockText(page, 'bottom'))
await page.waitForTimeout(2200)
const t2 = toMs(await clockText(page, 'bottom'))
check(t2 < t1 && t1 - t2 >= 1000, `Spieleruhr tickt (${t1} → ${t2} ms)`)
check(await page.$('.player-bar.bottom .player-clock.running'), 'laufende Uhr markiert')
const engineLeft = toMs(await clockText(page, 'top'))
check(engineLeft < 60000 && engineLeft > 50000, `Engine hat Zeit verbraucht, bleibt schnell (${engineLeft} ms)`)
await page.evaluate(() => scrollTo(0, 0))
await page.screenshot({ path: join(dir, 'play-clock-desktop.png') })

// Zeitüberschreitung abwarten (Rest der Minute)
await page.waitForSelector('.player-bar.bottom .player-clock.low', { timeout: 70000 })
check(true, 'Knappe Zeit (< 10 s) markiert')
await page.evaluate(() => scrollTo(0, 0))
await page.screenshot({ path: join(dir, 'play-clock-low.png') })
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('Zeit abgelaufen'), null, {
  timeout: 15000,
})
const flagText = await status(page)
check(flagText?.includes('Stockfish gewinnt'), `Zeit abgelaufen: „${flagText}“`)
check((await clockText(page, 'bottom')).trim() === '0:00.0', 'Uhr steht auf 0')
await page.evaluate(() => scrollTo(0, 0))
await page.screenshot({ path: join(dir, 'play-flag.png') })
await page.close()

// ---------------- Handy ----------------
const phone = await open({ width: 390, height: 844 })
await newGame(phone, '3+2')
await click(phone, 'e2', 'e4')
await waitMoves(phone, 2)
const layout = await phone.evaluate(() => {
  const b = document.querySelector('#play-square-a1')?.closest('.board-wrap')?.getBoundingClientRect()
  const top = document.querySelector('.player-bar.top')?.getBoundingClientRect()
  const bottom = document.querySelector('.player-bar.bottom')?.getBoundingClientRect()
  return {
    scrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
    innerH: innerHeight,
    boardH: b?.height ?? 0,
    stackH: (bottom?.bottom ?? 0) - (top?.top ?? 0),
    barW: bottom?.width ?? 0,
  }
})
console.log('Handy:', JSON.stringify(layout))
check(layout.scrollW <= layout.innerW, 'kein horizontales Scrollen auf 390 px')
check(layout.boardH > 200 && layout.boardH < layout.innerH, 'Brett passt ins Fenster')
check(layout.stackH < layout.innerH, 'Brett + Leisten passen ins Fenster')
await phone.evaluate(() => scrollTo(0, 0))
await phone.screenshot({ path: join(dir, 'play-phone.png') })
await phone.screenshot({ path: join(dir, 'play-phone-full.png'), fullPage: true })

await browser.close()
if (errors.length) {
  console.log('Fehler:', errors)
  process.exit(1)
}
console.log('Alles ok.')
