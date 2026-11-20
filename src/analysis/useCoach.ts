import type { Color, Move } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchResult, StockfishEngine } from '../engine/stockfish'
import type { Score } from '../engine/uci'
import { analyseMove, positionScore, type MoveAnalysis } from './explain'
import { loadOpenings } from './openings'

/** Eröffnungsbuch laden; schlägt das fehl, wird ohne Buchzüge analysiert. */
const bookOrNull = () => loadOpenings().catch(() => null)

const ANALYSIS_DEPTH = 13

/**
 * Analysiert jeden Spielerzug mit einer eigenen Engine-Instanz und hält die
 * Bewertung der aktuellen Stellung (für Eval-Leiste und Hinweise) bereit.
 */
export function useCoach(engine: StockfishEngine | null, moves: Move[], fen: string, playerColor: Color) {
  const cache = useRef(new Map<string, Promise<SearchResult>>())
  const [analyses, setAnalyses] = useState<Record<number, MoveAnalysis>>({})
  const [evals, setEvals] = useState<Record<string, { score: Score; best: string | null }>>({})
  const pending = useRef(new Set<string>())

  const analyse = useCallback(
    (f: string): Promise<SearchResult> => {
      if (!engine) return Promise.reject(new Error('Engine nicht bereit'))
      let p = cache.current.get(f)
      if (!p) {
        p = engine.search(f, { depth: ANALYSIS_DEPTH })
        cache.current.set(f, p)
      }
      return p
    },
    [engine],
  )

  // Aktuelle Stellung bewerten (Eval-Leiste, Hinweis).
  useEffect(() => {
    if (!engine || evals[fen]) return
    let alive = true
    analyse(fen).then((r) => {
      if (alive) setEvals((e) => ({ ...e, [fen]: { score: positionScore(fen, r), best: r.bestmove } }))
    })
    return () => {
      alive = false
    }
  }, [engine, fen, analyse, evals])

  // Analysen von zurückgenommenen Zügen verwerfen.
  useEffect(() => {
    setAnalyses((a) => {
      const keep = Object.values(a).filter((x) => x.ply < moves.length && moves[x.ply].before === x.fenBefore)
      return keep.length === Object.keys(a).length ? a : Object.fromEntries(keep.map((x) => [x.ply, x]))
    })
  }, [moves])

  // Jeden neuen Spielerzug analysieren.
  useEffect(() => {
    if (!engine) return
    moves.forEach((m, ply) => {
      if (m.color !== playerColor) return
      const key = `${ply}:${m.before}:${m.lan}`
      if (pending.current.has(key)) return
      pending.current.add(key)
      Promise.all([analyse(m.before), analyse(m.after), bookOrNull()]).then(([before, after, book]) => {
        const a = analyseMove(
          {
            ply,
            fenBefore: m.before,
            fenAfter: m.after,
            san: m.san,
            from: m.from,
            to: m.to,
            promotion: m.promotion,
            piece: m.piece,
            color: m.color,
          },
          before,
          after,
          { book },
        )
        setAnalyses((prev) => ({ ...prev, [ply]: a }))
      })
    })
  }, [engine, moves, playerColor, analyse])

  // Beim Undo dürfen Züge neu analysiert werden.
  useEffect(() => {
    for (const key of [...pending.current]) {
      const ply = Number(key.split(':')[0])
      if (ply >= moves.length) pending.current.delete(key)
    }
  }, [moves.length])

  return { analyses, currentEval: evals[fen] ?? null, evals }
}
