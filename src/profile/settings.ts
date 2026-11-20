import { MAX_LEVEL, MIN_LEVEL } from '../engine/strength'
import type { GameRecord } from './profile'

export type Settings = {
  level: number
  autoLevel: boolean
  sound: boolean
}

const KEY = 'schach-trainer:settings'
const DEFAULTS: Settings = { level: 3, autoLevel: true, sound: true }

export function loadSettings(storage: Pick<Storage, 'getItem'> = localStorage): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(storage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* egal */
  }
}

/**
 * Passt die Stufe nach einer Partie an: Sieg mit ordentlicher Genauigkeit → schwerer,
 * Niederlage mit vielen Fehlern → leichter. Kurze Partien (Aufgabe nach wenigen Zügen)
 * zählen nicht.
 */
export function adaptLevel(level: number, g: Pick<GameRecord, 'outcome' | 'accuracy' | 'plies'>): number {
  if (g.plies < 16) return level
  let next = level
  if (g.outcome === 'win') next = level + (g.accuracy >= 80 ? 2 : 1)
  else if (g.outcome === 'loss' && g.accuracy < 60) next = level - 1
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, next))
}
