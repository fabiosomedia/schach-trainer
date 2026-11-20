import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../engine/stockfish'
import type { Score } from '../engine/uci'
import { classify } from './classify'
import { formatEval, winPercent } from './eval'
import { analyseMove, gamePhase, type MoveInput } from './explain'

/** Baut einen MoveInput aus FEN + UCI-Zug. */
function mv(fenBefore: string, uci: string, ply = 0): MoveInput {
  const c = new Chess(fenBefore)
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return { ply, fenBefore, fenAfter: c.fen(), san: m.san, from: m.from, to: m.to, piece: m.piece, color: m.color, promotion: m.promotion }
}

/** Engine-Ergebnis mit einer Variante (Score aus Sicht der Seite am Zug). */
const res = (score: Score, pv: string[]): SearchResult => ({ bestmove: pv[0] ?? null, lines: [{ multipv: 1, depth: 12, score, pv }] })

describe('winPercent / classify', () => {
  it('ist symmetrisch und begrenzt', () => {
    expect(winPercent({ type: 'cp', value: 0 })).toBeCloseTo(50)
    expect(winPercent({ type: 'mate', value: 2 })).toBe(100)
    expect(winPercent({ type: 'mate', value: -2 })).toBe(0)
    expect(winPercent({ type: 'cp', value: 300 }) + winPercent({ type: 'cp', value: -300 })).toBeCloseTo(100)
  })
  it('stuft nach Verlust ein', () => {
    expect(classify(0, true)).toBe('best')
    expect(classify(3, false)).toBe('good')
    expect(classify(7, false)).toBe('inaccuracy')
    expect(classify(12, false)).toBe('mistake')
    expect(classify(40, false)).toBe('blunder')
  })
  it('formatiert Bewertungen', () => {
    expect(formatEval({ type: 'cp', value: 134 })).toBe('+1.3')
    expect(formatEval({ type: 'cp', value: -40 })).toBe('−0.4')
    expect(formatEval({ type: 'mate', value: -3 })).toBe('#-3')
  })
})

describe('analyseMove – Motive', () => {
  it('erkennt eine eingestellte Figur (Dame zieht in Springerangriff)', () => {
    const fen = '4k3/8/5n2/8/8/8/8/4QK2 w - - 0 1'
    const a = analyseMove(mv(fen, 'e1e4'), res({ type: 'cp', value: 600 }, ['e1e2']), res({ type: 'cp', value: 300 }, ['f6e4']))
    expect(a.category).toBe('blunder')
    expect(a.motif).toBe('hung_moved_piece')
    expect(a.text).toContain('Deine Dame auf e4')
    expect(a.arrows.length).toBe(2)
  })

  it('erkennt ein verpasstes (Grundreihen-)Matt', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'g1f1'), res({ type: 'mate', value: 1 }, ['a1a8']), res({ type: 'cp', value: -500 }, ['g8f8']))
    expect(a.motif).toBe('missed_back_rank')
    expect(a.text).toContain('Ra8#')
  })

  it('erkennt ein verpasstes Matt (kein Grundreihenmatt)', () => {
    // Dame setzt auf g7 matt (gedeckt vom Läufer b2) – kein Grundreihenmatt
    const fen = '6k1/5p1p/6p1/8/3Q4/8/1B6/6K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'g1f1'), res({ type: 'mate', value: 1 }, ['d4g7']), res({ type: 'cp', value: 500 }, ['g8f8']))
    expect(a.motif).toBe('missed_mate')
    expect(a.text).toContain('Matt in 1')
    expect(a.text).toContain('Qg7#')
  })

  it('erkennt ein zugelassenes Matt', () => {
    // Weiss zieht den Turm weg, danach Grundreihenmatt für Schwarz
    const fen = '3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'
    const a = analyseMove(
      mv(fen, 'd1e1'),
      res({ type: 'cp', value: 0 }, ['d1d8', 'g8f8']),
      res({ type: 'mate', value: 1 }, ['d8d1', 'e1d1']),
    )
    // d8d1 ist hier kein Matt (Turm e1 deckt), aber die Engine-Bewertung zählt
    expect(a.motif).toBe('allowed_mate')
    expect(a.text).toContain('Schwarz in 1 Zug mattsetzen')
  })

  it('erkennt eine verpasste ungedeckte Figur', () => {
    const fen = '4k3/8/8/1r6/8/8/8/4KB2 w - - 0 1'
    const a = analyseMove(
      mv(fen, 'e1d2'),
      res({ type: 'cp', value: 330 }, ['f1b5', 'e8d8']),
      res({ type: 'cp', value: 200 }, ['b5b2', 'd2c3']),
    )
    expect(a.motif).toBe('missed_capture')
    expect(a.text).toContain('Der Turm auf b5 war ungedeckt')
    expect(a.bestSan).toBe('Bxb5+')
  })

  it('lobt den besten Zug', () => {
    const fen = '4k3/8/8/1r6/8/8/8/4KB2 w - - 0 1'
    const a = analyseMove(mv(fen, 'f1b5'), res({ type: 'cp', value: 330 }, ['f1b5']), res({ type: 'cp', value: -330 }, ['e8d8']))
    expect(a.category).toBe('best')
    expect(a.motif).toBeNull()
    expect(a.arrows).toEqual([])
  })

  it('gibt einen Eröffnungstipp bei früher Dame', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    const a = analyseMove(
      mv(fen, 'd1h5'),
      res({ type: 'cp', value: 30 }, ['g1f3']),
      res({ type: 'cp', value: 0 }, ['b8c6']),
    )
    expect(a.tips.map((t) => t.motif)).toContain('early_queen')
  })

  it('wertet Mattsetzen als besten Zug', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    const a = analyseMove(mv(fen, 'a1a8'), res({ type: 'mate', value: 1 }, ['a1a8']), { bestmove: null, lines: [] })
    expect(a.category).toBe('best')
    expect(a.scoreAfter).toEqual({ type: 'mate', value: 1 })
  })
})

describe('gamePhase', () => {
  it('erkennt Eröffnung und Endspiel', () => {
    expect(gamePhase(new Chess().fen())).toBe('opening')
    expect(gamePhase('4k3/8/8/1r6/8/8/8/4KB2 w - - 0 40')).toBe('endgame')
  })
})
