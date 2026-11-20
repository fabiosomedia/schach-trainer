import { describe, expect, it } from 'vitest'
import { levelConfig } from './strength'
import { parseBestmove, parseInfo, splitUci } from './uci'

describe('parseInfo', () => {
  it('liest Tiefe, Bewertung und Variante', () => {
    const l = parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 1000 nps 5 time 3 pv e7e5 g1f3 b8c6')
    expect(l).toEqual({ multipv: 2, depth: 12, score: { type: 'cp', value: -35 }, pv: ['e7e5', 'g1f3', 'b8c6'] })
  })

  it('erkennt Matt-Bewertungen', () => {
    const l = parseInfo('info depth 5 score mate 3 pv d1h5 g7g6 h5g6')
    expect(l?.score).toEqual({ type: 'mate', value: 3 })
    expect(l?.multipv).toBe(1)
  })

  it('ignoriert Zeilen ohne Variante', () => {
    expect(parseInfo('info depth 0 score mate 0')).toBeNull()
    expect(parseInfo('info string NNUE evaluation enabled')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('parseBestmove', () => {
  it('liest den Zug', () => {
    expect(parseBestmove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestmove('bestmove e7e8q')).toBe('e7e8q')
  })
  it('gibt null bei (none)', () => {
    expect(parseBestmove('bestmove (none)')).toBeNull()
  })
})

describe('splitUci', () => {
  it('zerlegt normale Züge und Umwandlungen', () => {
    expect(splitUci('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined })
    expect(splitUci('a7a8n')).toEqual({ from: 'a7', to: 'a8', promotion: 'n' })
  })
})

describe('levelConfig', () => {
  it('begrenzt auf 1–10', () => {
    expect(levelConfig(0).level).toBe(1)
    expect(levelConfig(99).level).toBe(10)
  })
  it('wird mit der Stufe stärker', () => {
    expect(levelConfig(1).skill).toBeLessThan(levelConfig(10).skill)
  })
})
