import { describe, expect, it } from 'vitest'
import type { Score } from '../engine/uci'
import type { MoveAnalysis } from './explain'
import { estimatePerformance, evalSeries, keyMoments } from './gameReview'

const cp = (value: number): Score => ({ type: 'cp', value })
const an = (ply: number, before: Score, after: Score, over: Partial<MoveAnalysis> = {}): MoveAnalysis => ({
  ply,
  san: 'x',
  uci: 'a1a2',
  color: ply % 2 === 0 ? 'w' : 'b',
  fenBefore: '',
  phase: 'middlegame',
  category: 'good',
  loss: 0,
  scoreBefore: before,
  scoreAfter: after,
  bestUci: null,
  bestSan: null,
  bestLineSan: [],
  motif: null,
  text: '',
  tips: [],
  arrows: [],
  ...over,
})

// Weiss = Spieler, Halbzüge 0..5
const moves = ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7', 'Kxf7'].map((san, i) => ({ san, color: (i % 2 === 0 ? 'w' : 'b') as 'w' | 'b' }))
const analyses: Record<number, MoveAnalysis> = {
  0: an(0, cp(20), cp(30)),
  2: an(2, cp(-200), cp(-180)), // Gegner-Zug 1 (e5) hat Schwarz -230 gebracht? (nur Testdaten)
  4: an(4, cp(-150), cp(-900), {
    category: 'blunder',
    motif: 'hung_moved_piece',
    san: 'Qxf7',
    text: 'Deine Dame auf f7 kann geschlagen werden (Kxf7). Besser war Nf3.',
  }),
}

describe('evalSeries', () => {
  it('füllt Stellungen vor/nach den analysierten Zügen', () => {
    const s = evalSeries(6, analyses)
    expect(s).toHaveLength(7)
    expect(s[0]).toEqual(cp(20))
    expect(s[3]).toEqual(cp(-180))
    expect(s[5]).toEqual(cp(-900))
    expect(s[6]).toBeNull()
  })
})

describe('keyMoments', () => {
  it('nimmt die grössten Umschwünge, chronologisch, mit Erklärung', () => {
    const k = keyMoments(moves, analyses, 'w')
    expect(k.map((x) => x.ply)).toEqual([1, 4])
    expect(k[1].swing).toBeLessThan(-20)
    expect(k[1].text).toContain('Patzer (Figur in Angriff gezogen): Deine Dame auf f7 kann geschlagen werden (Kxf7).')
    expect(k[1].text).not.toContain('Besser war')
    expect(k[0].text).toContain('Starker Zug des Gegners')
  })
  it('erkennt Fehler des Gegners und ob du sie genutzt hast', () => {
    const a = { 0: an(0, cp(0), cp(0)), 2: an(2, cp(500), cp(480), { san: 'Nxe5', category: 'best' }) }
    const k = keyMoments(moves, a, 'w')
    expect(k).toHaveLength(1)
    expect(k[0].ply).toBe(1)
    expect(k[0].text).toContain('Nxe5 hat die Chance genutzt')
  })
})

describe('estimatePerformance', () => {
  it('steigt mit der Genauigkeit und braucht genug Züge', () => {
    expect(estimatePerformance(90, 5)).toBeNull()
    const lo = estimatePerformance(60, 20)!
    const hi = estimatePerformance(90, 20)!
    expect(lo).toBeLessThan(hi)
    expect(estimatePerformance(91, 20)).toBe(2000)
    expect(estimatePerformance(100, 20)).toBe(2800)
    expect(estimatePerformance(0, 20)).toBe(400)
    expect(hi % 50).toBe(0)
  })
})
