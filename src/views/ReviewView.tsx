import { Chess, type Color, type Move } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, CATEGORY_INFO, isBad } from '../analysis/classify'
import { EvalGraph } from '../analysis/EvalGraph'
import { formatEval } from '../analysis/eval'
import { analyseMove, type MoveAnalysis } from '../analysis/explain'
import { estimatePerformance, evalSeries, keyMoments } from '../analysis/gameReview'
import { loadOpenings, openingAt, type Opening, type OpeningBook } from '../analysis/openings'
import type { StockfishEngine } from '../engine/stockfish'
import { gameAccuracy } from '../profile/profile'
import { Board } from '../ui/Board'
import { MoveList } from '../ui/MoveList'

type Props = {
  engine: StockfishEngine | null
  /** Von aussen übergebene Partie (z. B. aus der Statistik). */
  initial?: { pgn: string; color: Color; key: number } | null
}

/** Tiefer als im Live-Coach (13): hier darf es ein paar Sekunden dauern. */
const DEPTH = 16

export function ReviewView({ engine, initial }: Props) {
  const [pgn, setPgn] = useState(initial?.pgn ?? '')
  const [color, setColor] = useState<Color>(initial?.color ?? 'w')
  const [moves, setMoves] = useState<Move[]>([])
  const [analyses, setAnalyses] = useState<Record<number, MoveAnalysis>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [ply, setPly] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<Opening | null>(null)
  const [reviewColor, setReviewColor] = useState<Color>(color)
  /** Index in der besseren Fortsetzung (null = normale Partie-Ansicht). */
  const [variation, setVariation] = useState<number | null>(null)
  useEffect(() => setVariation(null), [ply])
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
      setReviewColor(side)
      setOpening(null)
      const book: OpeningBook | null = await loadOpenings().catch(() => null)
      if (run.current !== id) return
      setOpening(openingAt(ms, book))
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
          { book },
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
  const done = !!progress && progress.done >= progress.total
  const series = useMemo(() => evalSeries(moves.length, analyses), [moves.length, analyses])
  const moments = useMemo(() => (done ? keyMoments(moves, analyses, reviewColor) : []), [done, moves, analyses, reviewColor])
  const accuracy = gameAccuracy(list)
  const ownMoves = list.filter((a) => a.category !== 'book').length
  const perf = done ? estimatePerformance(accuracy, ownMoves) : null
  const graphMarks = useMemo(
    () => list.filter((a) => a.category === 'mistake' || a.category === 'blunder').map((a) => ({ ply: a.ply, category: a.category })),
    [list],
  )
  const moveNo = (p: number) => `${Math.floor(p / 2) + 1}${p % 2 === 0 ? '.' : '…'}`
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

  // Bessere Fortsetzung: Stellungen nach jedem Zug der Engine-Variante
  const varLine = useMemo(() => {
    if (!sel || !sel.bestSan || sel.uci === sel.bestUci) return []
    const c = new Chess(sel.fenBefore)
    const out: { san: string; fen: string; move: Move }[] = []
    for (const san of sel.bestLineSan) {
      try {
        const m = c.move(san)
        out.push({ san, fen: c.fen(), move: m })
      } catch {
        break
      }
    }
    return out
  }, [sel])
  const varStep = variation !== null ? varLine[variation] : undefined
  const startFullmove = sel ? Number(sel.fenBefore.split(' ')[5] ?? 1) : 1
  const varLabel = (i: number) => {
    const white = sel ? (sel.color === 'w') === (i % 2 === 0) : true
    const no = startFullmove + Math.floor((i + (sel?.color === 'b' ? 1 : 0)) / 2)
    return white ? `${no}.` : i === 0 ? `${no}…` : ''
  }

  return (
    <main className="layout">
      <section className="board-col">
        <div className="status">
          {progress && progress.done < progress.total
            ? `Analysiere … ${progress.done}/${progress.total}`
            : varStep
              ? `Bessere Fortsetzung – Zug ${variation! + 1} von ${varLine.length}`
              : selMove
              ? `${Math.floor(ply / 2) + 1}${selMove.color === 'w' ? '.' : '…'} ${selMove.san}${showBefore ? ' – Stellung vor dem Zug' : ''}`
              : 'Startstellung'}
        </div>
        <div className="board-row">
          <Board
            id="review"
            fen={varStep ? varStep.fen : fen}
            orientation={color}
            lastMove={varStep ? varStep.move : showBefore ? undefined : selMove}
            checkSquare={null}
            canMove={false}
            legalTargets={noop}
            needsPromotion={() => false}
            onMove={() => false}
            arrows={varStep ? [] : arrows}
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
                {varLine.length > 0 && (
                  <div className="variation">
                    <span className="variation-title">So wäre es besser gegangen:</span>
                    <div className="variation-moves">
                      {varLine.map((v, i) => (
                        <button
                          key={i}
                          className={variation === i ? 'active' : ''}
                          onClick={() => setVariation(i)}
                          title="Stellung nach diesem Zug zeigen"
                        >
                          {varLabel(i)} {v.san}
                        </button>
                      ))}
                    </div>
                    <div className="row">
                      <button
                        onClick={() => setVariation((v) => (v === null ? 0 : Math.min(varLine.length - 1, v + 1)))}
                        disabled={variation === varLine.length - 1}
                      >
                        {variation === null ? '▶ Durchspielen' : '▶ Weiter'}
                      </button>
                      <button onClick={() => setVariation(null)} disabled={variation === null}>
                        ↩ Zurück zur Partie
                      </button>
                    </div>
                  </div>
                )}
                {showBefore && variation === null && (
                  <p className="coach-legend">
                    <span className="dot orange" /> gespielt <span className="dot green" /> besser
                  </p>
                )}
              </div>
            )}

            {list.length > 0 && (
              <div className="card summary">
                <h2>Auswertung</h2>
                {opening && (
                  <p className="opening-name" title="Eröffnung laut Lichess-Eröffnungsliste">
                    <span className="eco">{opening.eco}</span>
                    {opening.name}
                  </p>
                )}
                <div className="summary-acc">
                  <span>Genauigkeit</span>
                  <strong>{Math.round(accuracy)} %</strong>
                </div>
                {perf !== null && (
                  <div className="perf" title="Grobe Faustregel aus der Genauigkeit dieser einen Partie – keine echte Wertungszahl">
                    <span>Leistung (geschätzt)</span>
                    <span>
                      <strong>≈ {perf}</strong> <small>Elo</small>
                    </span>
                  </div>
                )}
                <div className="summary-counts">
                  {CATEGORIES.map((c) => (
                    <span key={c} title={CATEGORY_INFO[c].label} style={{ color: CATEGORY_INFO[c].color }}>
                      {CATEGORY_INFO[c].symbol} {list.filter((a) => a.category === c).length}
                    </span>
                  ))}
                </div>
                <EvalGraph
                  series={series}
                  marks={graphMarks}
                  selected={ply}
                  onSelect={setPly}
                  sanOf={(p) => moves[p]?.san ?? ''}
                />
                <p className="eg-legend">
                  <span>▲ Vorteil Weiss</span>
                  <span>Klick springt zum Zug</span>
                  <span>▼ Vorteil Schwarz</span>
                </p>
                <p className="muted-text small">Buchzüge (📖) zählen nicht zur Genauigkeit.</p>
                {mistakes.length > 0 && (
                  <div className="jump">
                    {mistakes.map((m) => (
                      <button key={m.ply} onClick={() => setPly(m.ply)} style={{ borderColor: CATEGORY_INFO[m.category].color }}>
                        {moveNo(m.ply)} {m.san}
                        {CATEGORY_INFO[m.category].symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {moments.length > 0 && (
              <div className="card key-moments">
                <h2>Schlüsselmomente</h2>
                <ol className="moments">
                  {moments.map((k) => (
                    <li key={k.ply}>
                      <button
                        onClick={() => setPly(k.ply)}
                        style={{ borderLeftColor: k.swing < 0 ? 'var(--danger)' : '#2f7d3f' }}
                        title="Zu diesem Zug springen"
                      >
                        {moveNo(k.ply)} {k.san}
                      </button>
                      <p>
                        <span className={`swing ${k.swing < 0 ? 'down' : 'up'}`}>
                          {k.swing > 0 ? '+' : '−'}
                          {Math.round(Math.abs(k.swing))} %
                        </span>{' '}
                        {k.text}
                      </p>
                    </li>
                  ))}
                </ol>
                <p className="muted-text small">Grösste Änderungen deiner Gewinnchance in dieser Partie.</p>
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
