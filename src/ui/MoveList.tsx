import type { Move } from 'chess.js'
import { useEffect, useRef } from 'react'
import { CATEGORY_INFO } from '../analysis/classify'
import type { MoveAnalysis } from '../analysis/explain'

type Props = {
  moves: Move[]
  analyses: Record<number, MoveAnalysis>
  /** Optional: angeklickter Halbzug (für die Analyse-Ansicht). */
  selected?: number
  onSelect?: (ply: number) => void
}

export function MoveList({ moves, analyses, selected, onSelect }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!onSelect) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length, onSelect])

  // Partien können aus einer FEN starten – Zugnummer und erste Farbe daraus ableiten.
  const first = moves[0]
  const startNo = first ? Number(first.before.split(' ')[5] ?? 1) : 1
  const offset = first?.color === 'b' ? 1 : 0

  const cell = (ply: number) => {
    const m = ply >= 0 ? moves[ply] : undefined
    if (!m) return <span className="move">{ply < 0 ? '…' : ''}</span>
    const a = analyses[ply]
    const info = a ? CATEGORY_INFO[a.category] : null
    const mark = a && a.category !== 'good' ? info!.symbol : ''
    return (
      <span
        className={`move ${onSelect ? 'clickable' : ''} ${selected === ply ? 'selected' : ''}`}
        title={info ? `${info.label}: ${a!.text}` : undefined}
        onClick={onSelect ? () => onSelect(ply) : undefined}
      >
        {m.san}
        {mark && (
          <span className="mark" style={{ color: info!.color }}>
            {mark}
          </span>
        )}
      </span>
    )
  }

  const rows = Math.ceil((moves.length + offset) / 2)
  return (
    <div className="move-list">
      {rows === 0 && <div className="muted">Noch keine Züge</div>}
      {Array.from({ length: rows }, (_, r) => (
        <div className="move-row" key={r}>
          <span className="move-n">{startNo + r}.</span>
          {cell(r * 2 - offset)}
          {cell(r * 2 + 1 - offset)}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
