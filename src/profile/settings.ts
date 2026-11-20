import { MAX_LEVEL, MIN_LEVEL } from '../engine/strength'
import type { GameRecord } from './profile'

export type BoardTheme = 'sandstein' | 'marmor' | 'burgstein' | 'turnier'

export const BOARD_THEMES: { id: BoardTheme; label: string }[] = [
  { id: 'sandstein', label: 'Sandstein' },
  { id: 'marmor', label: 'Marmor' },
  { id: 'burgstein', label: 'Burgstein' },
  { id: 'turnier', label: 'Turnier' },
]

export type Settings = {
  level: number
  autoLevel: boolean
  sound: boolean
  /** Farben des Bretts (CSS-Klasse `board-theme-<id>`). */
  boardTheme: BoardTheme
  /** Koordinaten (a–h, 1–8) am Brett anzeigen. */
  showCoords: boolean
  /** Zuletzt gewählte Zeitkontrolle gegen den Computer (ID aus `TIME_CONTROLS`, 'none' = ohne Uhr). */
  timeControl: string
}

const KEY = 'schach-trainer:settings'
export const DEFAULT_SETTINGS: Settings = {
  level: 3,
  autoLevel: true,
  sound: true,
  boardTheme: 'sandstein',
  showCoords: true,
  timeControl: 'none',
}
const DEFAULTS = DEFAULT_SETTINGS

export function loadSettings(storage: Pick<Storage, 'getItem'> = localStorage): Settings {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}')
    const s: Settings = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
    // Unbekannte Werte (ältere/kaputte Speicherstände) auf Standard zurücksetzen
    if (!BOARD_THEMES.some((t) => t.id === s.boardTheme)) s.boardTheme = DEFAULTS.boardTheme
    if (typeof s.showCoords !== 'boolean') s.showCoords = DEFAULTS.showCoords
    if (typeof s.timeControl !== 'string') s.timeControl = DEFAULTS.timeControl
    return s
  } catch {
    return { ...DEFAULTS }
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
