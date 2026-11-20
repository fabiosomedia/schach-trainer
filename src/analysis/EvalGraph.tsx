import type { Score } from '../engine/uci'
import { CATEGORY_INFO, type Category } from './classify'
import { formatEval, winPercent } from './eval'
import './review.css'

type Props = {
  /** Bewertung (Sicht Weiss) je Stellung: Index 0 = Start, i+1 = nach Halbzug i. */
  series: (Score | null)[]
  /** Markierte Züge (Fehler, Patzer). */
  marks: { ply: number; category: Category }[]
  /** Aktuell gewählter Halbzug (-1 = Start). */
  selected: number
  onSelect: (ply: number) => void
  sanOf: (ply: number) => string
}

const W = 600
const H = 120

/**
 * Bewertungsverlauf als Flächendiagramm: helle Fläche = Vorteil Weiss (oben), dunkel = Schwarz.
 * Skala = Gewinnchance (flacht bei grossem Vorteil ab, wie die Eval-Leiste). Klick springt zum Zug.
 */
export function EvalGraph({ series, marks, selected, onSelect, sanOf }: Props) {
  const n = series.length - 1
  if (n < 1) return null
  // Lücken mit dem letzten bekannten Wert füllen
  let last = 50
  const win = series.map((s) => (s ? (last = winPercent(s)) : last))
  const x = (i: number) => (i / n) * W
  const y = (w: number) => H - (w / 100) * H
  const pts = win.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`)
  const area = `M0,${H} L${pts.join(' L')} L${W},${H} Z`
  const colW = W / n

  return (
    <div className="eval-graph">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Bewertungsverlauf der Partie">
        <rect className="eg-bg" x={0} y={0} width={W} height={H} />
        <path className="eg-area" d={area} />
        <line className="eg-mid" x1={0} x2={W} y1={H / 2} y2={H / 2} />
        {selected >= -1 && <line className="eg-sel" x1={x(selected + 1)} x2={x(selected + 1)} y1={0} y2={H} />}
        {marks.map((m) => (
          <line
            key={m.ply}
            className="eg-mark"
            x1={x(m.ply + 1)}
            x2={x(m.ply + 1)}
            y1={0}
            y2={H}
            style={{ stroke: CATEGORY_INFO[m.category].color }}
          />
        ))}
        {series.map((s, i) => (
          <rect
            key={i}
            className="eg-hit"
            data-ply={i - 1}
            x={Math.max(0, x(i) - colW / 2)}
            y={0}
            width={colW}
            height={H}
            onClick={() => onSelect(i - 1)}
          >
            <title>{i === 0 ? 'Startstellung' : `${Math.floor((i - 1) / 2) + 1}${(i - 1) % 2 === 0 ? '.' : '…'} ${sanOf(i - 1)}${s ? ` (${formatEval(s)})` : ''}`}</title>
          </rect>
        ))}
      </svg>
      <div className="eg-dots" aria-hidden>
        {marks.map((m) => (
          <span
            key={m.ply}
            style={{ left: `${(x(m.ply + 1) / W) * 100}%`, top: `${(y(win[m.ply + 1]) / H) * 100}%`, background: CATEGORY_INFO[m.category].color }}
          />
        ))}
      </div>
    </div>
  )
}
