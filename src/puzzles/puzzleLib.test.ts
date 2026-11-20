import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  applyUci,
  bandsByDistance,
  displayThemes,
  emptyStats,
  expectedScore,
  FILTER_THEMES,
  judgeMove,
  loadStats,
  markSeen,
  parseBand,
  pickPuzzle,
  recordRated,
  recordSprint,
  saveStats,
  solutionSan,
  solverColor,
  sprintTarget,
  START_RATING,
  STATS_KEY,
  THEME_LABELS,
  updateRating,
  type LibPuzzle,
  type PuzzleIndex,
  type RawPuzzle,
} from './puzzleLib'

const lp = (id: string, rating: number, themes: string[] = [], fen = '8/8/8/8/8/8/8/8 w - - 0 1', moves = ['a1a2']): LibPuzzle => ({
  id,
  rating,
  themes,
  fen,
  moves,
})

// Grundreihe: nach a7-a6 setzen Tb8# und Te8# beide matt
const BACKRANK: LibPuzzle = lp('br', 600, ['mateIn1', 'backRankMate'], '6k1/p4ppp/8/8/8/8/8/1R2R1K1 b - - 0 1', [
  'a7a6',
  'b1b8',
])
// Echtes Lichess-Puzzle (#074BS): Matt in 3 mit Damenopfer
const MATE3: LibPuzzle = {
  id: '074BS',
  fen: '3r1r1k/1b2npR1/p3pq2/1p1p2Rp/4P3/8/PPPQB2P/7K b - - 3 27',
  moves: 'e7g6 g5h5 h8g7 d2h6 g7g8 h6h7'.split(' '),
  rating: 1201,
  themes: ['mateIn3', 'sacrifice'],
}

const fenAfter = (p: LibPuzzle, n: number) => {
  let fen = p.fen
  for (let i = 0; i < n; i++) fen = applyUci(fen, p.moves[i])!.fen
  return fen
}

describe('Lichess-Format', () => {
  it('parst ein Band', () => {
    const raw: RawPuzzle[] = [['abc', MATE3.fen, MATE3.moves.join(' '), 1201, 'fork pin']]
    expect(parseBand(raw)).toEqual([{ id: 'abc', fen: MATE3.fen, moves: MATE3.moves, rating: 1201, themes: ['fork', 'pin'] }])
    expect(parseBand([['x', MATE3.fen, 'a1a2', 900, '']])[0].themes).toEqual([])
  })

  it('Löser ist die Seite nach dem ersten Gegnerzug', () => {
    expect(solverColor(MATE3)).toBe('w')
    expect(solverColor(BACKRANK)).toBe('w')
    expect(solverColor({ fen: '8/8/8/8/8/8/8/8 w - - 0 1' })).toBe('b')
  })

  it('Lösung in SAN ohne den Gegnerzug', () => {
    expect(solutionSan(MATE3)).toEqual(['Rxh5+', 'Kxg7', 'Qh6+', 'Kg8', 'Qh7#'])
  })
})

describe('judgeMove', () => {
  it('erwarteter Zug: weiter bzw. gelöst', () => {
    expect(judgeMove(MATE3, 1, fenAfter(MATE3, 1), 'g5h5')).toBe('continue')
    expect(judgeMove(MATE3, 3, fenAfter(MATE3, 3), 'd2h6')).toBe('continue')
    expect(judgeMove(MATE3, 5, fenAfter(MATE3, 5), 'h6h7')).toBe('solved')
  })

  it('falscher Zug', () => {
    expect(judgeMove(MATE3, 1, fenAfter(MATE3, 1), 'd2d3')).toBe('wrong')
    expect(judgeMove(BACKRANK, 1, fenAfter(BACKRANK, 1), 'g1f1')).toBe('wrong')
    // illegal zählt auch als falsch
    expect(judgeMove(BACKRANK, 1, fenAfter(BACKRANK, 1), 'b1b9')).toBe('wrong')
  })

  it('anderes Matt gilt als gelöst', () => {
    expect(judgeMove(BACKRANK, 1, fenAfter(BACKRANK, 1), 'b1b8')).toBe('solved')
    expect(judgeMove(BACKRANK, 1, fenAfter(BACKRANK, 1), 'e1e8')).toBe('solved')
  })

  it('Umwandlung: ohne Angabe gilt Dame', () => {
    const p = lp('pr', 500, ['promotion'], '8/8/8/1k2K3/p4P2/8/8/8 w - - 0 53', 'f4f5 a4a3 f5f6 a3a2 e5e6 a2a1q'.split(' '))
    expect(judgeMove(p, 5, fenAfter(p, 5), 'a2a1q')).toBe('solved')
    expect(judgeMove(p, 5, fenAfter(p, 5), 'a2a1n')).toBe('wrong')
  })
})

describe('Wertung', () => {
  it('Erwartung ist symmetrisch', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5)
    expect(expectedScore(1500, 1100) + expectedScore(1100, 1500)).toBeCloseTo(1)
  })

  it('gegen gleich starkes Puzzle: ± halber K-Faktor', () => {
    expect(updateRating(1200, 1200, true, 0)).toBe(1224)
    expect(updateRating(1200, 1200, false, 0)).toBe(1176)
    expect(updateRating(1200, 1200, true, 100)).toBe(1210)
  })

  it('leichtes Puzzle bringt wenig, schweres viel', () => {
    const easy = updateRating(1500, 900, true, 50) - 1500
    const hard = updateRating(1500, 2100, true, 50) - 1500
    expect(easy).toBeGreaterThanOrEqual(1)
    expect(hard).toBeGreaterThan(15)
    expect(updateRating(1500, 2100, false, 50)).toBeLessThan(1500)
  })

  it('bleibt in Grenzen', () => {
    expect(updateRating(400, 2000, false, 0)).toBe(400)
  })
})

