import { Chess } from 'chess.js'
import openingsRaw from '../data/openings.json?raw'
import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../engine/stockfish'
import { analyseMove } from './explain'
import { OpeningBook, openingAt, openingFamily, openingFromPgn, positionKey, type OpeningData } from './openings'

const book = new OpeningBook(JSON.parse(openingsRaw) as OpeningData)
const res = (v: number, pv: string[]): SearchResult => ({ bestmove: pv[0] ?? null, lines: [{ multipv: 1, depth: 12, score: { type: 'cp', value: v }, pv }] })

describe('Eröffnungsbuch', () => {
  it('enthält die Lichess-Liste', () => {
    expect(book.size).toBeGreaterThan(5000)
    expect(positionKey(new Chess().fen())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
  })

  it('erkennt die Spanische Partie (übersetzter Familienname)', () => {
    expect(openingAt('e4 e5 Nf3 Nc6 Bb5'.split(' '), book)).toEqual({ eco: 'C60', name: 'Spanische Partie' })
  })

  it('liefert die tiefste bekannte Eröffnung, auch nach Verlassen des Buchs', () => {
    const o = openingAt('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 h4 h5'.split(' '), book)
    expect(o?.eco).toBe('B90')
    expect(o?.name).toBe('Sizilianische Verteidigung: Najdorf Variation')
    expect(openingFamily(o!.name)).toBe('Sizilianische Verteidigung')
  })

  it('erkennt Zugumstellungen über die Stellung', () => {
    const a = openingAt('d4 Nf6 c4 e6 Nc3 Bb4'.split(' '), book)
    const b = openingAt('c4 e6 Nc3 Nf6 d4 Bb4'.split(' '), book)
    expect(a?.name).toContain('Nimzoindische Verteidigung')
    expect(b).toEqual(a)
  })

  it('liest PGN und chess.js-Züge', () => {
    const o = openingFromPgn('1. e4 e6 2. d4 d5 *', book)
    expect(o?.name).toMatch(/^Französische Verteidigung/)
    const c = new Chess()
    c.move('e4')
    c.move('c6')
    expect(openingAt(c.history({ verbose: true }), book)?.name).toMatch(/^Caro-Kann-Verteidigung/)
    expect(openingAt([], book)).toBeNull()
    expect(openingAt(['e4'], null)).toBeNull()
  })
})

describe('Buchzüge', () => {
  const start = new Chess().fen()
  const e4 = (() => {
    const c = new Chess()
    const m = c.move('e4')
    return { ply: 0, fenBefore: start, fenAfter: c.fen(), san: m.san, from: m.from, to: m.to, piece: m.piece, color: m.color }
  })()

  it('stuft einen Buchzug als „book“ ein', () => {
    const a = analyseMove(e4, res(30, ['e2e4']), res(-30, ['c7c5']), { book })
    expect(a.category).toBe('book')
    expect(a.text).toContain('Buchzug')
    expect(a.tips).toEqual([])
  })

  it('ohne Buch bleibt es eine normale Bewertung', () => {
    expect(analyseMove(e4, res(30, ['e2e4']), res(-30, ['c7c5'])).category).toBe('best')
  })

  it('ein Patzer bleibt ein Patzer, auch wenn die Stellung im Buch ist', () => {
    // 1. e4 e5 2. Qh5 steht in der Liste („Wayward Queen Attack“) – hier künstlich als Patzer bewertet
    const c = new Chess()
    c.move('e4')
    c.move('e5')
    const before = c.fen()
    const m = c.move('Qh5')
    const input = { ply: 2, fenBefore: before, fenAfter: c.fen(), san: m.san, from: m.from, to: m.to, piece: m.piece, color: m.color }
    expect(book.has(c.fen())).toBe(true)
    const a = analyseMove(input, res(30, ['g1f3']), res(500, ['b8c6']), { book })
    expect(a.category).toBe('blunder')
  })
})
