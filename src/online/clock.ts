// Schachuhr für Online-Partien – reine Funktionen ohne React/Netzwerk.
import type { Chess, Color } from 'chess.js'

export type Clocks = { w: number; b: number }

export type TimeControl = {
  id: string
  label: string
  /** Startzeit pro Seite in ms (0 = ohne Uhr). */
  initialMs: number
  incrementMs: number
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: '1+0', label: '1+0', initialMs: 60_000, incrementMs: 0 },
  { id: '3+0', label: '3+0', initialMs: 180_000, incrementMs: 0 },
  { id: '3+2', label: '3+2', initialMs: 180_000, incrementMs: 2_000 },
  { id: '5+0', label: '5+0', initialMs: 300_000, incrementMs: 0 },
  { id: '10+0', label: '10+0', initialMs: 600_000, incrementMs: 0 },
  { id: '15+10', label: '15+10', initialMs: 900_000, incrementMs: 10_000 },
  { id: 'none', label: 'ohne Uhr', initialMs: 0, incrementMs: 0 },
]

export const findTimeControl = (id: string): TimeControl => TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[3]

export const hasClock = (tc: TimeControl) => tc.initialMs > 0

export const initialClocks = (tc: TimeControl): Clocks | null =>
  hasClock(tc) ? { w: tc.initialMs, b: tc.initialMs } : null

/**
 * Die Uhr läuft erst ab dem 3. Halbzug (wie auf Lichess): der jeweils erste Zug
 * von Weiss und Schwarz kostet keine Zeit.
 */
export const clockRunsAt = (ply: number) => ply >= 2

/** Verbleibende Zeit einer Seite zum Zeitpunkt `now`. */
export function remaining(
  clocks: Clocks,
  color: Color,
  turn: Color,
  ply: number,
  turnStartedAt: number,
  now: number,
  running = true,
): number {
  if (!running || color !== turn || !clockRunsAt(ply)) return clocks[color]
  return Math.max(0, clocks[color] - Math.max(0, now - turnStartedAt))
}

/**
 * Uhr nach einem Zug von `mover` beim Halbzug `ply` (0-basiert, vor dem Zug):
 * verbrauchte Zeit abziehen, Inkrement dazu.
 */
export function chargeMove(clocks: Clocks, mover: Color, ply: number, elapsedMs: number, incrementMs: number): Clocks {
  if (!clockRunsAt(ply)) return { ...clocks }
  const left = Math.max(0, clocks[mover] - Math.max(0, elapsedMs))
  return { ...clocks, [mover]: left + incrementMs }
}

/** Grosszügigkeit gegenüber der Zeitangabe des Gastes (Netzwerk-Verzögerung), in ms. */
export const MAX_LAG_COMPENSATION = 1000

/**
 * Der Gastgeber misst die Zeit des Gastes inklusive Netzwerk-Verzögerung. Meldet der
 * Gast selbst mehr Restzeit, wird ihm bis zu MAX_LAG_COMPENSATION davon gutgeschrieben.
 */
export function compensateLag(hostMeasured: number, guestClaimed: number | undefined): number {
  if (guestClaimed === undefined || !Number.isFinite(guestClaimed) || guestClaimed <= hostMeasured) return hostMeasured
  return Math.min(guestClaimed, hostMeasured + MAX_LAG_COMPENSATION)
}

/** Kann `color` mit dem vorhandenen Material nie mattsetzen? (nur König, K+L, K+S) */
export function cannotMate(chess: Chess, color: Color): boolean {
  const pieces: string[] = []
  for (const row of chess.board()) for (const p of row) if (p && p.color === color && p.type !== 'k') pieces.push(p.type)
  if (pieces.length === 0) return true
  return pieces.length === 1 && (pieces[0] === 'n' || pieces[0] === 'b')
}

/** Ergebnis bei Zeitüberschreitung von `flagged`. */
export function timeoutResult(chess: Chess, flagged: Color): { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } {
  const opp: Color = flagged === 'w' ? 'b' : 'w'
  if (cannotMate(chess, opp)) return { result: '1/2-1/2', reason: 'Zeit abgelaufen, aber zu wenig Material zum Mattsetzen' }
  return { result: opp === 'w' ? '1-0' : '0-1', reason: 'Zeit abgelaufen' }
}

/** Anzeige: m:ss, unter 10 s mit Zehnteln. */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms)
  if (t < 10_000) {
    const tenths = Math.floor(t / 100)
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  const s = Math.ceil(t / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
