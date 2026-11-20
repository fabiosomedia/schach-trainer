import type { Color } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClock, flaggedColor, pressClock, remainingMs, setRunning, type ClockState, type TimeControl } from './clock'

const TICK_MS = 100

/**
 * Schachuhr für eine Partie gegen den Computer. Reagiert auf die Zugliste:
 * ein neuer Zug drückt die Uhr, eine Zugrücknahme lässt die Uhr der Seite am Zug
 * weiterlaufen, Partieende hält sie an. `onFlag` meldet die Seite, deren Zeit abläuft.
 */
export function useClock(opts: {
  tc: TimeControl | null
  gameNo: number
  moves: { color: Color }[]
  turn: Color
  over: boolean
  onFlag: (c: Color) => void
}) {
  const { tc, gameNo, moves, turn, over, onFlag } = opts
  const [clock, setClock] = useState<ClockState | null>(() => (tc ? createClock(tc) : null))
  const [now, setNow] = useState(() => Date.now())
  const seen = useRef({ gameNo, len: moves.length, tc })
  const flagRef = useRef(onFlag)
  flagRef.current = onFlag

  useEffect(() => {
    const t = Date.now()
    const prev = seen.current
    seen.current = { gameNo, len: moves.length, tc }
    if (prev.gameNo !== gameNo || prev.tc !== tc) {
      setClock(tc ? createClock(tc) : null)
      return
    }
    if (over) setClock((c) => c && setRunning(c, null, t))
    else if (moves.length === prev.len + 1) setClock((c) => c && pressClock(c, moves[moves.length - 1].color, t))
    else if (moves.length !== prev.len) setClock((c) => (c && c.running ? setRunning(c, moves.length ? turn : null, t) : c))
    setNow(t)
  }, [gameNo, tc, moves, turn, over])

  const running = clock?.running ?? null
  useEffect(() => {
    if (!clock || !running) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const f = flaggedColor(clock, t)
      if (f) flagRef.current(f)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [clock, running])

  const remaining = useCallback((c: Color) => (clock ? remainingMs(clock, c, Date.now()) : null), [clock])

  return {
    active: !!clock,
    running,
    /** Restzeit (ms) beim letzten Tick – für die Anzeige. */
    w: clock ? remainingMs(clock, 'w', now) : null,
    b: clock ? remainingMs(clock, 'b', now) : null,
    /** Genaue Restzeit jetzt (z. B. für die Bedenkzeit der Engine). */
    remaining,
    incrementMs: clock?.incrementMs ?? 0,
  }
}
