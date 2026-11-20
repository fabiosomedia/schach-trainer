import type { Move } from 'chess.js'
import { useEffect, useRef } from 'react'
import { CATEGORY_INFO } from '../analysis/classify'
import type { MoveAnalysis } from '../analysis/explain'

type Props = { moves: Move[]; analyses: Record<number, MoveAnalysis> }

export function MoveList({ moves, analyses }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length])

  const cell = (ply: number) => {
    const m = moves[ply]
    if (!m) return <span className="move" />
    const a = analyses[ply]
    const info = a ? CATEGORY_INFO[a.category] : null
    const mark = a && a.category !== 'good' ? info!.symbol : ''
    return (
      <span className="move" title={info ? `${info.label}: ${a!.text}` : undefined}>
        {m.san}
        {mark && (
          <span className="mark" style={{ color: info!.color }}>
            {mark}
          </span>
        )}
      </span>
    )
  }

  const rows = Math.ceil(moves.length / 2)
  return (
    <div className="move-list">
      {rows === 0 && <div className="muted">Noch keine Züge</div>}
      {Array.from({ length: rows }, (_, r) => (
        <div className="move-row" key={r}>
          <span className="move-n">{r + 1}.</span>
          {cell(r * 2)}
          {cell(r * 2 + 1)}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
