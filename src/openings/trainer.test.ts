import linesRaw from '../../public/openings/lines.json?raw'
import { describe, expect, it } from 'vitest'
import { buildCourses, searchCourses } from './courses'
import {
  buildTree,
  chooseOpponentMove,
  deepestName,
  emptyProgress,
  leafKeys,
  leafStats,
  lineSide,
  loadProgress,
  parseLines,
  posKey,
  recordRun,
  repertoireMove,
  suggestMove,
  type OLine,
} from './trainer'

const L = (name: string, moves: string): OLine => ({ eco: 'B10', name, moves: moves.split(' ') })
const lines = [
  L('Caro-Kann-Verteidigung', 'e4 c6'),
  L('Caro-Kann-Verteidigung: Advance Variation', 'e4 c6 d4 d5 e5 Bf5'),
  L('Caro-Kann-Verteidigung: Exchange Variation', 'e4 c6 d4 d5 exd5 cxd5'),
  L('Caro-Kann-Verteidigung: Classical Variation', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'),
]

describe('buildTree', () => {
  const t = buildTree(lines)
  it('teilt gemeinsame Anfänge und verzweigt danach', () => {
    const afterD5 = [...t.nodes.values()].find((n) => n.children.length === 3)!
    expect(afterD5.children.map((c) => c.san).sort()).toEqual(['Nc3', 'e5', 'exd5'])
    expect(leafKeys(t)).toHaveLength(3) // "e4 c6" ist kein Blatt, es geht weiter
  })
  it('liefert UCI-Züge für Pfeile und Namen an Linienenden', () => {
    expect(t.nodes.get(t.root)!.children[0]).toMatchObject({ san: 'e4', uci: 'e2e4' })
    const path = [t.root]
    let k = t.root
    for (const san of ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5']) {
      k = repertoireMove(t, k, san)!.to
      path.push(k)
    }
    expect(deepestName(t, path)?.name).toBe('Caro-Kann-Verteidigung: Advance Variation')
    expect(deepestName(t, path.slice(0, 4))?.name).toBe('Caro-Kann-Verteidigung')
  })
})

describe('Gegnerwahl und Empfehlung', () => {
  const t = buildTree(lines)
  const keyAfter = (sans: string[]) => sans.reduce((k, s) => repertoireMove(t, k, s)!.to, t.root)
  const branch = keyAfter(['e4', 'c6', 'd4', 'd5'])

  it('zählt offene Linien', () => {
    expect(leafStats(t, t.root, new Set())).toEqual({ total: 3, open: 3 })
    const advLeaf = keyAfter(['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'])
    expect(leafStats(t, t.root, new Set([advLeaf]))).toEqual({ total: 3, open: 2 })
  })

  it('bevorzugt ungelernte Fortsetzungen', () => {
    const adv = keyAfter(['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'])
    const exch = keyAfter(['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'])
    const mastered = new Set([adv, exch])
    let classical = 0
    for (let i = 0; i < 200; i++) if (chooseOpponentMove(t, branch, mastered, Math.random)!.san === 'Nc3') classical++
    expect(classical).toBeGreaterThan(150)
  })

  it('erkennt Repertoire-Züge und empfiehlt einen davon', () => {
    const k = keyAfter(['e4'])
    expect(repertoireMove(t, k, 'c6')).not.toBeNull()
    expect(repertoireMove(t, k, 'e5')).toBeNull()
    expect(suggestMove(t, k, new Set())!.san).toBe('c6')
  })
})

describe('Fortschritt', () => {
  it('fehlerfrei → gelernt, mit Fehler → wieder offen', () => {
    let p = recordRun(emptyProgress(), 'caro', 'leaf-a', 0, 5)
    expect(p.courses.caro).toEqual({ mastered: ['leaf-a'], runs: 1, perfect: 1, lastPlayed: 5 })
    p = recordRun(p, 'caro', 'leaf-a', 2, 6)
    expect(p.courses.caro.mastered).toEqual([])
    expect(p.courses.caro.runs).toBe(2)
  })
  it('lädt robust', () => {
    expect(loadProgress({ getItem: () => '{kaputt' })).toEqual(emptyProgress())
    expect(loadProgress({ getItem: () => null })).toEqual(emptyProgress())
  })
})

describe('echte Lichess-Daten (public/openings/lines.json)', () => {
  const raw = JSON.parse(linesRaw)
  const all = parseLines(raw)
  const courses = buildCourses(all)

  it('enthält alle kuratierten Kurse mit Linien', () => {
    expect(all.length).toBeGreaterThan(3000)
    expect(courses.map((c) => c.id)).toEqual(
      expect.arrayContaining(['italian', 'caro', 'sicilian', 'alien', 'london', 'qgambit']),
    )
    for (const c of courses) expect(c.lines.length, c.id).toBeGreaterThan(0)
  })

  it('Alien Gambit ist ein weisses Gambit mit 6.Nxf7', () => {
    const alien = courses.find((c) => c.id === 'alien')!
    expect(alien.side).toBe('w')
    expect(alien.lines[0].moves.join(' ')).toBe('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7')
    expect(lineSide(alien.lines[0])).toBe('w')
  })

  it('jede Kurs-Linie ist legal und im Baum vollständig', () => {
    for (const c of courses) {
      const t = buildTree(c.lines)
      for (const l of c.lines) {
        let k = t.root
        for (const san of l.moves) {
          const ch = repertoireMove(t, k, san)
          expect(ch, `${c.id}: ${l.name} – ${san}`).not.toBeNull()
          k = ch!.to
        }
      }
      // Die Lernseite muss in der Grundstellung oder nach dem 1. Zug an der Reihe sein können
      expect(t.nodes.get(t.root)!.children.length).toBeGreaterThan(0)
    }
  })

  it('Suche findet Familien und Einzellinien', () => {
    const r = searchCourses(all, 'alien')
    expect(r.some((c) => c.title.includes('Alien Gambit'))).toBe(true)
    const caro = searchCourses(all, 'caro-kann')
    expect(caro[0].title).toContain('alle Varianten')
    expect(caro[0].side).toBe('b')
    expect(caro[0].lines.length).toBeGreaterThan(50)
  })

  it('posKey ignoriert Zugzähler', () => {
    expect(posKey('8/8/8/8/8/8/8/K6k w - - 0 1')).toBe(posKey('8/8/8/8/8/8/8/K6k w - - 12 40'))
  })
})
