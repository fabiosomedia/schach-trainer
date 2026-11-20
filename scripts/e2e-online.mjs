// Browser-Test für Online-Partien: zwei Seiten (Gastgeber + Gast) verbinden sich über den
// öffentlichen PeerJS-Server (braucht Internet), spielen Züge, chatten, bieten Remis an,
// geben auf, öffnen die Analyse und spielen eine Revanche mit getauschten Farben.
// Erwartet einen laufenden Server: `npm run build && npx vite preview --port 4181 --strictPort`.
// Aufruf: node scripts/e2e-online.mjs [url] [screenshot-präfix]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:4181/'
const shot = process.argv[3] ?? 'online'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []
const open = async (label) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${label}: ${e}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`))
  page.on('dialog', (d) => d.accept())
  return page
}
const host = await open('host')
const guest = await open('guest')

const T = 30000
const status = (p) => p.textContent('#online-status')
const waitStatus = (p, text) =>
  p.waitForFunction((t) => document.querySelector('#online-status')?.textContent?.includes(t), text, { timeout: T })
const sans = (p) =>
  p.$$eval('.online .move-row .move', (els) => els.map((e) => e.textContent?.trim()).filter(Boolean))
const waitSan = (p, n) =>
  p.waitForFunction(
    (n) => [...document.querySelectorAll('.online .move-row .move')].filter((e) => e.textContent?.trim()).length >= n,
    n,
    { timeout: T },
  )
const move = async (p, from, to) => {
  await p.click(`#online-square-${from}`)
  await p.click(`#online-square-${to}`)
}
const clock = (p, who) => p.textContent(`#online-clock-${who}`)
const step = (msg) => console.log(`✓ ${msg}`)

// --- Gastgeber erstellt eine Partie ---
await host.goto(url)
await host.click('nav.tabs button:has-text("Online")')
await host.fill('#online-name', 'Anna')
await host.click('.online-tc button:has-text("3+2")')
await host.click('.online .seg button:has-text("Weiss")')
await host.click('#online-create')
await host.waitForFunction(() => document.querySelector('#online-invite')?.value?.includes('?join='), null, { timeout: T })
const invite = await host.inputValue('#online-invite')
step(`Einladung: ${invite}`)
await host.screenshot({ path: `${shot}-1-einladung.png` })

// --- Gast öffnet den Link → Online-Tab automatisch, Partie startet ---
await guest.goto(invite)
await waitStatus(guest, 'Anna ist am Zug')
await waitStatus(host, 'Du bist am Zug')
step(`verbunden – Gast: "${await status(guest)}", Gastgeber: "${await status(host)}"`)

// --- Züge in beide Richtungen ---
await move(host, 'e2', 'e4')
await waitSan(guest, 1)
await move(guest, 'e7', 'e5')
await waitSan(host, 2)
await move(host, 'g1', 'f3')
await waitSan(guest, 3)
await move(guest, 'b8', 'c6')
await waitSan(host, 4)
const hostSans = await sans(host)
const guestSans = await sans(guest)
if (hostSans.join() !== guestSans.join() || hostSans.join() !== 'e4,e5,Nf3,Nc6') throw new Error(`Züge stimmen nicht: ${hostSans} / ${guestSans}`)
step(`Züge auf beiden Seiten: ${hostSans.join(' ')}`)

// Illegaler Zug wird nicht ausgeführt, Gast darf nicht ausser der Reihe ziehen
await move(guest, 'd7', 'd5')
await move(host, 'e4', 'e6')
await host.waitForTimeout(500)
if ((await sans(host)).length !== 4 || (await sans(guest)).length !== 4) throw new Error('Unerlaubter Zug wurde ausgeführt')
step('unerlaubte Züge ignoriert')

