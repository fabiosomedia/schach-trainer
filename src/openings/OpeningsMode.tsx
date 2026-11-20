import { Chess, type Color, type Move, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatEval } from '../analysis/eval'
import { positionScore } from '../analysis/explain'
import type { StockfishEngine } from '../engine/stockfish'
import { checkedKingSquare } from '../game/status'
import { Board } from '../ui/Board'
import { MoveList } from '../ui/MoveList'
import { playSound } from '../ui/sound'
import { buildCourses, searchCourses } from './courses'
import './openings.css'
import {
  buildTree,
  chooseOpponentMove,
  deepestName,
  leafStats,
  loadProgress,
  parseLines,
  recordRun,
  repertoireMove,
  saveProgress,
  suggestMove,
  type Course,
  type OLine,
  type OpeningProgress,
} from './trainer'

type Props = { engine: StockfishEngine | null; sound: boolean }

const GREEN = 'rgba(80, 200, 120, 0.85)'
const GREEN_SOFT = 'rgba(80, 200, 120, 0.4)'
const sideLabel = (c: Color) => (c === 'w' ? 'als Weiss' : 'als Schwarz')

let linesCache: Promise<OLine[]> | null = null
function loadLines(): Promise<OLine[]> {
  linesCache ??= fetch(`${import.meta.env.BASE_URL}openings/lines.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })
    .then(parseLines)
    .catch((e) => {
      linesCache = null
      throw e
    })
  return linesCache
}

export function OpeningsMode({ engine, sound }: Props) {
  const [lines, setLines] = useState<OLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<OpeningProgress>(() => loadProgress())
  useEffect(() => saveProgress(progress), [progress])
  const [run, setRun] = useState<{ course: Course; side: Color; learn: boolean } | null>(null)

  useEffect(() => {
    loadLines().then(setLines, () => setError('Die Eröffnungsdaten konnten nicht geladen werden. Bitte Verbindung prüfen.'))
  }, [])

  if (error) return <div className="card op-empty"><p className="error">{error}</p></div>
  if (!lines) return <div className="card op-empty"><p className="muted-text">Lade Eröffnungen …</p></div>

  if (run)
    return (
      <OpeningRun
        key={`${run.course.id}:${run.side}:${run.learn}`}
        course={run.course}
        side={run.side}
        learn={run.learn}
        progress={progress}
        onRecord={(leaf, mistakes) => setProgress((p) => recordRun(p, progressId(run.course, run.side), leaf, mistakes))}
        engine={engine}
        sound={sound}
        onExit={() => setRun(null)}
        onSwitch={(patch) => setRun({ ...run, ...patch })}
      />
    )

  return <CoursePicker lines={lines} progress={progress} onStart={(course, learn) => setRun({ course, side: course.side, learn })} />
}

/** Fortschritt hängt an Kurs und Seite (Caro-Kann als Weiss ist ein anderes Repertoire). */
const progressId = (c: Course, side: Color) => `${c.id}:${side}`

function courseProgress(c: Course, side: Color, p: OpeningProgress) {
  const tree = buildTree(c.lines)
  const mastered = new Set(p.courses[progressId(c, side)]?.mastered ?? [])
  const { total, open } = leafStats(tree, tree.root, mastered)
  return { total, done: total - open }
}

function CoursePicker({ lines, progress, onStart }: { lines: OLine[]; progress: OpeningProgress; onStart: (c: Course, learn: boolean) => void }) {
  const courses = useMemo(() => buildCourses(lines), [lines])
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchCourses(lines, query), [lines, query])
  const stats = useMemo(() => new Map(courses.map((c) => [c.id, courseProgress(c, c.side, progress)])), [courses, progress])

  return (
    <main className="op-pick">
      <div className="card">
        <h2>Eröffnungen lernen</h2>
        <p className="coach-text">
          Wähle eine Eröffnung. Der Gegner spielt zufällig verschiedene Varianten – du antwortest mit den Zügen aus dem
          Repertoire. <strong>Lernen</strong> zeigt dir die Züge mit Pfeilen, beim <strong>Üben</strong> spielst du aus dem
          Kopf. Fehlerfrei gespielte Varianten gelten als gelernt.
        </p>
        <input
          className="op-search"
          type="search"
          placeholder="Eröffnung oder Variante suchen, z. B. „Alien“, „Najdorf“, „B12“ …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim().length >= 2 && (
          <div className="op-results">
            {results.length === 0 && <p className="muted-text">Nichts gefunden.</p>}
            {results.map((c) => (
              <div key={c.id} className="op-result">
                <div>
                  <strong>{c.title}</strong>
                  <span className="op-meta">
                    {c.lines.length === 1 ? c.lines[0].moves.join(' ') : `${c.lines.length} Varianten`} · {sideLabel(c.side)}
                  </span>
                </div>
                <div className="op-actions">
                  <button onClick={() => onStart(c, true)}>Lernen</button>
                  <button className="primary" onClick={() => onStart(c, false)}>
                    Üben
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="op-grid">
        {courses.map((c) => {
          const s = stats.get(c.id)!
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
          return (
            <div key={c.id} className="card op-course" data-course={c.id}>
              <h2>{c.title}</h2>
              <span className={`op-side ${c.side}`}>{c.side === 'w' ? '○ als Weiss' : '● als Schwarz'}</span>
              <p className="op-intro">{c.intro}</p>
              <div className="op-progress" title={`${s.done} von ${s.total} Varianten gelernt`}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <span className="op-meta">
                {s.done} / {s.total} Varianten gelernt
              </span>
              <div className="op-actions">
                <button onClick={() => onStart(c, true)}>Lernen</button>
                <button className="primary" onClick={() => onStart(c, false)}>
                  Üben
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="pz-attrib">Eröffnungen: Lichess-Eröffnungsliste (CC0)</p>
    </main>
  )
}

type Phase = { kind: 'play' } | { kind: 'wrong'; played: string } | { kind: 'done' }

type RunProps = {
  course: Course
  side: Color
  learn: boolean
  progress: OpeningProgress
  onRecord: (leaf: string, mistakes: number) => void
  engine: StockfishEngine | null
  sound: boolean
  onExit: () => void
  onSwitch: (patch: Partial<{ side: Color; learn: boolean }>) => void
}

function OpeningRun({ course, side, learn, progress, onRecord, engine, sound, onExit, onSwitch }: RunProps) {
  const tree = useMemo(() => buildTree(course.lines), [course])
  const mastered = useMemo(() => new Set(progress.courses[progressId(course, side)]?.mastered ?? []), [progress, course, side])
  const total = useMemo(() => leafStats(tree, tree.root, new Set()).total, [tree])
  const open = leafStats(tree, tree.root, mastered).open

  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState(() => chessRef.current.fen())
  const [moves, setMoves] = useState<Move[]>([])
  const [path, setPath] = useState<string[]>([tree.root])
  const [phase, setPhase] = useState<Phase>({ kind: 'play' })
  const [mistakes, setMistakes] = useState(0)
  const [hint, setHint] = useState(false)
  const [evalText, setEvalText] = useState<string | null>(null)
  const [runNo, setRunNo] = useState(0)

  const key = path[path.length - 1]
  const node = tree.nodes.get(key)
  const turn = chessRef.current.turn()
  const myTurn = turn === side && phase.kind !== 'done'

  const apply = useCallback(
    (san: string, to: string) => {
      const m = chessRef.current.move(san)
      setFen(chessRef.current.fen())
      setMoves(chessRef.current.history({ verbose: true }))
      setPath((p) => [...p, to])
      setHint(false)
      if (sound) playSound(m.san.includes('+') ? 'check' : m.captured ? 'capture' : 'move')
    },
    [sound],
  )

  // Linienende erkennen und speichern
  const finished = useRef(false)
  useEffect(() => {
    if (finished.current || !node || node.children.length > 0 || path.length === 1) return
    finished.current = true
    setPhase({ kind: 'done' })
    onRecord(key, mistakes)
    if (sound) playSound(mistakes === 0 ? 'correct' : 'move')
    setEvalText(null)
    engine?.search(fen, { depth: 12 }).then((r) => setEvalText(formatEval(positionScore(fen, r))))
  }, [node, key, path.length, mistakes, onRecord, engine, fen, sound])

  // Gegner zieht
  useEffect(() => {
    if (phase.kind === 'done' || turn === side || !node || node.children.length === 0) return
    const t = setTimeout(() => {
      const ch = chooseOpponentMove(tree, key, mastered)
      if (ch) apply(ch.san, ch.to)
    }, 450)
    return () => clearTimeout(t)
    // mastered absichtlich nicht als Abhängigkeit: ändert sich erst am Linienende
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, turn, side, phase.kind, runNo])

  const restart = () => {
    chessRef.current = new Chess()
    finished.current = false
    setFen(chessRef.current.fen())
    setMoves([])
    setPath([tree.root])
    setPhase({ kind: 'play' })
    setMistakes(0)
    setHint(false)
    setEvalText(null)
    setRunNo((n) => n + 1)
  }

  const onMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (!myTurn) return false
    const probe = new Chess(chessRef.current.fen())
    let san: string
    try {
      san = probe.move({ from, to, promotion }).san
    } catch {
      return false
    }
    const ch = repertoireMove(tree, key, san)
    if (ch) {
      apply(ch.san, ch.to)
      setPhase({ kind: 'play' })
      return true
    }
    if (phase.kind !== 'wrong') setMistakes((m) => m + 1)
    setPhase({ kind: 'wrong', played: san })
    if (sound) playSound('wrong')
    return false
  }

  const legalTargets = useCallback(
    (from: Square) => (myTurn ? chessRef.current.moves({ square: from, verbose: true }).map((m) => m.to) : []),
    // fen als Auslöser: chessRef ändert sich in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myTurn, fen],
  )
  const needsPromotion = useCallback(
    (from: Square, to: Square) => chessRef.current.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen],
  )

  // Pfeile: beim Lernen alle Repertoire-Züge (empfohlener kräftig), beim Üben nur nach Fehler/Hinweis
  const best = myTurn ? suggestMove(tree, key, mastered) : null
  const showArrows = myTurn && (learn || hint || phase.kind === 'wrong')
  const arrows =
    showArrows && node
      ? node.children
          .filter((c) => learn || c === best)
          .map((c) => ({ from: c.uci.slice(0, 2), to: c.uci.slice(2, 4), color: c === best ? GREEN : GREEN_SOFT }))
      : []

  const name = deepestName(tree, path)
  const alternatives = node && myTurn && node.children.length > 1 ? node.children.map((c) => c.san) : []

  let status: string
  if (phase.kind === 'done') status = mistakes === 0 ? '✓ Variante fehlerfrei gespielt!' : `Variante beendet – ${mistakes} Fehler`
  else if (phase.kind === 'wrong') status = `✗ ${phase.played} ist nicht im Repertoire – versuch es nochmal`
  else if (myTurn) status = learn ? 'Spiele den markierten Zug' : 'Dein Zug – aus dem Kopf'
  else status = 'Gegner zieht …'

  return (
    <main className="layout op-run">
      <section className="board-col">
        <div className={`status ${phase.kind === 'wrong' ? 'bad' : phase.kind === 'done' ? (mistakes === 0 ? 'ok' : 'over') : ''}`}>
          {status}
        </div>
        <div className="board-row">
          <Board
            id="opening"
            fen={fen}
            orientation={side}
            lastMove={moves[moves.length - 1]}
            checkSquare={checkedKingSquare(chessRef.current)}
            canMove={myTurn}
            legalTargets={legalTargets}
            needsPromotion={needsPromotion}
            onMove={onMove}
            arrows={arrows}
          />
        </div>
      </section>

      <aside className="panel">
        <div className="card">
          <h2>{course.title}</h2>
          <span className={`op-side ${side}`}>
            {side === 'w' ? '○ als Weiss' : '● als Schwarz'} · {learn ? 'Lernen' : 'Üben'}
          </span>
          <p className="coach-text op-name">{name ? `${name.eco} · ${name.name}` : 'Grundstellung'}</p>
          {phase.kind === 'wrong' && best && (
            <p className="coach-tip">
              Im Repertoire {alternatives.length > 1 ? 'stehen' : 'steht'}: <strong>{node!.children.map((c) => c.san).join(', ')}</strong>
            </p>
          )}
          {learn && alternatives.length > 1 && phase.kind === 'play' && (
            <p className="muted-text small">Mehrere Züge sind hier möglich: {alternatives.join(', ')}</p>
          )}
          {phase.kind === 'done' && (
            <div className="op-done">
              <p className="coach-text">
                {mistakes === 0 ? 'Diese Variante zählt jetzt als gelernt.' : 'Spiel sie nochmal fehlerfrei, damit sie als gelernt zählt.'}
              </p>
              <p className="muted-text small">
                Stellung danach: <strong>{evalText ?? (engine ? '…' : '–')}</strong> (Stockfish)
              </p>
              <button className="primary" onClick={restart}>
                Nächste Variante →
              </button>
            </div>
          )}
          <div className="op-progress" title={`${total - open} von ${total} Varianten gelernt`}>
            <div style={{ width: `${total ? ((total - open) / total) * 100 : 0}%` }} />
          </div>
          <span className="op-meta">
            {total - open} / {total} Varianten gelernt · Fehler in diesem Durchgang: {mistakes}
          </span>
          <div className="row">
            <button onClick={() => (myTurn ? (setHint(true), !learn && setMistakes((m) => m + 1)) : undefined)} disabled={!myTurn || learn || hint}>
              💡 Hinweis
            </button>
            <button onClick={restart}>⟲ Neu starten</button>
          </div>
          <div className="row">
            <button onClick={() => onSwitch({ learn: !learn })}>{learn ? 'Zu „Üben“' : 'Zu „Lernen“'}</button>
            <button onClick={() => onSwitch({ side: side === 'w' ? 'b' : 'w' })}>Seite tauschen</button>
          </div>
          <button onClick={onExit}>← Zur Auswahl</button>
        </div>

        <div className="card">
          <h2>Züge</h2>
          <MoveList moves={moves} analyses={{}} />
        </div>
      </aside>
    </main>
  )
}
