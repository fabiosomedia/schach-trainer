import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { checkedKingSquare, computeStatus } from './status'

describe('computeStatus', () => {
  it('läuft in der Grundstellung', () => {
    expect(computeStatus(new Chess())).toEqual({ over: false })
  })

  it('erkennt Schachmatt (Narrenmatt)', () => {
    const c = new Chess()
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) c.move(m)
    expect(computeStatus(c)).toEqual({ over: true, result: '0-1', reason: 'Schachmatt' })
  })

  it('erkennt Patt', () => {
    const c = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(computeStatus(c).reason).toBe('Patt')
  })

  it('erkennt Aufgabe', () => {
    expect(computeStatus(new Chess(), 'w')).toEqual({ over: true, result: '0-1', reason: 'Aufgabe' })
  })
})

describe('checkedKingSquare', () => {
  it('findet den König im Schach', () => {
    const c = new Chess()
    for (const m of ['e4', 'f5', 'Qh5+']) c.move(m)
    expect(checkedKingSquare(c)).toBe('e8')
  })
  it('null wenn kein Schach', () => {
    expect(checkedKingSquare(new Chess())).toBeNull()
  })
})