describe('Statistik', () => {
  it('startet mit 1200', () => {
    expect(emptyStats().rating).toBe(START_RATING)
  })

  it('zählt Serie, Themen und merkt sich das Puzzle', () => {
    let s = emptyStats()
    s = recordRated(s, lp('a', 1200, ['fork']), true, 1)
    s = recordRated(s, lp('b', 1200, ['fork', 'pin']), true, 2)
    expect(s.streak).toBe(2)
    expect(s.bestStreak).toBe(2)
    s = recordRated(s, lp('c', 1200, ['pin']), false, 3)
    expect(s.streak).toBe(0)
    expect(s.bestStreak).toBe(2)
    expect(s.games).toBe(3)
    expect(s.solved).toBe(2)
    expect(s.failed).toBe(1)
    expect(s.themes.fork).toEqual({ solved: 2, failed: 0 })
    expect(s.themes.pin).toEqual({ solved: 1, failed: 1 })
    expect(s.recent).toEqual(['a', 'b', 'c'])
    expect(s.history.map((h) => h.date)).toEqual([1, 2, 3])
  })

  it('Sprint-Rekord und gesehene Puzzles', () => {
    let s = recordSprint(emptyStats(), 12)
    s = recordSprint(s, 7)
    expect(s.sprintBest).toBe(12)
    expect(s.sprintRuns).toBe(2)
    s = markSeen(markSeen(s, 'x'), 'x')
    expect(s.recent).toEqual(['x'])
  })

  it('speichert unter eigenem Schlüssel und übersteht Müll', () => {
    const store = new Map<string, string>()
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const s = recordRated(emptyStats(), lp('a', 1300), true)
    saveStats(s, st)
    expect([...store.keys()]).toEqual([STATS_KEY])
    expect(loadStats(st)).toEqual(s)
    store.set(STATS_KEY, '{kaputt')
    expect(loadStats(st)).toEqual(emptyStats())
  })
})

describe('Auswahl', () => {
  const pool = [lp('a', 800, ['fork']), lp('b', 1190, ['pin']), lp('c', 1210, ['fork']), lp('d', 1600, ['fork'])]

  it('nimmt ein nahes Puzzle', () => {
    const p = pickPuzzle(pool, 1200, { spread: 2 }, () => 0.99)
    expect(['b', 'c']).toContain(p!.id)
  })

  it('beachtet Thema, Ausschluss und Höchstabstand', () => {
    expect(pickPuzzle(pool, 1200, { theme: 'fork', spread: 1 })!.id).toBe('c')
    expect(pickPuzzle(pool, 1200, { exclude: ['b', 'c'], spread: 1 })!.id).toBe('a')
    expect(pickPuzzle(pool, 1200, { exclude: ['b', 'c'], maxDistance: 300 })).toBeNull()
    expect(pickPuzzle(pool, 1200, { theme: 'skewer' })).toBeNull()
  })

  it('sortiert Bänder nach Abstand', () => {
    const index: PuzzleIndex = {
      source: '',
      bandSize: 200,
      bands: [400, 600, 800, 1000].map((m) => ({ min: m, max: m + 199, file: `r${m}`, count: 1, themes: {} })),
    }
    expect(bandsByDistance(index, 950).map((b) => b.min)).toEqual([800, 1000, 600, 400])
  })

  it('Sprint wird schwerer', () => {
    expect(sprintTarget(0)).toBeLessThan(700)
    expect(sprintTarget(10)).toBeGreaterThan(sprintTarget(5))
    expect(sprintTarget(100)).toBeLessThanOrEqual(2600)
  })
})

describe('Themen', () => {
  it('alle Filter-Themen haben deutsche Namen', () => {
    for (const t of FILTER_THEMES) expect(THEME_LABELS[t]).toBeTruthy()
  })
  it('zeigt Motive vor Meta-Tags', () => {
    expect(displayThemes(['long', 'fork', 'middlegame'])).toEqual(['Gabel'])
    expect(displayThemes(['short', 'middlegame'])).toEqual(['Kurz', 'Mittelspiel'])
  })
})

describe('Puzzle-Daten in public/puzzles', () => {
  const data = import.meta.glob('../../public/puzzles/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
  const byName = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.split('/').pop()!, v]))
  const index = byName['index.json'] as PuzzleIndex
  const files = Object.keys(byName).filter((f) => /^r\d{4}\.json$/.test(f))

  it('Index passt zu den Dateien', () => {
    expect(index.bands.map((b) => b.file).sort()).toEqual(files.sort())
    expect(index.bands.reduce((n, b) => n + b.count, 0)).toBeGreaterThan(3500)
  })

  it('alle Züge sind legal, Wertung liegt im Band, Matt-Puzzles enden matt', () => {
    const ids = new Set<string>()
    for (const b of index.bands) {
      const puzzles = parseBand(byName[b.file] as RawPuzzle[])
      expect(puzzles.length).toBe(b.count)
      for (const p of puzzles) {
        expect(ids.has(p.id)).toBe(false)
        ids.add(p.id)
        expect(p.rating).toBeGreaterThanOrEqual(b.min)
        expect(p.rating).toBeLessThanOrEqual(b.max)
        expect(p.moves.length % 2).toBe(0)
        const c = new Chess(p.fen)
        for (const m of p.moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
        if (p.themes.includes('mate')) expect(c.isCheckmate()).toBe(true)
      }
    }
  }, 60000)
})
