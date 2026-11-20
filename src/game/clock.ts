// Schachuhr für Partien gegen den Computer – reine Logik ohne React/Timer,
// damit sie testbar ist. Die Zeit wird über Zeitstempel (`now`, in ms) berechnet:
// die laufende Seite verliert `now - since`, nichts tickt im Zustand selbst.
import type { Chess, Color, PieceSymbol } from 'chess.js'
import type { GameStatus } from './status'

export type TimeControl = {
  id: string
  label: string
  /** Startzeit pro Seite in ms (0 = ohne Uhr). */
  initialMs: number
  /** Zeitgutschrift pro Zug in ms. */
  incrementMs: number
}

export const NO_CLOCK = 'none'

export const TIME_CONTROLS: TimeControl[] = [
  { id: NO_CLOCK, label: 'Ohne Uhr', initialMs: 0, incrementMs: 0 },
  { id: '1+0', label: '1+0', initialMs: 60_000, incrementMs: 0 },
  { id: '3+2', label: '3+2', initialMs: 180_000, incrementMs: 2_000 },
  { id: '5+0', label: '5+0', initialMs: 300_000, incrementMs: 0 },
  { id: '10+0', label: '10+0', initialMs: 600_000, incrementMs: 0 },
  { id: '15+10', label: '15+10', initialMs: 900_000, incrementMs: 10_000 },
]

/** Bedenkzeit, ab der die Uhr als knapp markiert wird. */
export const LOW_TIME_MS = 10_000

/** Zeitkontrolle zur ID – `null` heisst „ohne Uhr“ (auch bei unbekannter ID). */
export function findTimeControl(id: string | undefined | null): TimeControl | null {
  const tc = TIME_CONTROLS.find((t) => t.id === id)
  return tc && tc.initialMs > 0 ? tc : null
}

export type ClockState = {
  /** Restzeit in ms zum Zeitpunkt `since` (für die laufende Seite) bzw. eingefroren. */
  w: number
  b: number
  incrementMs: number
  /** Seite, deren Uhr läuft (null = angehalten / noch nicht gestartet). */
  running: Color | null
  /** Zeitstempel, seit dem `running` läuft. */
  since: number
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

export function createClock(tc: TimeControl): ClockState {
  return { w: tc.initialMs, b: tc.initialMs, incrementMs: tc.incrementMs, running: null, since: 0 }
}

/** Restzeit einer Seite zum Zeitpunkt `now` (nie negativ). */
export function remainingMs(c: ClockState, color: Color, now: number): number {
  const base = c[color]
  if (c.running !== color) return Math.max(0, base)
  return Math.max(0, base - Math.max(0, now - c.since))
}

/** Zieht der laufenden Seite die verbrauchte Zeit ab und friert sie ein. */
function settle(c: ClockState, now: number): ClockState {
  if (!c.running) return c
  return { ...c, [c.running]: remainingMs(c, c.running, now), running: null, since: now }
}

/**
 * Uhr drücken: `mover` hat gezogen. Lief seine Uhr, verliert er die verbrauchte Zeit
 * und bekommt das Inkrement; danach läuft die Uhr des Gegners.
 * Der allererste Zug der Partie startet nur die Uhr (keine Gutschrift).
 */
export function pressClock(c: ClockState, mover: Color, now: number): ClockState {
  const wasRunning = c.running === mover
  const s = settle(c, now)
  const own = wasRunning ? s[mover] + s.incrementMs : s[mover]
  return { ...s, [mover]: own, running: other(mover), since: now }
}

/** Lässt die Uhr von `color` laufen (oder hält mit `null` an), ohne Gutschrift. */
export function setRunning(c: ClockState, color: Color | null, now: number): ClockState {
  const s = settle(c, now)
  return color ? { ...s, running: color, since: now } : s
}

/** Seite, deren Zeit abgelaufen ist (nur die laufende Uhr kann ablaufen). */
export function flaggedColor(c: ClockState, now: number): Color | null {
  return c.running && remainingMs(c, c.running, now) <= 0 ? c.running : null
}

/** „4:59“, unter 10 s mit Zehnteln: „0:07.4“. */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms)
  if (t < LOW_TIME_MS) {
    const tenths = Math.floor(t / 100)
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  const total = Math.floor(t / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/**
 * Wie lange die Engine höchstens nachdenken darf: grob 1/40 der Restzeit plus
 * ein Teil des Inkrements, aber nie mehr als `cap` und immer etwas Luft lassen.
 */
export function engineMoveTime(remaining: number, incrementMs: number, cap = 1500): number {
  const budget = remaining / 40 + incrementMs * 0.6
  const safe = Math.max(30, remaining / 4) // bei sehr knapper Zeit nur noch ein Bruchteil
  return Math.round(Math.max(30, Math.min(cap, budget, safe)))
}

/**
 * Kann `color` überhaupt noch mattsetzen? Vereinfachte Regel: nur König, König + eine
 * Leichtfigur oder nur Läufer auf gleichfarbigen Feldern reichen nicht.
 */
export function hasMatingMaterial(chess: Chess, color: Color): boolean {
  const pieces: { type: PieceSymbol; light: boolean }[] = []
  chess.board().forEach((row, r) =>
    row.forEach((p, f) => {
      if (p && p.color === color && p.type !== 'k') pieces.push({ type: p.type, light: (r + f) % 2 === 0 })
    }),
  )
  if (pieces.some((p) => p.type === 'p' || p.type === 'r' || p.type === 'q')) return true
  if (pieces.length <= 1) return false
  const bishops = pieces.filter((p) => p.type === 'b')
  if (bishops.length === pieces.length) return bishops.some((b) => b.light !== bishops[0].light)
  return true
}

/** Spielende bei Zeitüberschreitung von `flagged`. */
export function timeoutStatus(chess: Chess, flagged: Color): GameStatus {
  const winner = other(flagged)
  if (!hasMatingMaterial(chess, winner)) return { over: true, result: '1/2-1/2', reason: 'Zeit abgelaufen' }
  return { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'Zeit abgelaufen' }
}
