import type { Move } from 'chess.js'
import { useEffect, useRef } from 'react'

export function MoveList({ moves }: { moves: Move[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length])

  // Falls die Partie mit Schwarz am Zug beginnt, kommt das hier nicht vor – Start ist immer Grundstellung.
  const rows: { n: number; w?: string; b?: string }[] = []
  moves.forEach((m, i) => {
    const n = Math.floor(i / 2) + 1
    if (i % 2 === 0) rows.push({ n, w: m.san })
    else rows[rows.length - 1].b = m.san
  })

  return (
    <div className="move-list">
      {rows.length === 0 && <div className="muted">Noch keine Züge</div>}
      {rows.map((r) => (
        <div className="move-row" key={r.n}>
          <span className="move-n">{r.n}.</span>
          <span className="move">{r.w}</span>
          <span className="move">{r.b ?? ''}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
