import { Chess, type Move, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyUci, judgeMove, solverColor, type LibPuzzle } from './puzzleLib'

export type Phase = 'intro' | 'solving' | 'reply' | 'wrong' | 'solved' | 'shown'

const OPPONENT_DELAY = 650
const REPLY_DELAY = 380
const WRONG_DELAY = 750
const SHOW_STEP = 650

/**
 * Ablauf eines Lichess-Puzzles: Gegnerzug automatisch, dann Löser/Gegner im Wechsel.
 * `onResult(true|false)` wird pro Puzzle genau einmal gemeldet: beim ersten Fehler,
 * bei „Lösung zeigen“ oder beim fehlerfreien Lösen.
 */
export function usePuzzlePlay(puzzle: LibPuzzle | null, onResult: (solved: boolean) => void) {
  const [fen, setFen] = useState(puzzle?.fen ?? '')
  const [lastMove, setLastMove] = useState<Move | undefined>()
  const [ply, setPly] = useState(0)
  const [rawPhase, setPhase] = useState<Phase>('intro')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  // Bis der Effekt das neue Puzzle aufgebaut hat, gilt es als 'intro' (kein Zug mit alter Stellung)
  const fresh = !!puzzle && loadedId === puzzle.id
  const phase: Phase = fresh ? rawPhase : 'intro'
  const [mistake, setMistake] = useState(false)
  const [wrongSan, setWrongSan] = useState<string | null>(null)

  const reported = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const timers = useRef<number[]>([])
  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const report = (ok: boolean) => {
    if (reported.current) return
    reported.current = true
    onResultRef.current(ok)
  }

  // Neues Puzzle: Ausgangsstellung, dann der Gegnerzug mit Animation
  useEffect(() => {
    clearTimers()
    reported.current = false
    setMistake(false)
    setWrongSan(null)
    setLastMove(undefined)
    setPly(0)
    if (!puzzle) return
    setFen(puzzle.fen)
    setPhase('intro')
    setLoadedId(puzzle.id)
    later(() => {
      const r = applyUci(puzzle.fen, puzzle.moves[0])
      if (!r) return
      setFen(r.fen)
      setLastMove(r.move)
      setPly(1)
      setPhase('solving')
    }, OPPONENT_DELAY)
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id])

  const chess = useMemo(() => (fen ? new Chess(fen) : null), [fen])
  const canMove = phase === 'solving' && !!puzzle

  const legalTargets = useCallback(
    (from: Square) => (canMove && chess ? chess.moves({ square: from, verbose: true }).map((m) => m.to) : []),
    [chess, canMove],
  )
  const needsPromotion = useCallback(
    (from: Square, to: Square) => !!chess?.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion),
    [chess],
  )

  const onMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (!puzzle || !canMove) return false
    const uci = from + to + (promotion ?? '')
    const applied = applyUci(fen, uci)
    if (!applied) return false
    const verdict = judgeMove(puzzle, ply, fen, uci)
    const before = { fen, lastMove }
    setFen(applied.fen)
    setLastMove(applied.move)
    if (verdict === 'solved') {
      setPhase('solved')
      report(!mistake)
    } else if (verdict === 'continue') {
      setPhase('reply')
      later(() => {
        const r = applyUci(applied.fen, puzzle.moves[ply + 1])
        if (r) {
          setFen(r.fen)
          setLastMove(r.move)
        }
        setPly(ply + 2)
        setPhase('solving')
      }, REPLY_DELAY)
    } else {
      setPhase('wrong')
      setWrongSan(applied.move.san)
      setMistake(true)
      report(false)
      later(() => {
        setFen(before.fen)
        setLastMove(before.lastMove)
        setPhase('solving')
      }, WRONG_DELAY)
    }
    return true
  }

  /** Spielt die restliche Lösung Zug für Zug vor. */
  const showSolution = () => {
    if (!puzzle || phase === 'solved' || phase === 'shown' || phase === 'intro') return
    clearTimers()
    report(false)
    setMistake(true)
    setPhase('shown')
    // Stellung vor dem nächsten Lösungszug neu aufbauen (ein falscher Zug kann noch auf dem Brett stehen;
    // bei 'reply' ist der richtige Löserzug schon gespielt)
    const start = phase === 'reply' ? ply + 1 : ply
    let cur = puzzle.fen
    let last: Move | undefined
    for (let i = 0; i < start; i++) {
      const r = applyUci(cur, puzzle.moves[i])
      if (!r) break
      cur = r.fen
      last = r.move
    }
    setFen(cur)
    setLastMove(last)
    let f = cur
    for (let i = start; i < puzzle.moves.length; i++) {
      later(() => {
        const r = applyUci(f, puzzle.moves[i])
        if (!r) return
        f = r.fen
        setFen(r.fen)
        setLastMove(r.move)
      }, SHOW_STEP * (i - start + 1))
    }
  }

  const orientation = puzzle ? solverColor(puzzle) : 'w'
  const solutionMoves = puzzle ? puzzle.moves.slice(1) : []

  return {
    fen: fresh || !puzzle ? fen : puzzle.fen,
    lastMove,
    phase,
    mistake,
    wrongSan,
    canMove,
    orientation,
    legalTargets,
    needsPromotion,
    onMove,
    showSolution,
    checkSquare: chess && chess.inCheck() ? kingSquare(chess) : null,
    solutionMoves,
  } as const
}

function kingSquare(c: Chess): Square | null {
  const turn = c.turn()
  for (const row of c.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === turn) return sq.square
  return null
}
