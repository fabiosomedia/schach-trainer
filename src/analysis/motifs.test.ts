import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../engine/stockfish'
import type { Score } from '../engine/uci'
import { analyseMove, type MoveInput } from './explain'
import { backRankMate, detectTactic, pinnedBy, trappedPiece } from './motifs'

function mv(fenBefore: string, uci: string, ply = 0): MoveInput {
  const c = new Chess(fenBefore)
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return { ply, fenBefore, fenAfter: c.fen(), san: m.san, from: m.from, to: m.to, piece: m.piece, color: m.color, promotion: m.promotion }
}
const res = (score: Score, pv: string[]): SearchResult => ({ bestmove: pv[0] ?? null, lines: [{ multipv: 1, depth: 12, score, pv }] })
const cp = (value: number): Score => ({ type: 'cp', value })
const after = (fen: string, uci: string) => mv(fen, uci).fenAfter

describe('Fesselung', () => {
  it('verpasst: absolute Fesselung (Läufer fesselt Turm an den König)', () => {
    const fen = '4k3/3r4/8/8/8/8/8/4KB2 w - - 0 1'
    const a = analyseMove(mv(fen, 'e1f2'), res(cp(250), ['f1b5', 'e8e7', 'b5d7', 'e7d7']), res(cp(150), ['e8e7']))
    expect(a.motif).toBe('missed_pin')
    expect(a.text).toContain('den Turm auf d7 an den König gefesselt')
  })

  it('verpasst: relative Fesselung (Turm fesselt Springer an die Dame)', () => {
    const fen = '4q2k/8/5p2/4n3/8/3P4/8/R5K1 w - - 0 1'
    const t = detectTactic(fen, ['a1e1', 'h8g8', 'd3d4', 'g8h8', 'd4e5', 'f6e5'])
    expect(t).toMatchObject({ kind: 'pin', pinnedSq: 'e5', behind: 'q', exploit: false })
    const a = analyseMove(mv(fen, 'g1g2'), res(cp(-300), ['a1e1', 'h8g8', 'd3d4', 'g8h8', 'd4e5', 'f6e5']), res(cp(700), ['h8g8']))
    expect(a.motif).toBe('missed_pin')
    expect(a.text).toContain('an die Dame gefesselt')
  })

  it('verpasst: bestehende Fesselung ausnutzen (Bauer greift gefesselten Springer an)', () => {
    const fen = '4k3/8/8/4n3/8/8/5P2/4R1K1 w - - 0 1'
    expect(pinnedBy(new Chess(fen), 'e5', 'w')).toMatchObject({ sq: 'e1', behind: { type: 'k' } })
    const a = analyseMove(mv(fen, 'g1g2'), res(cp(500), ['f2f4', 'e8d7', 'f4e5']), res(cp(-200), ['e8d7']))
    expect(a.motif).toBe('missed_pin')
    expect(a.text).toContain('gefesselt und kann nicht ausweichen')
  })

  it('zugelassen: Läufer fesselt den Turm an den König', () => {
    const fen = '4kb2/8/8/8/8/8/R7/4K3 w - - 0 1'
    const a = analyseMove(mv(fen, 'a2d2'), res(cp(200), ['a2a7']), res(cp(0), ['f8b4', 'e1e2', 'b4d2', 'e2d2']))
    expect(a.motif).toBe('allowed_pin')
    expect(a.text).toContain('dein Turm auf d2 an deinen König gefesselt')
  })

  it('meldet keine Fesselung, wenn die Variante nichts gewinnt', () => {
    expect(detectTactic('4k3/3r4/8/8/8/8/8/4KB2 w - - 0 1', ['f1b5', 'd7d1'])).toBeNull()
  })
})

describe('Spiess', () => {
  it('zugelassen: Turmschach, dahinter fällt die Dame', () => {
    const fen = 'r5k1/8/8/8/3K4/8/8/7Q w - - 0 1'
    const a = analyseMove(mv(fen, 'h1h4'), res(cp(900), ['h1h8']), res(cp(500), ['a8a4', 'd4c3', 'a4h4']))
    expect(a.motif).toBe('allowed_skewer')
    expect(a.text).toContain('Spiess! Ra4+ greift deinen König an')
    expect(a.text).toContain('deine Dame auf h4')
  })
  it('verpasst (gleiche Stellung aus Sicht von Schwarz)', () => {
    const fen = after('r5k1/8/8/8/3K4/8/8/7Q w - - 0 1', 'h1h4')
    const a = analyseMove(mv(fen, 'g8f7'), res(cp(500), ['a8a4', 'd4c3', 'a4h4']), res(cp(800), ['h4h7']))
    expect(a.motif).toBe('missed_skewer')
    expect(a.text).toContain('dahinter steht die Dame auf h4')
  })
})

