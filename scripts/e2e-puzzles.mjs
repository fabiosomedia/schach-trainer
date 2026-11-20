// Browser-Test Taktik-Puzzles: ein Puzzle richtig lösen (Lösung aus dem geladenen JSON),
// eines falsch → Wertung steigt/sinkt; Themenfilter; kurzer Sprint (2 gelöst, 3 Fehler).
// Aufruf: node scripts/e2e-puzzles.mjs [url] [screenshot-ordner]
import { Chess } from 'chess.js'
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const dir = process.argv[3] ?? '.'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const fail = (msg) => {
  console.log('FEHLER:', msg)
  errors.push(msg)
}

await page.goto(url)
await page.waitForSelector('nav >> text=Training')

// Alle Puzzles aus dem ausgelieferten JSON (so kennt der Test die Lösung)
const all = await page.evaluate(async () => {
  const base = new URL('puzzles/', location.href).href
  const index = await (await fetch(base + 'index.json')).json()
  const out = {}
  for (const b of index.bands)
    for (const [id, fen, moves, rating, themes] of await (await fetch(base + b.file)).json())
      out[id] = { id, fen, moves: moves.split(' '), rating, themes: themes.split(' ') }
  return out
})
console.log('Puzzles geladen:', Object.keys(all).length)

const stats = () => page.evaluate(() => JSON.parse(localStorage.getItem('schach-trainer:puzzles') ?? 'null'))

async function waitSolving(prefix, notId) {
  await page.waitForFunction(
    ([p, n]) => {
      const s = document.querySelector(`[data-testid="${p}-status"]`)
      return s && s.dataset.phase === 'solving' && s.dataset.puzzleId && s.dataset.puzzleId !== n
    },
    [prefix, notId ?? ''],
    { timeout: 20000 },
  )
  const id = await page.getAttribute(`[data-testid="${prefix}-status"]`, 'data-puzzle-id')
  return all[id]
}

async function play(board, uci) {
  await page.click(`#${board}-square-${uci.slice(0, 2)}`)
  await page.click(`#${board}-square-${uci.slice(2, 4)}`)
  if (uci[4]) {
    const name = { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' }[uci[4]]
    await page.click(`.promo-box button[title="${name}"]`)
  }
}

/** Löst das Puzzle Zug für Zug. */
async function solve(board, p) {
  for (let i = 1; i < p.moves.length; i += 2) {
    await page.waitForFunction((b) => document.querySelector(`[data-testid="${b}-status"]`)?.dataset.phase === 'solving', board, {
      timeout: 10000,
    })
    await play(board, p.moves[i])
  }
}

/** Ein legaler Zug, der weder die Lösung noch Matt ist. */
function wrongMove(p) {
  const c = new Chess(p.fen)
  c.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] })
  for (const m of c.moves({ verbose: true })) {
    const uci = m.from + m.to + (m.promotion ?? '')
    if (uci.slice(0, 4) === p.moves[1].slice(0, 4) || m.promotion) continue
    const t = new Chess(c.fen())
    t.move(m)
    if (!t.isCheckmate()) return uci
  }
  throw new Error('kein falscher Zug gefunden')
}

// ---------------- Taktik
await page.click('nav >> text=Training')
await page.waitForSelector('[data-mode="tactics"][aria-pressed="true"]')
let p = await waitSolving('tactics')
console.log('Puzzle 1:', p.id, p.rating, p.themes.join(','))
await solve('tactics', p)
await page.waitForSelector('.status.ok:visible')
let delta = (await page.textContent('[data-testid="rating-delta"]'))?.trim()
let s = await stats()
console.log('Gelöst ✓  Änderung:', delta, ' Wertung:', s.rating, ' Serie:', s.streak)
if (!delta?.startsWith('+') || s.rating <= 1200 || s.streak !== 1) fail('Wertung nach Lösung falsch')
if (!(await page.isVisible('[data-testid="themes"]'))) fail('Themen nicht sichtbar')
console.log('Themen:', (await page.textContent('[data-testid="themes"]'))?.trim())
await page.screenshot({ path: `${dir}/pz-solved.png` })
const r1 = s.rating

await page.click('button:has-text("Nächstes")')
p = await waitSolving('tactics', p.id)
console.log('Puzzle 2:', p.id, p.rating)
await page.click('button:has-text("Thema zeigen")')
await page.waitForSelector('[data-testid="themes"]')
await play('tactics', wrongMove(p))
await page.waitForSelector('.status.bad:visible')
delta = (await page.textContent('[data-testid="rating-delta"]'))?.trim()
s = await stats()
console.log('Falsch ✗  Änderung:', delta, ' Wertung:', s.rating, ' Serie:', s.streak)
if (!delta?.startsWith('−') || s.rating >= r1 || s.streak !== 0) fail('Wertung nach Fehler falsch')
await page.screenshot({ path: `${dir}/pz-wrong.png` })
await page.waitForFunction(() => document.querySelector('[data-testid="tactics-status"]')?.dataset.phase === 'solving')
await page.click('button:has-text("Lösung zeigen")')
await page.waitForSelector('[data-testid="solution"]')
console.log('Lösung:', (await page.textContent('[data-testid="solution"]'))?.trim())
await page.waitForTimeout(650 * p.moves.length + 300)
await page.screenshot({ path: `${dir}/pz-shown.png` })
if ((await stats()).games !== 2) fail('Lösung zeigen hat doppelt gewertet')

// Themenfilter
await page.selectOption('[data-testid="theme-filter"]', 'fork')
p = await waitSolving('tactics', p.id)
console.log('Filter Gabel → Puzzle', p.id, p.themes.join(','))
if (!p.themes.includes('fork')) fail('Themenfilter greift nicht')
await page.selectOption('[data-testid="theme-filter"]', '')

// ---------------- Sprint
await page.click('[data-mode="sprint"]')
await page.click('button:has-text("Sprint starten")')
let last = ''
for (let k = 0; k < 2; k++) {
  p = await waitSolving('sprint', last)
  last = p.id
  await solve('sprint', p)
}
console.log('Sprint: 2 gelöst, Punkte', (await page.textContent('[data-testid="sprint-score"]'))?.trim())
await page.screenshot({ path: `${dir}/pz-sprint.png` })
for (let k = 0; k < 3; k++) {
  p = await waitSolving('sprint', last)
  last = p.id
  console.log('  Sprint-Puzzle', p.id, p.rating)
  await play('sprint', wrongMove(p))
}
await page.waitForSelector('[data-testid="sprint-over"]', { timeout: 10000 })
const final = (await page.textContent('[data-testid="sprint-final"]'))?.trim()
const best = (await page.textContent('[data-testid="sprint-best"]'))?.trim()
console.log('Sprint vorbei: Punkte', final, ' Rekord', best)
if (final !== '2' || best !== '2' || (await stats()).sprintBest !== 2) fail('Sprint-Ergebnis falsch')
await page.screenshot({ path: `${dir}/pz-sprint-over.png` })

// ---------------- Handy
await page.setViewportSize({ width: 390, height: 844 })
await page.click('[data-mode="tactics"]')
await waitSolving('tactics')
await page.screenshot({ path: `${dir}/pz-phone.png`, fullPage: true })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
if (overflow) fail('Handy: horizontaler Überlauf')

await browser.close()
if (errors.length) {
  console.log('Fehler:', errors)
  process.exit(1)
}
console.log('Alles ok ✓')
