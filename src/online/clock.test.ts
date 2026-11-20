import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  cannotMate,
  chargeMove,
  compensateLag,
  findTimeControl,
  formatClock,
  initialClocks,
  MAX_LAG_COMPENSATION,
  remaining,
  timeoutResult,
} from './clock'

describe('Uhr', () => {
  it('Zeitkontrollen', () => {
    expect(initialClocks(findTimeControl('3+2'))).toEqual({ w: 180_000, b: 180_000 })
    expect(findTimeControl('3+2').incrementMs).toBe(2000)
    expect(initialClocks(findTimeControl('none'))).toBeNull()
    expect(findTimeControl('quatsch').id).toBe('5+0')
  })

  it('läuft erst ab dem 3. Halbzug', () => {
    const c = { w: 60_000, b: 60_000 }
    expect(remaining(c, 'w', 'w', 0, 0, 5000)).toBe(60_000)
    expect(remaining(c, 'b', 'b', 1, 0, 5000)).toBe(60_000)
    expect(remaining(c, 'w', 'w', 2, 0, 5000)).toBe(55_000)
    // Seite, die nicht am Zug ist, verliert keine Zeit
    expect(remaining(c, 'b', 'w', 2, 0, 5000)).toBe(60_000)
    expect(remaining(c, 'w', 'w', 2, 0, 99_000)).toBe(0)
    expect(remaining(c, 'w', 'w', 2, 0, 5000, false)).toBe(60_000)
  })

  it('zieht Zeit ab und gibt Inkrement', () => {
    const c = { w: 60_000, b: 60_000 }
    expect(chargeMove(c, 'w', 0, 7000, 2000)).toEqual(c)
    expect(chargeMove(c, 'w', 2, 7000, 2000)).toEqual({ w: 55_000, b: 60_000 })
    expect(chargeMove(c, 'b', 3, 1000, 0)).toEqual({ w: 60_000, b: 59_000 })
    expect(chargeMove(c, 'b', 3, 70_000, 0).b).toBe(0)
  })

  it('Verzögerungsausgleich ist begrenzt', () => {
    expect(compensateLag(10_000, undefined)).toBe(10_000)
    expect(compensateLag(10_000, 9_000)).toBe(10_000)
    expect(compensateLag(10_000, 10_300)).toBe(10_300)
    expect(compensateLag(10_000, 50_000)).toBe(10_000 + MAX_LAG_COMPENSATION)
  })

  it('Zeitüberschreitung: Sieg oder Remis bei zu wenig Material', () => {
    expect(timeoutResult(new Chess(), 'w')).toEqual({ result: '0-1', reason: 'Zeit abgelaufen' })
    // Schwarz hat nur König + Läufer → kann nicht mattsetzen → Remis
    const kb = new Chess('4k3/8/8/8/3b4/8/4P3/4K3 w - - 0 1')
    expect(cannotMate(kb, 'b')).toBe(true)
    expect(cannotMate(kb, 'w')).toBe(false)
    expect(timeoutResult(kb, 'w').result).toBe('1/2-1/2')
    expect(timeoutResult(kb, 'b').result).toBe('1-0')
    expect(cannotMate(new Chess('4k3/8/8/8/2nn4/8/8/4K3 w - - 0 1'), 'b')).toBe(false)
  })

  it('Anzeige', () => {
    expect(formatClock(180_000)).toBe('3:00')
    expect(formatClock(61_500)).toBe('1:02')
    expect(formatClock(9_870)).toBe('0:09.8')
    expect(formatClock(-5)).toBe('0:00.0')
    expect(formatClock(3_600_000)).toBe('1:00:00')
  })
})
