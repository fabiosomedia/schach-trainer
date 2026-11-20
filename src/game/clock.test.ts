import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  createClock,
  engineMoveTime,
  findTimeControl,
  flaggedColor,
  formatClock,
  hasMatingMaterial,
  pressClock,
  remainingMs,
  setRunning,
  timeoutStatus,
} from './clock'
import { capturedBy, materialDiff } from './material'

const tc = findTimeControl('3+2')!

describe('Schachuhr', () => {
  it('kennt die Zeitkontrollen, „Ohne Uhr“ ist null', () => {
    expect(findTimeControl('none')).toBeNull()
    expect(findTimeControl('quatsch')).toBeNull()
    expect(findTimeControl('1+0')).toMatchObject({ initialMs: 60_000, incrementMs: 0 })
    expect(tc).toMatchObject({ initialMs: 180_000, incrementMs: 2_000 })
  })

  it('läuft erst nach dem ersten Zug und nur für die Seite am Zug', () => {
    let c = createClock(tc)
    expect(remainingMs(c, 'w', 5000)).toBe(180_000)
    c = pressClock(c, 'w', 1000) // 1.e4 – startet nur Schwarz' Uhr, keine Gutschrift
    expect(c.running).toBe('b')
    expect(remainingMs(c, 'w', 4000)).toBe(180_000)
    expect(remainingMs(c, 'b', 4000)).toBe(177_000)
  })

  it('zieht verbrauchte Zeit ab und schreibt das Inkrement gut', () => {
    let c = pressClock(createClock(tc), 'w', 0)
    c = pressClock(c, 'b', 5000) // Schwarz braucht 5 s, +2 s
    expect(c.b).toBe(177_000)
    expect(c.running).toBe('w')
    c = pressClock(c, 'w', 15_000) // Weiss braucht 10 s, +2 s
    expect(c.w).toBe(172_000)
    expect(remainingMs(c, 'b', 16_000)).toBe(176_000)
  })

  it('erkennt abgelaufene Zeit und hält an', () => {
    let c = pressClock(createClock(findTimeControl('1+0')!), 'w', 0)
    expect(flaggedColor(c, 59_999)).toBeNull()
    expect(flaggedColor(c, 60_000)).toBe('b')
    c = setRunning(c, null, 70_000)
    expect(c.running).toBeNull()
    expect(c.b).toBe(0)
    expect(flaggedColor(c, 99_000)).toBeNull()
  })

  it('setRunning wechselt ohne Gutschrift (z. B. nach Zugrücknahme)', () => {
    let c = pressClock(createClock(tc), 'w', 0)
    c = setRunning(c, 'w', 3000)
    expect(c.b).toBe(177_000)
    expect(remainingMs(c, 'w', 4000)).toBe(179_000)
  })

  it('formatiert Minuten und unter 10 s Zehntel', () => {
    expect(formatClock(180_000)).toBe('3:00')
    expect(formatClock(59_999)).toBe('0:59')
    expect(formatClock(10_000)).toBe('0:10')
    expect(formatClock(9_950)).toBe('0:09.9')
    expect(formatClock(420)).toBe('0:00.4')
    expect(formatClock(-5)).toBe('0:00.0')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })

  it('lässt die Engine bei wenig Zeit schneller ziehen', () => {
    expect(engineMoveTime(600_000, 0)).toBe(1500)
    expect(engineMoveTime(60_000, 0)).toBe(1500)
    expect(engineMoveTime(20_000, 0)).toBe(500)
    expect(engineMoveTime(2_000, 0)).toBe(50)
    expect(engineMoveTime(100, 0)).toBe(30)
    expect(engineMoveTime(5_000, 2_000)).toBe(1250)
  })
})

describe('Zeitüberschreitung', () => {
  it('gewinnt, wer noch Mattmaterial hat', () => {
    expect(timeoutStatus(new Chess(), 'w')).toEqual({ over: true, result: '0-1', reason: 'Zeit abgelaufen' })
    expect(timeoutStatus(new Chess(), 'b').result).toBe('1-0')
  })
  it('ist remis, wenn der Gegner nicht mattsetzen kann', () => {
    // Weiss: K+D, Schwarz: nur König → Weiss' Zeit läuft ab = Remis
    const c = new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')
    expect(timeoutStatus(c, 'w').result).toBe('1/2-1/2')
    expect(timeoutStatus(c, 'b').result).toBe('1-0')
  })
  it('bewertet Mattmaterial', () => {
    const has = (fen: string, color: 'w' | 'b') => hasMatingMaterial(new Chess(fen), color)
    expect(has('4k3/8/8/8/8/8/8/2N1K3 w - - 0 1', 'w')).toBe(false) // K+S
    expect(has('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(false) // K+L
    expect(has('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1', 'w')).toBe(true) // K+2S
    expect(has('4k3/8/8/8/8/8/8/2BBK3 w - - 0 1', 'w')).toBe(true) // Läuferpaar
    expect(has('4k3/8/8/8/8/8/8/B1B1K3 w - - 0 1', 'w')).toBe(false) // gleichfarbige Läufer
    expect(has('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'w')).toBe(true) // Bauer
  })
})

describe('Material', () => {
  it('sammelt geschlagene Figuren je Seite, sortiert nach Wert', () => {
    const c = new Chess()
    for (const m of ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qxa2', 'Rxa2']) c.move(m)
    const cap = capturedBy(c.history({ verbose: true }))
    expect(cap.w).toEqual(['q', 'p'])
    expect(cap.b).toEqual(['p', 'p'])
    expect(materialDiff(c)).toBe(8)
  })
  it('zählt Material auch in Startstellungen ohne volle Figurenzahl', () => {
    expect(materialDiff(new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'))).toBe(9)
    expect(materialDiff(new Chess())).toBe(0)
  })
})
