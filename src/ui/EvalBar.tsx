import type { Color } from 'chess.js'
import type { CSSProperties } from 'react'
import { formatEval, winPercent } from '../analysis/eval'
import type { Score } from '../engine/uci'

/** Senkrechte Bewertungsleiste. Weiss-Anteil = Gewinnchance von Weiss. */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: Color }) {
  const white = score ? winPercent(score) : 50
  const label = score ? formatEval(score) : '…'
  const whiteOnTop = orientation === 'b'
  return (
    <div className="eval-bar" title={`Bewertung: ${label}`}>
      <div
        className="eval-white"
        style={{ height: `${white}%`, [whiteOnTop ? 'top' : 'bottom']: 0 } as CSSProperties}
      />
      <span className={`eval-label ${white >= 50 ? 'on-white' : 'on-black'}`} style={{ [white >= 50 === !whiteOnTop ? 'bottom' : 'top']: 4 }}>
        {label}
      </span>
    </div>
  )
}
