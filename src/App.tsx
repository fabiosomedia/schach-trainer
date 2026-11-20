import type { Color } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { isBad } from './analysis/classify'
import { useCoach } from './analysis/useCoach'
import { StockfishEngine } from './engine/stockfish'
import { levelConfig, MAX_LEVEL, MIN_LEVEL } from './engine/strength'
import { checkedKingSquare } from './game/status'
import { useGame } from './game/useGame'
import { Board } from './ui/Board'
import { CoachPanel } from './ui/CoachPanel'
import { EvalBar } from './ui/EvalBar'
import { MoveList } from './ui/MoveList'

type ColorChoice = 'w' | 'b' | 'random'

/** Zwei Engines: eine spielt, eine analysiert – so blockieren sie sich nicht. */
function useEngines() {
  const [engines, setEngines] = useState<{ play: StockfishEngine; coach: StockfishEngine } | null>(null)
  useEffect(() => {
    const e = { play: new StockfishEngine(), coach: new StockfishEngine() }
    setEngines(e)
    return () => {
      e.play.terminate()
      e.coach.terminate()
    }
  }, [])
  return engines
}

export default function App() {
  const engines = useEngines()
  const [level, setLevel] = useState(3)
  const [colorChoice, setColorChoice] = useState<ColorChoice>('w')
  const [hint, setHint] = useState({ fen: '', level: 0 })

  const game = useGame(engines?.play ?? null, level)
  const { chess, fen, moves, playerColor, status, thinking, isPlayerTurn } = game
  const coach = useCoach(engines?.coach ?? null, moves, fen, playerColor)

  const checkSquare = useMemo(() => checkedKingSquare(chess), [chess, fen])
  const lastMove = moves[moves.length - 1]
  const cfg = levelConfig(level)

  // Letzter eigener Zug und seine Analyse
  const lastPlayerPly = useMemo(() => {
    for (let i = moves.length - 1; i >= 0; i--) if (moves[i].color === playerColor) return i
    return -1
  }, [moves, playerColor])
  const lastAnalysis = lastPlayerPly >= 0 ? (coach.analyses[lastPlayerPly] ?? null) : null

  // Hinweis gilt nur für die aktuelle Stellung
  const hintLevel = hint.fen === fen ? hint.level : 0
  const bestNow = coach.currentEval?.best ?? null
  const hintSquares =
    bestNow && hintLevel >= 1 ? (hintLevel >= 2 ? [bestNow.slice(0, 2), bestNow.slice(2, 4)] : [bestNow.slice(0, 2)]) : []

  const arrows = useMemo(() => {
    if (hintLevel >= 3 && bestNow) return [{ from: bestNow.slice(0, 2), to: bestNow.slice(2, 4), color: 'rgba(80, 200, 120, 0.85)' }]
    // Pfeile des letzten Fehlers nur zeigen, solange man am Zug ist
    if (lastAnalysis && isBad(lastAnalysis.category) && isPlayerTurn && lastPlayerPly === moves.length - 2)
      return lastAnalysis.arrows.slice(0, 1) // besserer Zug; Gegnerdrohung ist bereits gespielt
    if (lastAnalysis && isBad(lastAnalysis.category) && lastPlayerPly === moves.length - 1) return lastAnalysis.arrows
    return []
  }, [hintLevel, bestNow, lastAnalysis, isPlayerTurn, lastPlayerPly, moves.length])

  const startNewGame = () => {
    const color: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice
    game.newGame(color)
  }

  let statusText: string
  if (status.over) {
    const youWon =
      (status.result === '1-0' && playerColor === 'w') || (status.result === '0-1' && playerColor === 'b')
    const verdict = status.result === '1/2-1/2' ? 'Remis' : youWon ? 'Du hast gewonnen! 🎉' : 'Stockfish gewinnt'
    statusText = `${verdict} – ${status.reason}`
  } else if (!engines) statusText = 'Engine lädt …'
  else if (thinking) statusText = 'Stockfish denkt …'
  else if (isPlayerTurn) statusText = checkSquare ? 'Schach! Du bist am Zug' : 'Du bist am Zug'
  else statusText = '…'

  return (
    <div className="app">
      <header className="top">
        <h1>
          ♞ Schach<span>Trainer</span>
        </h1>
      </header>

      <main className="layout">
        <section className="board-col">
          <div className={`status ${status.over ? 'over' : ''} ${thinking ? 'thinking' : ''}`}>{statusText}</div>
          <div className="board-row">
            <EvalBar score={coach.currentEval?.score ?? null} orientation={playerColor} />
            <Board
              fen={fen}
              orientation={playerColor}
              lastMove={lastMove}
              checkSquare={checkSquare}
              canMove={isPlayerTurn}
              legalTargets={game.legalTargets}
              needsPromotion={game.needsPromotion}
              onMove={game.playMove}
              arrows={arrows}
              hintSquares={hintSquares}
            />
          </div>
        </section>

        <aside className="panel">
          <CoachPanel
            analysis={lastAnalysis}
            waiting={lastPlayerPly >= 0 && !lastAnalysis}
            canRetry={!!lastAnalysis && isBad(lastAnalysis.category)}
            onRetry={game.undo}
            hintLevel={hintLevel}
            canHint={isPlayerTurn && !!bestNow}
            onHint={() => setHint({ fen, level: hintLevel + 1 })}
          />

          <div className="card">
            <h2>Züge</h2>
            <MoveList moves={moves} analyses={coach.analyses} />
            <div className="row">
              <button onClick={game.undo} disabled={moves.length === 0}>
                ↶ Zurück
              </button>
              <button onClick={game.resign} disabled={status.over || moves.length === 0}>
                🏳 Aufgeben
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Neue Partie</h2>
            <div className="seg">
              {(
                [
                  ['w', '○ Weiss'],
                  ['b', '● Schwarz'],
                  ['random', '◐ Zufall'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} aria-pressed={colorChoice === v} onClick={() => setColorChoice(v)}>
                  {label}
                </button>
              ))}
            </div>

            <label className="level">
              <div className="level-head">
                <span>Stärke</span>
                <strong>
                  Stufe {cfg.level} · {cfg.label}
                </strong>
              </div>
              <input
                type="range"
                min={MIN_LEVEL}
                max={MAX_LEVEL}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
            </label>

            <button className="primary" onClick={startNewGame}>
              Neues Spiel
            </button>
          </div>
        </aside>
      </main>
    </div>
  )
}
