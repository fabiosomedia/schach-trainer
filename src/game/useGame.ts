import { Chess, type Color, type Move, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StockfishEngine } from '../engine/stockfish'
import { levelConfig } from '../engine/strength'
import { splitUci } from '../engine/uci'
import { computeStatus } from './status'

const ENGINE_MIN_DELAY_MS = 350 // damit die Antwort nicht unnatürlich sofort kommt

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useGame(engine: StockfishEngine | null, level: number) {
  const chessRef = useRef(new Chess())
  const gameId = useRef(0)
  const [fen, setFen] = useState(() => chessRef.current.fen())
  const [moves, setMoves] = useState<Move[]>([])
  const [playerColor, setPlayerColor] = useState<Color>('w')
  const [resigned, setResigned] = useState<Color | null>(null)
  const [thinking, setThinking] = useState(false)
  const [gameNo, setGameNo] = useState(0)

  const chess = chessRef.current

  const sync = useCallback(() => {
    setFen(chess.fen())
    setMoves(chess.history({ verbose: true }))
  }, [chess])

  // fen/resigned als Abhängigkeit: der Status hängt am veränderlichen chess-Objekt
  const status = useMemo(() => computeStatus(chess, resigned), [chess, fen, resigned])

  const isPlayerTurn = !status.over && !thinking && chess.turn() === playerColor

  // Engine antwortet, wenn sie am Zug ist.
  useEffect(() => {
    if (!engine || status.over || chess.turn() === playerColor) return
    const id = gameId.current
    const fenNow = chess.fen()
    let cancelled = false
    const cfg = levelConfig(level)
    setThinking(true)

    ;(async () => {
      await engine.setOptions({ 'Skill Level': cfg.skill })
      const [res] = await Promise.all([
        engine.search(fenNow, { depth: cfg.depth, movetime: cfg.movetime }),
        sleep(ENGINE_MIN_DELAY_MS),
      ])
      if (cancelled || id !== gameId.current || chess.fen() !== fenNow || !res.bestmove) return
      try {
        chess.move(splitUci(res.bestmove))
      } catch {
        return
      }
      sync()
    })().finally(() => {
      if (!cancelled) setThinking(false)
    })

    return () => {
      cancelled = true
      engine.stop()
      setThinking(false)
    }
  }, [engine, chess, fen, playerColor, level, status.over, sync])

  const legalTargets = useCallback(
    (from: Square): Square[] => {
      if (!isPlayerTurn) return []
      return chess.moves({ square: from, verbose: true }).map((m) => m.to)
    },
    [chess, isPlayerTurn],
  )

  const needsPromotion = useCallback(
    (from: Square, to: Square) =>
      chess.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion),
    [chess],
  )

  /** Spielerzug. Gibt true zurück, wenn er legal war und ausgeführt wurde. */
  const playMove = useCallback(
    (from: Square, to: Square, promotion?: string): boolean => {
      if (!isPlayerTurn) return false
      try {
        chess.move({ from, to, promotion })
      } catch {
        return false
      }
      sync()
      return true
    },
    [chess, isPlayerTurn, sync],
  )

  /** Nimmt den letzten eigenen Zug (und die Engine-Antwort darauf) zurück. */
  const undo = useCallback(() => {
    gameId.current++
    setResigned(null)
    let undone = 0
    while (chess.history().length > 0) {
      const m = chess.undo()
      if (m && m.color === playerColor) undone++
      if (undone > 0 && chess.turn() === playerColor) break
    }
    sync()
  }, [chess, playerColor, sync])

  const newGame = useCallback(
    (color: Color, startFen?: string) => {
      gameId.current++
      if (startFen) chess.load(startFen)
      else chess.reset()
      setResigned(null)
      setGameNo((n) => n + 1)
      setPlayerColor(color)
      engine?.newGame()
      sync()
    },
    [chess, engine, sync],
  )

  const resign = useCallback(() => {
    if (!status.over) setResigned(playerColor)
  }, [playerColor, status.over])

  return {
    chess,
    gameNo,
    fen,
    moves,
    playerColor,
    status,
    thinking,
    isPlayerTurn,
    legalTargets,
    needsPromotion,
    playMove,
    undo,
    newGame,
    resign,
  }
}
