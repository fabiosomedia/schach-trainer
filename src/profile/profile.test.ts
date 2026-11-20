import openingsRaw from '../data/openings.json?raw'
import { describe, expect, it } from 'vitest'
import { OpeningBook, type OpeningData } from '../analysis/openings'
import type { MoveAnalysis } from '../analysis/explain'
import {
  answerPuzzle,
  BOX_INTERVALS,
  duePuzzles,
  emptyProfile,
  gameAccuracy,
  openingStats,
  loadProfile,
  moveAccuracy,
  recordGame,
  saveProfile,
  weaknesses,
} from './profile'

const analysis = (over: Partial<MoveAnalysis>): MoveAnalysis => ({
  ply: 0,
  san: 'e4',
  uci: 'e2e4',
  color: 'w',
  fenBefore: 'fen-a',
  phase: 'opening',
  category: 'good',
  loss: 1,
  scoreBefore: { type: 'cp', value: 0 },
  scoreAfter: { type: 'cp', value: 0 },
  bestUci: 'e2e4',
  bestSan: 'e4',
  bestLineSan: [],
  motif: null,
  text: '',
  tips: [],
  arrows: [],
  ...over,
})

const blunder = analysis({ ply: 2, fenBefore: 'fen-b', category: 'blunder', loss: 40, motif: 'hung_piece', bestUci: 'g1f3', bestSan: 'Nf3', text: 'x' })
const inacc = analysis({ ply: 4, fenBefore: 'fen-c', category: 'inaccuracy', loss: 7, motif: 'positional' })

const game = (analyses: MoveAnalysis[], now = 1000) => ({
  analyses,
  playerColor: 'w' as const,
  level: 3,
  result: '0-1' as const,
  reason: 'Schachmatt',
  plies: 20,
  pgn: '',
  now,
})

describe('moveAccuracy', () => {
  it('100 bei keinem Verlust, fällt mit Verlust', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0)
    expect(moveAccuracy(20)).toBeLessThan(50)
    expect(moveAccuracy(100)).toBe(0)
  })
})

describe('recordGame', () => {
  it('speichert Partie, Fehler und Puzzles (keine aus Ungenauigkeiten)', () => {
    const p = recordGame(emptyProfile(), game([analysis({}), blunder, inacc]))
    expect(p.games).toHaveLength(1)
    expect(p.games[0].outcome).toBe('loss')
    expect(p.games[0].counts.blunder).toBe(1)
    expect(p.mistakes.map((m) => m.motif)).toEqual(['hung_piece', 'positional'])
    expect(p.puzzles).toHaveLength(1)
    expect(p.puzzles[0]).toMatchObject({ fen: 'fen-b', bestUci: 'g1f3', box: 0, due: 1000 })
  })

  it('legt dieselbe Stellung nicht doppelt als Puzzle an', () => {
    let p = recordGame(emptyProfile(), game([blunder]))
    p = recordGame(p, game([blunder], 2000))
    expect(p.puzzles).toHaveLength(1)
  })
})

describe('Puzzles (Leitner)', () => {
  it('richtig → nächste Box und später fällig; falsch → zurück in Box 0', () => {
    let p = recordGame(emptyProfile(), game([blunder]))
    const id = p.puzzles[0].id
    p = answerPuzzle(p, id, true, 5000)
    expect(p.puzzles[0].box).toBe(1)
    expect(p.puzzles[0].due).toBe(5000 + BOX_INTERVALS[1])
    expect(duePuzzles(p, 6000)).toHaveLength(0)
    p = answerPuzzle(p, id, false, 7000)
    expect(p.puzzles[0].box).toBe(0)
    expect(p.puzzles[0].attempts).toBe(2)
    expect(p.puzzles[0].correct).toBe(1)
  })
})

describe('weaknesses', () => {
  it('gewichtet Patzer stärker als Ungenauigkeiten', () => {
    const p = recordGame(emptyProfile(), game([blunder, inacc, inacc]))
    const w = weaknesses(p)
    expect(w[0].motif).toBe('hung_piece')
    expect(w[0].score).toBe(2)
    expect(w[1]).toMatchObject({ motif: 'positional', count: 2, score: 1 })
  })
})

describe('Speichern/Laden', () => {
  it('überlebt einen Rundgang und toleriert Müll', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const p = recordGame(emptyProfile(), game([blunder]))
    saveProfile(p, storage)
    expect(loadProfile(storage)).toEqual(p)
    store.set('schach-trainer:profile', '{kaputt')
    expect(loadProfile(storage)).toEqual(emptyProfile())
  })
})

describe('Buchzüge und Eröffnungen', () => {
  const book = new OpeningBook(JSON.parse(openingsRaw) as OpeningData)

  it('Buchzüge zählen nicht zur Genauigkeit, werden aber gezählt', () => {
    const bk = analysis({ category: 'book', loss: 0 })
    expect(gameAccuracy([bk, bk, inacc])).toBeCloseTo(gameAccuracy([inacc]))
    expect(gameAccuracy([bk])).toBe(100)
    const p = recordGame(emptyProfile(), game([bk, blunder]))
    expect(p.games[0].counts.book).toBe(1)
  })

  it('ergänzt alten Profilen den Buchzug-Zähler', () => {
    const old = { version: 1, games: [{ id: '1', counts: { best: 1, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 } }], mistakes: [], puzzles: [] }
    const p = loadProfile({ getItem: () => JSON.stringify(old) })
    expect(p.games[0].counts.book).toBe(0)
    expect(p.games[0].opening).toBeUndefined()
  })

  it('speichert die Eröffnung und wertet pro Familie aus', () => {
    const ruy = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'
    let p = recordGame(emptyProfile(), { ...game([inacc]), pgn: ruy, opening: 'Spanische Partie: Morphy Defense', eco: 'C70' })
    expect(p.games[0]).toMatchObject({ opening: 'Spanische Partie: Morphy Defense', eco: 'C70' })
    p = recordGame(p, { ...game([analysis({})], 2000), pgn: ruy, result: '1-0' })
    // ohne geladenes Buch und ohne Angabe: kein Name gespeichert, Statistik leitet ihn aus der PGN ab
    expect(p.games[1].opening).toBeUndefined()
    p = recordGame(p, { ...game([analysis({})], 3000), pgn: '1. d4 d5 2. c4 *', result: '1/2-1/2' })
    const st = openingStats(p, book)
    expect(st[0]).toMatchObject({ family: 'Spanische Partie', games: 2, wins: 1, losses: 1, score: 50 })
    expect(st[1]).toMatchObject({ family: 'Damengambit', games: 1, draws: 1, score: 50 })
  })
})
