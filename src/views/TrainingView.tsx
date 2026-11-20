import { Chess, type Square } from 'chess.js'
import { useCallback, useMemo, useState } from 'react'
import { forColor, winPercent } from '../analysis/eval'
import { positionScore } from '../analysis/explain'
import type { StockfishEngine } from '../engine/stockfish'
import { MOTIF_INFO } from '../profile/motifInfo'
import { duePuzzles, type Profile, type Puzzle } from '../profile/profile'
import { Board } from '../ui/Board'

type Props = {
  engine: StockfishEngine | null
  profile: Profile
  onAnswer: (id: string, correct: boolean) => void
}

type State =
  | { kind: 'solving' }
  | { kind: 'checking' }
  | { kind: 'done'; correct: boolean; playedSan: string; note: string }

/** Ein Zug gilt auch als richtig, wenn er höchstens so viel Gewinnchance kostet. */
const ACCEPT_LOSS = 3

export function TrainingView({ engine, profile, onAnswer }: Props) {
  const due = useMemo(() => duePuzzles(profile), [profile])
  const [current, setCurrent] = useState<Puzzle | null>(() => due[0] ?? null)
  const [fen, setFen] = useState(current?.fen ?? '')
  const [state, setState] = useState<State>({ kind: 'solving' })
  const [showTheme, setShowTheme] = useState(false)
  const [session, setSession] = useState({ right: 0, wrong: 0 })

  const start = useCallback((p: Puzzle | null) => {
    setCurrent(p)
    setFen(p?.fen ?? '')
    setState({ kind: 'solving' })
    setShowTheme(false)
  }, [])

  const chess = useMemo(() => (fen ? new Chess(fen) : null), [fen])
  const turn = chess?.turn() ?? 'w'
  const canMove = state.kind === 'solving' && !!chess

  const legalTargets = useCallback(
    (from: Square) => (canMove && chess ? chess.moves({ square: from, verbose: true }).map((m) => m.to) : []),
    [chess, canMove],
  )
  const needsPromotion = useCallback(
    (from: Square, to: Square) => !!chess?.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion),
    [chess],
  )

  const finish = (correct: boolean, playedSan: string, note: string) => {
    setState({ kind: 'done', correct, playedSan, note })
    setSession((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }))
    if (current) onAnswer(current.id, correct)
  }

  const onMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (!current || !chess || !canMove) return false
    const c = new Chess(current.fen)
    let san: string
    try {
      san = c.move({ from, to, promotion }).san
    } catch {
      return false
    }
    const uci = from + to + (promotion ?? '')
    setFen(c.fen())
    if (uci === current.bestUci || san === current.bestSan) {
      finish(true, san, 'Genau der richtige Zug!')
      return true
    }
    if (c.isCheckmate()) {
      finish(true, san, 'Matt – noch besser geht es nicht!')
      return true
    }
    if (!engine) {
      finish(false, san, '')
      return true
    }
    // Anderer Zug: ist er (fast) genauso gut?
    setState({ kind: 'checking' })
    Promise.all([engine.search(current.fen, { depth: 13 }), engine.search(c.fen(), { depth: 13 })]).then(([b, a]) => {
      const me = new Chess(current.fen).turn()
      const loss =
        winPercent(forColor(positionScore(current.fen, b), me)) - winPercent(forColor(positionScore(c.fen(), a), me))
      if (loss <= ACCEPT_LOSS) finish(true, san, `Auch gut! Die Engine hätte ${current.bestSan} gespielt, aber ${san} ist gleichwertig.`)
      else finish(false, san, '')
    })
    return true
  }

  const next = () => {
    const rest = duePuzzles(profile).filter((p) => p.id !== current?.id)
    start(rest[0] ?? null)
  }

  const retry = () => {
    if (current) {
      setFen(current.fen)
      setState({ kind: 'solving' })
    }
  }

  if (!current) {
    const total = profile.puzzles.length
    const nextDue = profile.puzzles.reduce((m, p) => Math.min(m, p.due), Infinity)
    return (
      <main className="layout single">
        <div className="card empty">
          <h2>Training</h2>
          {total === 0 ? (
            <p>
              Noch keine Puzzles. Spiel ein paar Partien – aus jedem <strong>Fehler</strong> und <strong>Patzer</strong>{' '}
              entsteht ein Puzzle mit genau der Stellung, in der du danebengegriffen hast.
            </p>
          ) : (
            <p>
              🎉 Alles erledigt für jetzt! {total} {total === 1 ? 'Puzzle' : 'Puzzles'} in deiner Sammlung.
              {Number.isFinite(nextDue) && <> Nächstes fällig: {new Date(nextDue).toLocaleString('de-CH')}.</>}
            </p>
          )}
          {session.right + session.wrong > 0 && (
            <p className="muted-text">
              Diese Runde: {session.right} richtig, {session.wrong} falsch.
            </p>
          )}
          {due.length > 0 && (
            <button className="primary" onClick={() => start(due[0])}>
              Training starten ({due.length})
            </button>
          )}
        </div>
      </main>
    )
  }

  const best = current.bestUci
  const arrows =
    state.kind === 'done' && !state.correct ? [{ from: best.slice(0, 2), to: best.slice(2, 4), color: 'rgba(80, 200, 120, 0.85)' }] : []
  const info = MOTIF_INFO[current.motif]

  return (
    <main className="layout">
      <section className="board-col">
        <div className={`status ${state.kind === 'done' ? (state.correct ? 'ok' : 'bad') : ''}`}>
          {state.kind === 'solving' && `${turn === 'w' ? 'Weiss' : 'Schwarz'} am Zug – finde den besten Zug`}
          {state.kind === 'checking' && 'Prüfe deinen Zug …'}
          {state.kind === 'done' && (state.correct ? '✓ Richtig!' : '✗ Leider nicht')}
        </div>
        <div className="board-row">
          <Board
            id="puzzle"
            fen={state.kind === 'done' && !state.correct ? current.fen : fen}
            orientation={new Chess(current.fen).turn()}
            checkSquare={null}
            canMove={canMove}
            legalTargets={legalTargets}
            needsPromotion={needsPromotion}
            onMove={onMove}
            arrows={arrows}
          />
        </div>
      </section>

      <aside className="panel">
        <div className="card">
          <h2>Puzzle aus deiner Partie</h2>
          <p className="coach-text">
            {state.kind === 'done' ? (
              <>
                Bester Zug: <strong>{current.bestSan}</strong>
              </>
            ) : (
              'In dieser Stellung aus deiner Partie hast du danebengegriffen. Findest du jetzt den besten Zug?'
            )}
          </p>
          {state.kind === 'done' && state.note && <p className="coach-text">{state.note}</p>}
          {state.kind === 'done' && !state.correct && (
            <>
              <p className="coach-text">
                Du hast <strong>{state.playedSan}</strong> gespielt.
              </p>
              <p className="coach-tip">{current.explanation}</p>
            </>
          )}
          {(showTheme || state.kind === 'done') && (
            <p className="coach-tip">
              <strong>{info.label}:</strong> {info.advice}
            </p>
          )}
          <div className="row">
            {state.kind !== 'done' ? (
              <button onClick={() => setShowTheme(true)} disabled={showTheme}>
                💡 Thema zeigen
              </button>
            ) : (
              <button onClick={retry} disabled={state.correct}>
                ⟲ Nochmal
              </button>
            )}
            <button className={state.kind === 'done' ? 'primary' : ''} onClick={next}>
              {state.kind === 'done' ? 'Nächstes →' : 'Überspringen'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Fortschritt</h2>
          <p className="coach-text">
            Fällig: <strong>{due.length}</strong> · Diese Runde: {session.right} ✓ / {session.wrong} ✗
          </p>
          <p className="muted-text small">
            Richtig gelöste Puzzles kommen später wieder (1 → 3 → 7 → 14 → 30 Tage), falsche schon in 10 Minuten.
          </p>
        </div>
      </aside>
    </main>
  )
}
