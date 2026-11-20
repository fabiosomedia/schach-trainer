import { Chess, type Color, type Move } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_INFO, isBad, type Category } from '../analysis/classify'
import { formatEval } from '../analysis/eval'
import { analyseMove, type MoveAnalysis } from '../analysis/explain'
import type { StockfishEngine } from '../engine/stockfish'
import { gameAccuracy } from '../profile/profile'
import { Board } from '../ui/Board'
import { MoveList } from '../ui/MoveList'

type Props = {
  engine: StockfishEngine | null
  /** Von aussen übergebene Partie (z. B. aus der Statistik). */
  initial?: { pgn: string; color: Color; key: number } | null
}

const ORDER: Category[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder']
const DEPTH = 12

export function ReviewView({ engine, initial }: Props) {
  const [pgn, setPgn] = useState(initial?.pgn ?? '')
  const [color, setColor] = useState<Color>(initial?.color ?? 'w')
  const [moves, setMoves] = useState<Move[]>([])
  const [analyses, setAnalyses] = useState<Record<number, MoveAnalysis>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [ply, setPly] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)

  const analyse = useCallback(
    async (text: string, side: Color) => {
      setError(null)
      const c = new Chess()
      try {
        c.loadPgn(text.trim())
      } catch {
        setError('Die PGN konnte nicht gelesen werden. Prüfe, ob sie vollständig ist.')
        return
      }
      const ms = c.history({ verbose: true })
      if (ms.length === 0) {
        setError('Die Partie enthält keine Züge.')
        return
      }
      const id = ++run.current
      setMoves(ms)
      setAnalyses({})
      setPly(-1)
      if (!engine) return
      const targets = ms.map((m, i) => ({ m, i })).filter((x) => x.m.color === side)
      setProgress({ done: 0, total: targets.length })
      for (const { m, i } of targets) {
        const [before, after] = await Promise.all([engine.search(m.before, { depth: DEPTH }), engine.search(m.after, { depth: DEPTH })])
        if (run.current !== id) return
        const a = analyseMove(
          { ply: i, fenBefore: m.before, fenAfter: m.after, san: m.san, from: m.from, to: m.to, promotion: m.promotion, piece: m.piece, color: m.color },
          before,
          after,
        )
        setAnalyses((p) => ({ ...p, [i]: a }))
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
      }
    },
    [engine],
  )

  // Partie aus der Statistik automatisch analysieren
  useEffect(() => {
    if (initial && engine) {
      setPgn(initial.pgn)
      setColor(initial.color)
      void analyse(initial.pgn, initial.color)
    }
  }, [initial, engine, analyse])

  // Pfeiltasten zum Blättern
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(-1, p - 1))
      if (e.key === 'ArrowRight') setPly((p) => Math.min(moves.length - 1, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moves.length])

  const list = useMemo(() => Object.values(analyses).sort((a, b) => a.ply - b.ply), [analyses])
  const mistakes = list.filter((a) => isBad(a.category))
  const sel = ply >= 0 ? analyses[ply] : undefined
  const selMove = ply >= 0 ? moves[ply] : undefined
  const showBefore = !!sel && isBad(sel.category)
  const fen = !selMove ? (moves[0]?.before ?? new Chess().fen()) : showBefore ? selMove.before : selMove.after
  const arrows =
    showBefore && sel
      ? [
          { from: selMove!.from, to: selMove!.to, color: 'rgba(255, 140, 60, 0.85)' },
          ...(sel.bestUci ? [{ from: sel.bestUci.slice(0, 2), to: sel.bestUci.slice(2, 4), color: 'rgba(80, 200, 120, 0.85)' }] : []),
        ]
      : []
  const noop = () => []

  return (
    <main className="layout">
      <section className="board-col">
        <div className="status">
          {progress && progress.done < progress.total
            ? `Analysiere … ${progress.done}/${progress.total}`
            : selMove
              ? `${Math.floor(ply / 2) + 1}${selMove.color === 'w' ? '.' : '…'} ${selMove.san}${showBefore ? ' – Stellung vor dem Zug' : ''}`
              : 'Startstellung'}
        </div>
        <div className="board-row">
          <Board
            id="review"
            fen={fen}
            orientation={color}
            lastMove={showBefore ? undefined : selMove}
            checkSquare={null}
            canMove={false}
            legalTargets={noop}
            needsPromotion={() => false}
            onMove={() => false}
            arrows={arrows}
          />
        </div>
        <div className="row nav">
          <button onClick={() => setPly(-1)}>⏮</button>
          <button onClick={() => setPly((p) => Math.max(-1, p - 1))}>◀</button>
          <button onClick={() => setPly((p) => Math.min(moves.length - 1, p + 1))}>▶</button>
          <button onClick={() => setPly(moves.length - 1)}>⏭</button>
        </div>
      </section>

      <aside className="panel">
        <div className="card">
          <h2>Partie laden</h2>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder={'PGN hier einfügen, z. B. von Lichess oder Chess.com:\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 …'}
            rows={5}
          />
          <div className="seg two">
            <button aria-pressed={color === 'w'} onClick={() => setColor('w')}>
              ○ Ich war Weiss
            </button>
            <button aria-pressed={color === 'b'} onClick={() => setColor('b')}>
              ● Ich war Schwarz
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={() => analyse(pgn, color)} disabled={!pgn.trim() || !engine}>
            Analysieren
          </button>
        </div>

        {moves.length > 0 && (
          <>
            {sel && (
              <div className="card coach">
                <div className="coach-head">
                  <span className="badge" style={{ background: CATEGORY_INFO[sel.category].color }}>
                    {CATEGORY_INFO[sel.category].symbol} {CATEGORY_INFO[sel.category].label}
                  </span>
                  <span className="coach-move">{sel.san}</span>
                  <span className="coach-eval">
                    {formatEval(sel.scoreBefore)} → {formatEval(sel.scoreAfter)}
                  </span>
                </div>
                <p className="coach-text">{sel.text}</p>
                {sel.tips.map((t) => (
                  <p key={t.motif} className="coach-tip">
                    {t.text}
                  </p>
                ))}
                {showBefore && (
                  <p className="coach-legend">
                    <span className="dot orange" /> gespielt <span className="dot green" /> besser
                  </p>
                )}
              </div>
            )}

            {list.length > 0 && (
              <div className="card summary">
                <h2>Auswertung</h2>
                <div className="summary-acc">
                  <span>Genauigkeit</span>
                  <strong>{Math.round(gameAccuracy(list))} %</strong>
                </div>
                <div className="summary-counts">
                  {ORDER.map((c) => (
                    <span key={c} title={CATEGORY_INFO[c].label} style={{ color: CATEGORY_INFO[c].color }}>
                      {CATEGORY_INFO[c].symbol} {list.filter((a) => a.category === c).length}
                    </span>
                  ))}
                </div>
                {mistakes.length > 0 && (
                  <div className="jump">
                    {mistakes.map((m) => (
                      <button key={m.ply} onClick={() => setPly(m.ply)} style={{ borderColor: CATEGORY_INFO[m.category].color }}>
                        {Math.floor(m.ply / 2) + 1}. {m.san}
                        {CATEGORY_INFO[m.category].symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <h2>Züge</h2>
              <MoveList moves={moves} analyses={analyses} selected={ply} onSelect={setPly} />
            </div>
          </>
        )}
      </aside>
    </main>
  )
}
