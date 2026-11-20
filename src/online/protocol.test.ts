import { describe, expect, it } from 'vitest'
import {
  claimWin,
  colorOf,
  currentClocks,
  hostTick,
  joinIdFromSearch,
  localDraw,
  localMove,
  localRematch,
  localResign,
  newSession,
  parseMessage,
  receive,
  replay,
  sessionPgn,
  turnOf,
  type Msg,
  type Role,
  type Session,
} from './protocol'

const names = { host: 'Anna', guest: 'Ben' }
const fresh = (tcId = '3+2', now = 0) => newSession({ hostColor: 'w', tcId, names, now })

/** Simuliert beide Seiten: wendet eine lokale Aktion an und stellt die Nachrichten zu. */
function deliver(from: Role, msgs: Msg[], to: Session, now: number): Session {
  let s = to
  const role: Role = from === 'host' ? 'guest' : 'host'
  for (const m of msgs) {
    const parsed = parseMessage(JSON.parse(JSON.stringify(m)))
    expect(parsed).not.toBeNull()
    const r = receive(s, role, parsed!, now)
    if (r) s = r.s
  }
  return s
}

describe('Online-Protokoll', () => {
  it('Züge laufen in beide Richtungen und werden geprüft', () => {
    let host = fresh()
    let guest = fresh()
    // Gast (Schwarz) darf nicht zuerst ziehen
    expect(localMove(guest, 'guest', 'e7e5', 0)).toBeNull()
    // Illegaler Zug
    expect(localMove(host, 'host', 'e2e5', 0)).toBeNull()
    const a = localMove(host, 'host', 'e2e4', 100)!
    host = a.s
    guest = deliver('host', a.out, guest, 150)
    expect(guest.moves).toEqual(['e2e4'])
    const b = localMove(guest, 'guest', 'e7e5', 200)!
    guest = b.s
    host = deliver('guest', b.out, host, 250)
    expect(host.moves).toEqual(['e2e4', 'e7e5'])
    expect(turnOf(host)).toBe('w')
  })

  it('ignoriert fremde, doppelte und ausser-der-Reihe-Nachrichten', () => {
    const host = fresh()
    expect(receive(host, 'host', { t: 'move', g: 1, ply: 0, uci: 'e2e4', clocks: null }, 0)).toBeNull() // Weiss = Gastgeber
    const guest = fresh()
    expect(receive(guest, 'guest', { t: 'move', g: 2, ply: 0, uci: 'e2e4', clocks: null }, 0)).toBeNull() // falsche Partie
    expect(receive(guest, 'guest', { t: 'move', g: 1, ply: 3, uci: 'e2e4', clocks: null }, 0)).toBeNull() // falscher Halbzug
    expect(receive(guest, 'guest', { t: 'move', g: 1, ply: 0, uci: 'e2e5', clocks: null }, 0)).toBeNull() // illegal
    const ok = receive(guest, 'guest', { t: 'move', g: 1, ply: 0, uci: 'e2e4', clocks: null }, 0)!
    expect(receive(ok.s, 'guest', { t: 'move', g: 1, ply: 0, uci: 'e2e4', clocks: null }, 0)).toBeNull() // doppelt
  })

  it('Bauernumwandlung', () => {
    const moves = ['a2a4', 'h7h5', 'a4a5', 'h5h4', 'a5a6', 'h4h3', 'a6b7', 'h3g2', 'b7a8q']
    const chess = replay(moves)!
    expect(chess.get('a8')).toEqual({ type: 'q', color: 'w' })
    expect(replay(['a2a4', 'h7h5', 'a4a5', 'h5h4', 'a5a6', 'h4h3', 'a6b7', 'h3g2', 'b7a8'])).toBeNull()
  })

  it('Gastgeber misst die Zeit des Gastes und schickt sie zurück', () => {
    let host = fresh('3+2')
    let guest = fresh('3+2')
    const play = (role: Role, uci: string, tSend: number, tRecv: number) => {
      const s = role === 'host' ? host : guest
      const r = localMove(s, role, uci, tSend)!
      if (role === 'host') {
        host = r.s
        guest = deliver('host', r.out, guest, tRecv)
      } else {
        guest = r.s
        const res = receive(host, 'host', parseMessage(r.out[0])!, tRecv)!
        host = res.s
        guest = deliver('host', res.out, guest, tRecv + 50)
      }
    }
    play('host', 'e2e4', 1000, 1050)
    play('guest', 'e7e5', 5000, 5050)
    expect(host.clocks).toEqual({ w: 180_000, b: 180_000 }) // erste Züge kosten nichts
    play('host', 'g1f3', 11_050, 11_100) // Weiss hat 6 s nachgedacht → −6 s + 2 s
    expect(host.clocks!.w).toBe(176_000)
    expect(guest.clocks!.w).toBe(176_000)
    // Gast denkt (laut Gastgeber) 20 s, behauptet 3 s Netzwerkverzögerung → max. 1 s gutgeschrieben
    const g = localMove(guest, 'guest', 'b8c6', 11_100 + 17_000)!
    guest = g.s
    const res = receive(host, 'host', parseMessage(g.out[0])!, 11_050 + 20_000)!
    expect(res.s.clocks!.b).toBe(180_000 - 20_000 + 1000 + 2000)
    expect(res.out[0]).toMatchObject({ t: 'clock', ply: 4 })
    guest = deliver('host', res.out, guest, 31_100)
    expect(guest.clocks).toEqual(res.s.clocks)
    expect(guest.turnStartedAt).toBe(31_100)
  })

  it('Zeitüberschreitung stellt nur der Gastgeber fest', () => {
    let host = fresh('1+0')
    for (const [i, m] of ['e2e4', 'e7e5'].entries()) {
      const r = i % 2 === 0 ? localMove(host, 'host', m, 0)! : receive(host, 'host', { t: 'move', g: 1, ply: 1, uci: m, clocks: null }, 0)!
      host = r.s
    }
    expect(hostTick(host, 59_000)).toBeNull()
    const t = hostTick(host, 60_001)!
    expect(t.s.result).toEqual({ result: '0-1', reason: 'Zeit abgelaufen' })
    expect(t.out[0].t).toBe('sync')
    const guest = deliver('host', t.out, fresh('1+0'), 60_100)
    expect(guest.result?.result).toBe('0-1')
    expect(guest.moves).toEqual(['e2e4', 'e7e5'])
    expect(currentClocks(guest, 99_999)).toEqual({ w: 0, b: 60_000 })
    // Zu später Gastzug wird zum Zeitverlust
    let h2 = fresh('1+0')
    h2 = localMove(h2, 'host', 'e2e4', 0)!.s
    h2 = receive(h2, 'host', { t: 'move', g: 1, ply: 1, uci: 'e7e5', clocks: null }, 0)!.s
    h2 = localMove(h2, 'host', 'g1f3', 0)!.s
    const late = receive(h2, 'host', { t: 'move', g: 1, ply: 3, uci: 'b8c6', clocks: { w: 60_000, b: 30_000 } }, 61_500)!
    expect(late.s.result?.result).toBe('1-0')
    expect(late.s.moves.length).toBe(3)
  })

  it('ohne Uhr gibt es keine Zeit', () => {
    const s = fresh('none')
    expect(s.clocks).toBeNull()
    expect(hostTick(s, 1e9)).toBeNull()
    expect(localMove(s, 'host', 'e2e4', 1e9)!.out[0]).toMatchObject({ clocks: null })
  })

  it('Matt beendet die Partie auf beiden Seiten', () => {
    let host = fresh('none')
    let guest = fresh('none')
    const seq = ['f2f3', 'e7e5', 'g2g4', 'd8h4']
    seq.forEach((m, i) => {
      if (i % 2 === 0) {
        const r = localMove(host, 'host', m, 0)!
        host = r.s
        guest = deliver('host', r.out, guest, 0)
      } else {
        const r = localMove(guest, 'guest', m, 0)!
        guest = r.s
        host = deliver('guest', r.out, host, 0)
      }
    })
    expect(host.result).toEqual({ result: '0-1', reason: 'Schachmatt' })
    expect(guest.result).toEqual(host.result)
    expect(localMove(host, 'host', 'e1f2', 0)).toBeNull()
  })

  it('Aufgabe', () => {
    const guest = fresh()
    const r = localResign(guest, 'guest')!
    expect(r.s.result).toEqual({ result: '1-0', reason: 'Aufgabe' })
    const h = receive(fresh(), 'host', r.out[0], 0)!
    expect(h.s.result).toEqual({ result: '1-0', reason: 'Aufgabe' })
    expect(h.out[0].t).toBe('sync')
    expect(localResign(r.s, 'guest')).toBeNull()
  })

  it('Remisangebot: anbieten, ablehnen, annehmen; ein Zug zieht es zurück', () => {
    let host = fresh()
    let guest = fresh()
    const offer = localDraw(guest, 'guest', 'offer')!
    guest = offer.s
    host = deliver('guest', offer.out, host, 0)
    expect(host.drawOffer).toBe('guest')
    // Eigenes Angebot kann man nicht selbst annehmen
    expect(localDraw(guest, 'guest', 'accept')).toBeNull()
    const dec = localDraw(host, 'host', 'decline')!
    host = dec.s
    guest = deliver('host', dec.out, guest, 0)
    expect(guest.drawOffer).toBeNull()

    guest = localDraw(guest, 'guest', 'offer')!.s
    host = deliver('guest', [{ t: 'draw', g: 1, a: 'offer' }], host, 0)
    const acc = localDraw(host, 'host', 'accept')!
    expect(acc.s.result).toEqual({ result: '1/2-1/2', reason: 'Remis vereinbart' })
    guest = deliver('host', acc.out, guest, 0)
    expect(guest.result?.result).toBe('1/2-1/2')

    let h2 = localDraw(fresh(), 'host', 'offer')!.s
    h2 = localMove(h2, 'host', 'e2e4', 0)!.s
    expect(h2.drawOffer).toBeNull()
  })

  it('Revanche mit getauschten Farben', () => {
    let host = localResign(fresh(), 'host')!.s
    let guest = deliver('host', [{ t: 'resign', g: 1 }], fresh(), 0)
    expect(localRematch(fresh(), 'host', 'offer', 0)).toBeNull() // Partie läuft noch

    // Gast bietet an, Gastgeber nimmt an
    const off = localRematch(guest, 'guest', 'offer', 0)!
    guest = off.s
    host = deliver('guest', off.out, host, 0)
    const acc = localRematch(host, 'host', 'accept', 10)!
    host = acc.s
    expect(host.gameNo).toBe(2)
    expect(colorOf(host, 'host')).toBe('b')
    guest = deliver('host', acc.out, guest, 20)
    expect(guest.gameNo).toBe(2)
    expect(colorOf(guest, 'guest')).toBe('w')
    expect(guest.moves).toEqual([])
    expect(guest.result).toBeNull()

    // Gastgeber bietet an, Gast nimmt an → Gastgeber startet
    host = localResign(host, 'host')!.s
    guest = deliver('host', [{ t: 'resign', g: 2 }], guest, 0)
    const off2 = localRematch(host, 'host', 'offer', 0)!
    host = off2.s
    guest = deliver('host', off2.out, guest, 0)
    const acc2 = localRematch(guest, 'guest', 'accept', 0)!
    expect(acc2.out[0]).toMatchObject({ t: 'rematch', a: 'accept' })
    const h = receive(host, 'host', acc2.out[0], 0)!
    expect(h.s.gameNo).toBe(3)
    expect(h.s.hostColor).toBe('w')
    expect(h.out[0].t).toBe('sync')
  })

  it('Sieg beanspruchen bei Verbindungsabbruch', () => {
    expect(claimWin(fresh(), 'guest')!.s.result).toEqual({ result: '0-1', reason: 'Gegner hat die Verbindung verloren' })
  })

  it('parseMessage verwirft Unsinn', () => {
    expect(parseMessage('kein json')).toBeNull()
    expect(parseMessage({ t: 'move', g: 1, ply: 0, uci: 'e2e4; drop table' })).toBeNull()
    expect(parseMessage({ t: 'hack' })).toBeNull()
    expect(parseMessage({ t: 'chat', text: '   ' })).toBeNull()
    expect(parseMessage({ t: 'chat', text: 'x'.repeat(1000) })).toMatchObject({ text: 'x'.repeat(300) })
    expect(parseMessage({ t: 'sync', s: { gameNo: 1 } })).toBeNull()
    expect(parseMessage({ t: 'hello', v: 1, token: 'abc', name: '' })).toEqual({ t: 'hello', v: 1, token: 'abc', name: 'Gast' })
    expect(parseMessage('{"t":"ping"}')).toEqual({ t: 'ping' })
  })

  it('PGN mit Namen und Ergebnis', () => {
    let s = localMove(fresh(), 'host', 'e2e4', 0)!.s
    s = localResign(s, 'guest')!.s
    const pgn = sessionPgn(s, new Date('2026-11-20T10:00:00Z'))
    expect(pgn).toContain('[White "Anna"]')
    expect(pgn).toContain('[Black "Ben"]')
    expect(pgn).toContain('[Result "1-0"]')
    expect(pgn).toContain('1. e4')
  })

  it('Einladungslink', () => {
    expect(joinIdFromSearch('?join=abc-123_x')).toBe('abc-123_x')
    expect(joinIdFromSearch('?foo=1')).toBeNull()
    expect(joinIdFromSearch('?join=<script>')).toBeNull()
  })
})
