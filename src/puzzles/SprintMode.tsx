import { useCallback, useEffect, useRef, useState } from 'react'
import { Board } from '../ui/Board'
import { playSound } from '../ui/sound'
import { findPuzzle } from './loader'
import {
  ATTRIBUTION,
  markSeen,
  recordSprint,
  SPRINT_LIVES,
  SPRINT_SECONDS,
  sprintTarget,
  type LibPuzzle,
  type PuzzleStats,
} from './puzzleLib'
import { usePuzzlePlay } from './usePuzzlePlay'

type Props = {
  stats: PuzzleStats
  setStats: (f: (s: PuzzleStats) => PuzzleStats) => void
  sound: boolean
}

type Run = { score: number; mistakes: number; n: number; endsAt: number }
type Over = { score: number; best: number; record: boolean; reason: string }

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SprintMode({ stats, setStats, sound }: Props) {
  const [run, setRun] = useState<Run | null>(null)
  const [over, setOver] = useState<Over | null>(null)
  const [puzzle, setPuzzle] = useState<LibPuzzle | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef(run)
  runRef.current = run
  const seen = useRef<string[]>([])
  const nextTimer = useRef<number | null>(null)

  const fetchFor = useCallback(async (n: number) => {
    const p = await findPuzzle(sprintTarget(n), { exclude: [...stats.recent.slice(-400), ...seen.current] })
    if (p) seen.current.push(p.id)
    return p
    // stats.recent nur beim Start relevant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = useCallback(
    (r: Run, reason: string) => {
      if (nextTimer.current) clearTimeout(nextTimer.current)
      setRun(null)
      setPuzzle(null)
      const record = r.score > stats.sprintBest
      setOver({ score: r.score, best: Math.max(r.score, stats.sprintBest), record, reason })
      setStats((s) => {
        let next = recordSprint(s, r.score)
        for (const id of seen.current) next = markSeen(next, id)
        return next
      })
      if (sound) playSound(record ? 'win' : 'lose')
    },
    [setStats, sound, stats.sprintBest],
  )

  const start = async () => {
    seen.current = []
    setOver(null)
    setError(null)
    try {
      const p = await fetchFor(0)
      setPuzzle(p)
      setRun({ score: 0, mistakes: 0, n: 0, endsAt: Date.now() + SPRINT_SECONDS * 1000 })
      setNow(Date.now())
    } catch {
      setError('Die Puzzles konnten nicht geladen werden. Bitte Verbindung prüfen.')
    }
  }

  // Uhr
  useEffect(() => {
    if (!run) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [run])
  useEffect(() => {
    if (run && now >= run.endsAt) finish(run, 'Die Zeit ist abgelaufen.')
  }, [now, run, finish])

  useEffect(
    () => () => {
      if (nextTimer.current) clearTimeout(nextTimer.current)
    },
    [],
  )

  const onResult = (solved: boolean) => {
    const r = runRef.current
    if (!r) return
    if (sound) playSound(solved ? 'correct' : 'wrong')
    const next: Run = {
      ...r,
      n: r.n + 1,
      score: r.score + (solved ? 1 : 0),
      mistakes: r.mistakes + (solved ? 0 : 1),
    }
    setRun(next)
    setFlash(solved ? 'ok' : 'bad')
    if (next.mistakes >= SPRINT_LIVES) {
      nextTimer.current = window.setTimeout(() => finish(next, 'Drei Fehler – der Lauf ist vorbei.'), 700)
      return
    }
    nextTimer.current = window.setTimeout(
      async () => {
        const p = await fetchFor(next.n).catch(() => null)
        if (!runRef.current) return
        setFlash(null)
        setPuzzle(p)
      },
      solved ? 350 : 800,
    )
  }

  const play = usePuzzlePlay(puzzle, onResult)
  const sideName = play.orientation === 'w' ? 'Weiss' : 'Schwarz'
  const left = run ? run.endsAt - now : SPRINT_SECONDS * 1000

  let status = ''
  if (!run) status = over ? 'Lauf beendet' : 'Sprint – bereit?'
  else if (flash === 'ok') status = '✓ Richtig!'
  else if (flash === 'bad') status = `✗ Falsch${play.wrongSan ? ` (${play.wrongSan})` : ''}`
  else if (play.phase === 'intro') status = 'Der Gegner zieht …'
  else status = `${sideName} am Zug`

  return (
    <main className="layout">
      <section className="board-col">
        <div className={`status ${flash ?? ''}`} data-testid="sprint-status" data-puzzle-id={puzzle?.id ?? ''} data-phase={play.phase}>
          {status}
        </div>
        <div className="board-row">
          <Board
            id="sprint"
            fen={run && play.fen ? play.fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
            orientation={play.orientation}
            lastMove={run ? play.lastMove : undefined}
            checkSquare={run ? play.checkSquare : null}
            canMove={!!run && play.canMove && !flash}
            legalTargets={play.legalTargets}
            needsPromotion={play.needsPromotion}
            onMove={play.onMove}
          />
        </div>
      </section>

      <aside className="panel">
        <div className="card">
          <h2>Sprint</h2>
          {run ? (
            <>
              <div className="pz-sprint-head">
                <div>
                  <span className="muted-text small">Zeit</span>
                  <strong className={left < 20000 ? 'pz-hurry' : ''} data-testid="sprint-time">
                    {fmt(left)}
                  </strong>
                </div>
                <div>
                  <span className="muted-text small">Punkte</span>
                  <strong data-testid="sprint-score">{run.score}</strong>
                </div>
                <div>
                  <span className="muted-text small">Leben</span>
                  <strong className="pz-lives" data-testid="sprint-lives">
                    {'♥'.repeat(SPRINT_LIVES - run.mistakes)}
                    <span className="pz-lost">{'♥'.repeat(run.mistakes)}</span>
                  </strong>
                </div>
              </div>
              <p className="muted-text small">
                Aufgabe {run.n + 1} · etwa {puzzle?.rating ?? sprintTarget(run.n)} Punkte schwer
              </p>
              <button onClick={() => finish(run, 'Abgebrochen.')}>Lauf beenden</button>
            </>
          ) : (
            <>
              {over ? (
                <div className="pz-over" data-testid="sprint-over">
                  <p className="muted-text small">{over.reason}</p>
                  <p className="pz-big">
                    <strong data-testid="sprint-final">{over.score}</strong> gelöst
                  </p>
                  <p className="coach-text">{over.record ? '🏆 Neuer persönlicher Rekord!' : `Rekord: ${over.best}`}</p>
                </div>
              ) : (
                <p className="coach-text">
                  Löse in {SPRINT_SECONDS / 60} Minuten so viele Puzzles wie möglich. Es beginnt leicht und wird
                  immer schwerer. Nach {SPRINT_LIVES} Fehlern ist Schluss.
                </p>
              )}
              <p className="coach-text">
                Persönlicher Rekord: <strong data-testid="sprint-best">{stats.sprintBest}</strong>
                {stats.sprintRuns > 0 && <span className="muted-text small"> · {stats.sprintRuns} Läufe</span>}
              </p>
              {error && <p className="error">{error}</p>}
              <button className="primary" onClick={() => void start()}>
                {over ? 'Nochmal' : 'Sprint starten'}
              </button>
            </>
          )}
          <p className="muted-text small pz-attrib">{ATTRIBUTION}</p>
        </div>
      </aside>
    </main>
  )
}