// --- Uhren laufen (Weiss am Zug) ---
const c1 = await clock(host, 'me')
const g1 = await clock(guest, 'opp')
await host.waitForTimeout(2500)
const c2 = await clock(host, 'me')
const g2 = await clock(guest, 'opp')
if (c1 === c2 || g1 === g2) throw new Error(`Uhr läuft nicht: ${c1}→${c2}, ${g1}→${g2}`)
step(`Uhr Weiss: Gastgeber ${c1} → ${c2}, beim Gast ${g1} → ${g2}; Schwarz ${await clock(host, 'opp')}`)

// --- Chat ---
await guest.fill('#online-chat-input', 'Viel Glück!')
await guest.press('#online-chat-input', 'Enter')
await host.waitForSelector('.online-msg.them:has-text("Viel Glück!")', { timeout: T })
step('Chat angekommen')

// --- Remis anbieten / ablehnen ---
await host.click('#online-draw')
await guest.waitForSelector('.online-offer:has-text("bietet Remis an")', { timeout: T })
await guest.click('.online-offer button:has-text("Ablehnen")')
await host.waitForFunction(() => !document.querySelector('#online-draw')?.textContent?.includes('angeboten'), null, { timeout: T })
step('Remisangebot abgelehnt')

await host.screenshot({ path: `${shot}-2-partie-host.png` })
await guest.screenshot({ path: `${shot}-2-partie-gast.png` })

// --- Aufgabe ---
await guest.click('#online-resign')
await waitStatus(host, 'Du hast gewonnen')
await waitStatus(guest, 'Anna gewinnt')
step(`Aufgabe – Gastgeber: "${await status(host)}" / Gast: "${await status(guest)}"`)
await guest.screenshot({ path: `${shot}-3-ende-gast.png` })

// --- Analyse öffnen (Gast) und zurück ---
await guest.click('#online-review')
await guest.waitForSelector('#review-square-e4', { timeout: T })
step('Analyse geöffnet')
await guest.click('nav.tabs button:has-text("Online")')

// --- Revanche: Gastgeber bietet an, Gast nimmt an → Farben getauscht ---
await host.click('#online-rematch')
await guest.waitForSelector('#online-rematch-accept', { timeout: T })
await guest.click('#online-rematch-accept')
await waitStatus(guest, 'Du bist am Zug')
await waitStatus(host, 'ist am Zug')
await move(guest, 'd2', 'd4')
await waitSan(host, 1)
step(`Revanche läuft, Gast spielt jetzt Weiss: ${(await sans(host)).join(' ')}`)
await host.waitForTimeout(400) // Zug-Animation abwarten
await host.screenshot({ path: `${shot}-4-revanche-host.png` })

// --- Gast lädt die Seite neu → verbindet sich wieder, Partie wird abgeglichen ---
await move(host, 'd7', 'd5')
await waitSan(guest, 2)
await guest.reload()
await waitStatus(guest, 'Du bist am Zug')
const afterReload = await sans(guest)
if (afterReload.join() !== 'd4,d5') throw new Error(`Nach Neuladen falsche Züge: ${afterReload}`)
await move(guest, 'c2', 'c4')
await waitSan(host, 3)
step(`Gast hat neu geladen und spielt weiter: ${(await sans(host)).join(' ')}`)

// --- Gast verschwindet → Gastgeber sieht Abbruch und kann nach ~30 s den Sieg beanspruchen ---
await guest.context().close()
await host.waitForSelector('.online-banner:has-text("Verbindung unterbrochen")', { timeout: T })
step('Verbindungsabbruch erkannt')
await host.screenshot({ path: `${shot}-5-abbruch.png` })
await host.waitForSelector('.online-banner button:has-text("Sieg beanspruchen")', { timeout: 60000 })
await host.click('.online-banner button:has-text("Sieg beanspruchen")')
await waitStatus(host, 'Du hast gewonnen')
step(`Sieg beansprucht: "${await status(host)}"`)

await browser.close()
if (errors.length) {
  console.log('Fehler:', errors)
  process.exit(1)
}
console.log('Alles ok')
