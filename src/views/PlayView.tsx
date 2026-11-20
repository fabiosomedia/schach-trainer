import { Chess, type Color } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_INFO, isBad, type Category } from '../analysis/classify'
import { useCoach } from '../analysis/useCoach'
import type { StockfishEngine } from '../engine/stockfish'
import { levelConfig, MAX_LEVEL, MIN_LEVEL } from '../engine/strength'
import { findPosition, START_POSITIONS } from '../game/positions'
import { checkedKingSquare } from '../game/status'
import { useGame } from '../game/useGame'
import { gameAccuracy, type GameInput } from '../profile/profile'
import { Board } from '../ui/Board'
import { CoachPanel } from '../ui/CoachPanel'
import { EvalBar } from '../ui/EvalBar'
import { MoveList } from '../ui/MoveList'
import { playSound } from '../ui/sound'

type ColorChoice = 'w' | 'b' | 'random'

type Props = {
  engines: { play: StockfishEngine; coach: StockfishEngine } | null
  level: number
  onLevelChange: (level: number) => void
  autoLevel: boolean
  onAutoLevelChange: (on: boolean) => void
  sound: boolean
  onGameFinished: (g: GameInput) => void
  onReview: (pgn: string, color: Color) => void
}

const SUMMARY_ORDER: Category[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder']

export function PlayView(props: Props) {
  const { engines, level, onLevelChange, autoLevel, onAutoLevelChange, sound, onGameFinished, onReview } = props
  const [colorChoice, setColorChoice] = useState<ColorChoice>('w')
  const [startId, setStartId] = useState('start')
  const [goal, setGoal] = useState<string | null>(null)
  const [hint, setHint] = useState({ fen: '', level: 0 })

  const game = useGame(engines?.play ?? null, level)
  const { chess, fen, moves, playerColor, status, thinking, isPlayerTurn, gameNo } = game
  const coach = useCoach(engines?.coach ?? null, moves, fen, playerColor)

  const checkSquare = useMemo(() => checkedKingSquare(chess), [chess, fen])
  const lastMove = moves[moves.length - 1]
  const cfg = levelConfig(level)

  // --- Zurückblättern in der laufenden Partie (nur ansehen, nichts zurücknehmen) ---
  const [viewPly, setViewPly] = useState<number | null>(null)
  const viewing = viewPly !== null && viewPly < moves.length - 1
  useEffect(() => setViewPly(null), [gameNo])
  const goTo = useCallback(
    (p: number) => {
      const clamped = Math.max(-1, Math.min(moves.length - 1, p))
      setViewPly(clamped >= moves.length - 1 ? null : clamped)
    },
    [moves.length],
  )
  const current = viewing ? viewPly! : moves.length - 1
  const viewFen = !viewing ? fen : viewPly === -1 ? moves[0].before : moves[viewPly!].after
  const viewCheck = useMemo(() => (viewing ? checkedKingSquare(new Chess(viewFen)) : null), [viewing, viewFen])

  const rootRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Spielansicht bleibt in anderen Tabs versteckt gemountet → nur reagieren, wenn sichtbar
      if (!rootRef.current || rootRef.current.offsetParent === null) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') goTo(current - 1)
      else if (e.key === 'ArrowRight') goTo(current + 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, current])

  const lastPlayerPly = useMemo(() => {
    for (let i = moves.length - 1; i >= 0; i--) if (moves[i].color === playerColor) return i
    return -1
  }, [moves, playerColor])
  const lastAnalysis = lastPlayerPly >= 0 ? (coach.analyses[lastPlayerPly] ?? null) : null
  const viewAnalysis = useMemo(() => {
    if (!viewing) return null
    for (let i = viewPly!; i >= 0; i--) if (moves[i].color === playerColor) return coach.analyses[i] ?? null
    return null
  }, [viewing, viewPly, moves, playerColor, coach.analyses])
  const analysisList = useMemo(
    () => Object.values(coach.analyses).sort((a, b) => a.ply - b.ply),
    [coach.analyses],
  )

  // Beendete Partie ins Profil schreiben – sobald alle Züge analysiert sind (max. 8 s warten).
  const recorded = useRef(-1)
  useEffect(() => {
    if (!status.over || !status.result || recorded.current === gameNo || moves.length < 2) return
    const playerPlies = moves.filter((m) => m.color === playerColor).length
    const record = () => {
      if (recorded.current === gameNo) return
      recorded.current = gameNo
      onGameFinished({
        analyses: analysisList,
        playerColor,
        level,
        result: status.result!,
        reason: status.reason ?? '',
        plies: moves.length,
        pgn: chess.pgn(),
      })
    }
    if (analysisList.length >= playerPlies) {
      record()
      return
    }
    const t = setTimeout(record, 8000)
    return () => clearTimeout(t)
  }, [status, gameNo, moves, playerColor, analysisList, level, chess, onGameFinished])

  // Sounds bei neuen Zügen und Partieende
  const heard = useRef(0)
  useEffect(() => {
    const n = moves.length
    if (sound && n > heard.current && lastMove) {
      if (status.over && status.result) {
        const won = (status.result === '1-0' && playerColor === 'w') || (status.result === '0-1' && playerColor === 'b')
        playSound(status.result === '1/2-1/2' ? 'move' : won ? 'win' : 'lose')
      } else playSound(lastMove.san.includes('+') ? 'check' : lastMove.captured ? 'capture' : 'move')
    }
    heard.current = n
  }, [moves.length, lastMove, sound, status, playerColor])

  // Hinweis gilt nur für die aktuelle Stellung
  const hintLevel = hint.fen === fen ? hint.level : 0
  const bestNow = coach.currentEval?.best ?? null
  const hintSquares =
    bestNow && hintLevel >= 1 ? (hintLevel >= 2 ? [bestNow.slice(0, 2), bestNow.slice(2, 4)] : [bestNow.slice(0, 2)]) : []

  const arrows = useMemo(() => {
    if (viewing) return viewAnalysis && viewAnalysis.ply === viewPly && isBad(viewAnalysis.category) ? viewAnalysis.arrows : []
    if (hintLevel >= 3 && bestNow) return [{ from: bestNow.slice(0, 2), to: bestNow.slice(2, 4), color: 'rgba(80, 200, 120, 0.85)' }]
    if (!lastAnalysis || !isBad(lastAnalysis.category)) return []
    // Direkt nach dem Fehler: besserer Zug + Drohung. Nach der Gegnerantwort nur noch der bessere Zug.
    if (lastPlayerPly === moves.length - 1) return lastAnalysis.arrows
    if (lastPlayerPly === moves.length - 2 && isPlayerTurn) return lastAnalysis.arrows.slice(0, 1)
    return []
  }, [viewing, viewAnalysis, viewPly, hintLevel, bestNow, lastAnalysis, isPlayerTurn, lastPlayerPly, moves.length])

  const startPos = findPosition(startId)
  const startNewGame = () => {
    const chosen: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice
    game.newGame(startPos.color ?? chosen, startPos.fen)
    setGoal(startPos.goal ? `${startPos.name}: ${startPos.goal}` : null)
  }

  const downloadPgn = () => {
    const blob = new Blob([chess.pgn()], { type: 'application/x-chess-pgn' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `partie-${new Date().toISOString().slice(0, 10)}.pgn`
    a.click()
    URL.revokeObjectURL(a.href)
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
  if (viewing) {
    const m = viewPly! >= 0 ? moves[viewPly!] : null
    const no = m ? Number(m.before.split(' ')[5]) : 0
    statusText = m ? `Ansicht: ${no}${m.color === 'w' ? '.' : '…'} ${m.san} – Partie läuft weiter` : 'Ansicht: Startstellung'
  }

  const counts = SUMMARY_ORDER.map((c) => [c, analysisList.filter((a) => a.category === c).length] as const)

  return (
    <main className="layout" ref={rootRef}>
      <section className="board-col">
        <div className={`status ${status.over && !viewing ? 'over' : ''} ${thinking && !viewing ? 'thinking' : ''} ${viewing ? 'viewing' : ''}`}>
          {statusText}
        </div>
        <div className="board-row">
          <EvalBar score={(viewing ? coach.evals[viewFen]?.score : coach.currentEval?.score) ?? null} orientation={playerColor} />
          <Board
            id="play"
            fen={viewFen}
            orientation={playerColor}
            lastMove={viewing ? (viewPly! >= 0 ? moves[viewPly!] : undefined) : lastMove}
            checkSquare={viewing ? viewCheck : checkSquare}
            canMove={isPlayerTurn && !viewing}
            legalTargets={game.legalTargets}
            needsPromotion={game.needsPromotion}
            onMove={game.playMove}
            arrows={arrows}
            hintSquares={viewing ? [] : hintSquares}
          />
        </div>
        <div className="row nav">
          <button onClick={() => goTo(-1)} disabled={moves.length === 0 || current === -1} title="Zum Anfang">
            ⏮
          </button>
          <button onClick={() => goTo(current - 1)} disabled={moves.length === 0 || current === -1} title="Zug zurück (←)">
            ◀
          </button>
          <button onClick={() => goTo(current + 1)} disabled={!viewing} title="Zug vor (→)">
            ▶
          </button>
          <button
            className={viewing ? 'primary' : ''}
            onClick={() => setViewPly(null)}
            disabled={!viewing}
            title="Zur aktuellen Stellung"
          >
            {viewing ? '⏭ Aktuell' : '⏭'}
          </button>
        </div>
      </section>

      <aside className="panel">
        {status.over && analysisList.length > 0 && (
          <div className="card summary">
            <h2>Auswertung</h2>
            <div className="summary-acc">
              <span>Genauigkeit</span>
              <strong>{Math.round(gameAccuracy(analysisList))} %</strong>
            </div>
            <div className="summary-counts">
              {counts.map(([c, n]) => (
                <span key={c} title={CATEGORY_INFO[c].label} style={{ color: CATEGORY_INFO[c].color }}>
                  {CATEGORY_INFO[c].symbol} {n}
                </span>
              ))}
            </div>
            {counts[3][1] + counts[4][1] > 0 && (
              <p className="muted-text small">Deine Fehler landen als Puzzles im Training.</p>
            )}
            <button className="primary" onClick={() => onReview(chess.pgn(), playerColor)}>
              🔍 Partie genau analysieren
            </button>
          </div>
        )}

        {goal && (
          <div className="card goal">
            <h2>Aufgabe</h2>
            <p className="coach-text">{goal}</p>
          </div>
        )}

        <CoachPanel
          analysis={viewing ? viewAnalysis : lastAnalysis}
          waiting={!viewing && lastPlayerPly >= 0 && !lastAnalysis}
          canRetry={!viewing && !!lastAnalysis && isBad(lastAnalysis.category)}
          onRetry={game.undo}
          hintLevel={hintLevel}
          canHint={!viewing && isPlayerTurn && !!bestNow}
          onHint={() => setHint({ fen, level: hintLevel + 1 })}
        />

        <div className="card">
          <h2>Züge</h2>
          <MoveList moves={moves} analyses={coach.analyses} selected={viewing ? viewPly! : undefined} onSelect={goTo} />
          <div className="row">
            <button onClick={game.undo} disabled={moves.length === 0}>
              ↶ Zurück
            </button>
            <button onClick={game.resign} disabled={status.over || moves.length === 0}>
              🏳 Aufgeben
            </button>
          </div>
          <button onClick={downloadPgn} disabled={moves.length === 0}>
            ⤓ PGN herunterladen
          </button>
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

          <label className="field">
            <span>Startstellung</span>
            <select value={startId} onChange={(e) => setStartId(e.target.value)}>
              {(['Normal', 'Eröffnung', 'Endspiel'] as const).map((g) => (
                <optgroup key={g} label={g}>
                  {START_POSITIONS.filter((p) => p.group === g).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {startPos.color && <p className="muted-text small">Du spielst hier immer {startPos.color === 'w' ? 'Weiss' : 'Schwarz'}.</p>}

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
              onChange={(e) => onLevelChange(Number(e.target.value))}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={autoLevel} onChange={(e) => onAutoLevelChange(e.target.checked)} />
            Stärke nach jeder Partie automatisch anpassen
          </label>

          <button className="primary" onClick={startNewGame}>
            Neues Spiel
          </button>
        </div>
      </aside>
    </main>
  )
}
