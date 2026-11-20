import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { START_POSITIONS } from '../game/positions'
import { adaptLevel, loadSettings } from './settings'

describe('adaptLevel', () => {
  it('wird nach klarem Sieg schwerer, nach schwacher Niederlage leichter', () => {
    expect(adaptLevel(3, { outcome: 'win', accuracy: 85, plies: 40 })).toBe(5)
    expect(adaptLevel(3, { outcome: 'win', accuracy: 60, plies: 40 })).toBe(4)
    expect(adaptLevel(3, { outcome: 'loss', accuracy: 50, plies: 40 })).toBe(2)
    expect(adaptLevel(3, { outcome: 'loss', accuracy: 75, plies: 40 })).toBe(3)
    expect(adaptLevel(3, { outcome: 'draw', accuracy: 75, plies: 40 })).toBe(3)
  })
  it('ignoriert kurze Partien und bleibt in 1–10', () => {
    expect(adaptLevel(3, { outcome: 'loss', accuracy: 10, plies: 4 })).toBe(3)
    expect(adaptLevel(10, { outcome: 'win', accuracy: 99, plies: 60 })).toBe(10)
    expect(adaptLevel(1, { outcome: 'loss', accuracy: 10, plies: 60 })).toBe(1)
  })
})

describe('loadSettings', () => {
  it('liefert Standardwerte bei leerem oder kaputtem Speicher', () => {
    expect(loadSettings({ getItem: () => null })).toEqual({
      level: 3,
      autoLevel: true,
      sound: true,
      boardTheme: 'sandstein',
      showCoords: true,
      timeControl: 'none',
    })
    expect(loadSettings({ getItem: () => '{x' }).level).toBe(3)
    expect(loadSettings({ getItem: () => '{"level":7}' }).level).toBe(7)
  })
  it('liest alte Speicherstände ohne neue Felder und verwirft unbekannte Werte', () => {
    const old = loadSettings({ getItem: () => '{"level":5,"autoLevel":false,"sound":false}' })
    expect(old).toMatchObject({ level: 5, autoLevel: false, sound: false, boardTheme: 'sandstein', showCoords: true, timeControl: 'none' })
    const s = loadSettings({ getItem: () => '{"boardTheme":"marmor","showCoords":false,"timeControl":"3+2"}' })
    expect(s).toMatchObject({ boardTheme: 'marmor', showCoords: false, timeControl: '3+2' })
    expect(loadSettings({ getItem: () => '{"boardTheme":"pink","showCoords":"ja"}' })).toMatchObject({
      boardTheme: 'sandstein',
      showCoords: true,
    })
    expect(loadSettings({ getItem: () => 'null' }).level).toBe(3)
  })
})

describe('START_POSITIONS', () => {
  it('sind alle gültige, laufende Stellungen', () => {
    for (const p of START_POSITIONS) {
      const c = new Chess(p.fen)
      expect(c.isGameOver(), p.name).toBe(false)
      expect(c.moves().length, p.name).toBeGreaterThan(0)
    }
  })
})