describe('Abzugsangriff', () => {
  it('verpasst: Abzugsschach – Springer zieht mit Drohung, Turm gibt Schach', () => {
    const fen = '4k3/1q6/8/8/4N3/8/8/4R1K1 w - - 0 1'
    const t = detectTactic(fen, ['e4c5', 'e8d8', 'c5b7', 'd8c7'])
    expect(t).toMatchObject({ kind: 'discovered', check: true, double: false, lineSq: 'e1' })
    const a = analyseMove(mv(fen, 'g1h1'), res(cp(700), ['e4c5', 'e8d8', 'c5b7', 'd8c7']), res(cp(100), ['b7b1']))
    expect(a.motif).toBe('missed_discovered')
    expect(a.text).toContain('Abzugsschach verpasst')
  })

  it('verpasst: Abzugsangriff – Springer greift die Dame an, Läufer den Turm', () => {
    const fen = 'k2q3r/8/8/8/3N4/8/1B6/6K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'g1f2'), res(cp(-300), ['d4e6', 'd8e7', 'b2h8', 'e7e6']), res(cp(600), ['a8b7']))
    expect(a.motif).toBe('missed_discovered')
    expect(a.text).toContain('der Läufer auf b2 den Turm auf h8 angegriffen')
  })

  it('erkennt Doppelschach', () => {
    // Springer e4-f6+ gibt selbst Schach, der Turm e1 ebenfalls
    const t = detectTactic('4k3/8/8/8/4N3/8/1q6/4R1K1 w - - 0 1', ['e4f6', 'e8f7', 'f6d5', 'b2b1'])
    expect(t).toBeNull() // Variante gewinnt nichts → keine Meldung
    const t2 = detectTactic('4k3/8/8/7q/4N3/8/8/4R1K1 w - - 0 1', ['e4f6', 'e8f7', 'f6h5'])
    expect(t2).toMatchObject({ kind: 'discovered', check: true, double: true })
  })
})

describe('Grundreihe', () => {
  it('zugelassen: Turm verlässt die Grundreihe, Rd1#', () => {
    const fen = '3r2k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'b1b7'), res(cp(0), ['h2h3']), res({ type: 'mate', value: 1 }, ['d8d1']))
    expect(a.motif).toBe('allowed_back_rank')
    expect(a.text).toContain('Dein König auf g1')
    expect(a.text).toContain('Rd1#')
  })
  it('kein Grundreihenmatt, wenn der König ein Luftloch hat', () => {
    // h3 ist gezogen: Rd1+ ist kein Matt (Kh2)
    expect(backRankMate('3r2k1/5ppp/8/8/8/7P/5PP1/6K1 b - - 0 1', ['d8d1'], 1)).toBeNull()
  })
})

describe('Doppelangriff der Dame', () => {
  it('zugelassen: Dame gibt Schach und greift den ungedeckten Turm an', () => {
    const fen = '3q2k1/6pp/8/8/8/8/R5PP/6K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'a2a1'), res(cp(-400), ['h2h3']), res(cp(900), ['d8d4', 'g1h1', 'd4a1']))
    expect(a.motif).toBe('allowed_double_attack')
    expect(a.text).toContain('Doppelangriff der Dame! Nach Qd4+')
    expect(a.text).toContain('deinen Turm auf a1')
  })
  it('Springergabel bleibt eine Gabel', () => {
    const t = detectTactic('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7', 'e8d7', 'c7a8'])
    expect(t).toMatchObject({ kind: 'fork', piece: 'n' })
  })
})

describe('Eingesperrte Figur', () => {
  it('zugelassen: Läufer auf h4 wird von g5 eingesperrt', () => {
    const fen = '3B2k1/6p1/7p/8/8/6P1/5P1P/6K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'd8h4'), res(cp(300), ['g1g2']), res(cp(-50), ['g7g5', 'g1g2', 'g5h4', 'g3h4']))
    expect(a.motif).toBe('trapped_piece')
    expect(a.text).toContain('Dein Läufer auf h4 ist eingesperrt')
  })
  it('nicht eingesperrt, wenn ein Fluchtfeld frei ist', () => {
    // ohne Bauer g3 kann der Läufer nach g3 zurück
    const c = new Chess(after('3B2k1/6p1/7p/8/7B/8/5P1P/6K1 b - - 0 1', 'g7g5'))
    expect(trappedPiece(c, 'g5', 'w')).toBeNull()
  })
})
