import { useCallback, useEffect, useRef, useState } from 'react'
import { playSound } from '../ui/sound'
import { Board } from '../ui/Board'
import { findPuzzle } from './loader'
import {
  ATTRIBUTION,
  displayThemes,
  FILTER_THEMES,
  recordRated,
  solutionSan,
  THEME_LABELS,
  type LibPuzzle,
  type PuzzleStats,
} from './puzzleLib'
import { usePuzzlePlay } from './usePuzzlePlay'

type Props = {
  stats: PuzzleStats
  setStats: (f: (s: PuzzleStats) => PuzzleStats) => void
  sound: boolean
}

export function TacticsMode({ stats, setStats, sound }: Props) {
  const [theme, setTheme] = useState<string>('')
  const [puzzle, setPuzzle] = useState<LibPuzzle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [delta, setDelta] = useState<number | null>(null)
  const [showTheme, setShowTheme] = useState(false)
  const statsRef = useRef(stats)
  statsRef.current = stats

  const loadNext = useCallback(async (th: string) => {
    setError(null)
    try {
      const s = statsRef.current
      // Leicht streuen, damit nicht immer genau gleich schwere Aufgaben kommen
      const target = s.rating + Math.round((Math.random() - 0.4) * 120)
      const p = await findPuzzle(target, { exclude: s.recent, theme: th || null })
      if (!p) setError('Kein passendes Puzzle gefunden.')
      setPuzzle(p)
      setDelta(null)
      setShowTheme(false)
    } catch {
      setError('Die Puzzles konnten nicht geladen werden. Bitte Verbindung prüfen.')
    }
  }, [])

  useEffect(() => {
    void loadNext(theme)
  }, [loadNext, theme])

  const onResult = (solved: boolean) => {
    if (!puzzle) return
    if (sound) playSound(solved ? 'correct' : 'wrong')
    const before = statsRef.current.rating
    const next = recordRated(statsRef.current, puzzle, solved)
    setDelta(next.rating - before)
    setStats(() => next)
  }

  const play = usePuzzlePlay(puzzle, onResult)
  const done = play.phase === 'solved' || play.phase === 'shown'
  const sideName = play.orientation === 'w' ? 'Weiss' : 'Schwarz'

  let status = ''
  let statusClass = ''
  if (!puzzle) status = error ?? 'Lade Puzzle …'
  else if (play.phase === 'intro') status = 'Der Gegner zieht …'
  else if (play.phase === 'solving' || play.phase === 'reply')
    status = play.mistake ? `Versuch es weiter – ${sideName} am Zug` : `Du spielst ${sideName} – finde den besten Zug`
  else if (play.phase === 'wrong') {
    status = `✗ ${play.wrongSan ?? ''} ist nicht die Lösung`
    statusClass = 'bad'
  } else if (play.phase === 'solved') {
    status = play.mistake ? '✓ Gelöst (nicht gewertet)' : '✓ Richtig gelöst!'
    statusClass = 'ok'
  } else if (play.phase === 'shown') {
    status = 'Lösung wird gezeigt'
    statusClass = 'bad'
  }

  const themes = puzzle ? displayThemes(puzzle.themes) : []

  return (
    <main className="layout">
      <section className="board-col">
        <div className={`status ${statusClass}`} data-testid="tactics-status" data-puzzle-id={puzzle?.id ?? ''} data-phase={play.phase}>
          {status}
        </div>
        <div className="board-row">
          <Board
            id="tactics"
            fen={play.fen || '8/8/8/8/8/8/8/8 w - - 0 1'}
            orientation={play.orientation}
            lastMove={play.lastMove}
            checkSquare={play.checkSquare}
            canMove={play.canMove}
            legalTargets={play.legalTargets}
            needsPromotion={play.needsPromotion}
            onMove={play.onMove}
          />
        </div>
      </section>

      <aside className="panel">
        <div className="card">
          <h2>Taktik</h2>
          <div className="pz-rating">
            <div>
              <span className="muted-text small">Deine Puzzle-Wertung</span>
              <strong data-testid="puzzle-rating">{stats.rating}</strong>
            </div>
            {delta !== null && (
              <span className={`pz-delta ${delta >= 0 ? 'up' : 'down'}`} data-testid="rating-delta">
                {delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </span>
            )}
          </div>
          <p className="coach-text">
            Serie: <strong data-testid="streak">{stats.streak}</strong> · Beste: {stats.bestStreak}
          </p>
          {puzzle && (done || delta !== null) && (
            <p className="muted-text small">
              Puzzle-Wertung: <strong>{puzzle.rating}</strong> ·{' '}
              <a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">
                #{puzzle.id}
              </a>
            </p>
          )}
          {puzzle && (showTheme || done) && themes.length > 0 && (
            <div className="pz-themes" data-testid="themes">
              {themes.map((t) => (
                <span key={t} className="pz-theme">
                  {t}
                </span>
              ))}
            </div>
          )}
          {done && puzzle && (
            <p className="coach-text" data-testid="solution">
              Lösung: <strong>{solutionSan(puzzle).join(' ')}</strong>
            </p>
          )}
          <div className="row">
            {!done ? (
              <>
                <button onClick={() => setShowTheme(true)} disabled={showTheme || !puzzle}>
                  💡 Thema zeigen
                </button>
                <button onClick={play.showSolution} disabled={!puzzle || play.phase === 'intro'}>
                  Lösung zeigen
                </button>
              </>
            ) : (
              <button className="primary pz-wide" onClick={() => void loadNext(theme)}>
                Nächstes →
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Thema</h2>
          <label className="pz-filter">
            <span className="muted-text small">Nur Puzzles mit diesem Motiv:</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} data-testid="theme-filter">
              <option value="">Alle Motive</option>
              {FILTER_THEMES.map((t) => (
                <option key={t} value={t}>
                  {THEME_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted-text small">
            Gelöst: {stats.solved} · Falsch: {stats.failed}
          </p>
          <p className="muted-text small pz-attrib">{ATTRIBUTION}</p>
        </div>
      </aside>
    </main>
  )
}
