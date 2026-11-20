import type { Color } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { StockfishEngine } from './engine/stockfish'
import { levelConfig, MAX_LEVEL, MIN_LEVEL } from './engine/strength'
import { checkedKingSquare } from './game/status'
import { useGame } from './game/useGame'
import { Board } from './ui/Board'
import { MoveList } from './ui/MoveList'

type ColorChoice = 'w' | 'b' | 'random'

export default function App() {
  const [engine, setEngine] = useState<StockfishEngine | null>(null)
  const [level, setLevel] = useState(3)
  const [colorChoice, setColorChoice] = useState<ColorChoice>('w')

  useEffect(() => {
    const e = new StockfishEngine()
    setEngine(e)
    return () => e.terminate()
  }, [])

  const game = useGame(engine, level)
  const { chess, fen, moves, playerColor, status, thinking, isPlayerTurn } = game
  const checkSquare = useMemo(() => checkedKingSquare(chess), [chess, fen])
  const lastMove = moves[moves.length - 1]
  const cfg = levelConfig(level)

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
  } else if (!engine) statusText = 'Engine lädt …'
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
          <Board
            fen={fen}
            orientation={playerColor}
            lastMove={lastMove}
            checkSquare={checkSquare}
            canMove={isPlayerTurn}
            legalTargets={game.legalTargets}
            needsPromotion={game.needsPromotion}
            onMove={game.playMove}
          />
        </section>

        <aside className="panel">
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

          <div className="card grow">
            <h2>Züge</h2>
            <MoveList moves={moves} />
            <div className="row">
              <button onClick={game.undo} disabled={moves.length === 0}>
                ↶ Zurück
              </button>
              <button onClick={game.resign} disabled={status.over || moves.length === 0}>
                🏳 Aufgeben
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
