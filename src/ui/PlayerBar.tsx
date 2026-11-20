import type { Color, PieceSymbol } from 'chess.js'
import { formatClock, LOW_TIME_MS } from '../game/clock'
import { pieceGlyph } from '../game/material'

type Props = {
  name: string
  /** Farbe, die diese Seite spielt. */
  color: Color
  /** Von dieser Seite geschlagene (gegnerische) Figuren. */
  captured: PieceSymbol[]
  /** Materialvorsprung dieser Seite (> 0 wird als „+N“ gezeigt). */
  advantage: number
  /** Restzeit in ms, `null` = ohne Uhr. */
  timeMs: number | null
  /** Uhr dieser Seite läuft gerade. */
  ticking: boolean
  /** Diese Seite ist am Zug (auch ohne Uhr). */
  toMove: boolean
  position: 'top' | 'bottom'
}

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** Leiste über/unter dem Brett: Avatar, Name, geschlagene Figuren, Material, Uhr. */
export function PlayerBar({ name, color, captured, advantage, timeMs, ticking, toMove, position }: Props) {
  const low = timeMs !== null && timeMs < LOW_TIME_MS
  return (
    <div className={`player-bar ${position} ${toMove ? 'to-move' : ''}`} data-color={color}>
      <span className={`player-avatar ${color === 'w' ? 'white' : 'black'}`} aria-hidden="true">
        {pieceGlyph('b', 'k')}
      </span>
      <div className="player-info">
        <span className="player-name">{name}</span>
        <span className="player-captured" title="Geschlagene Figuren">
          <span className={`captured-pieces ${opp(color) === 'w' ? 'white' : 'black'}`}>
            {captured.map((p) => pieceGlyph('b', p)).join('')}
          </span>
          {advantage > 0 && <span className="material-adv">+{advantage}</span>}
        </span>
      </div>
      {timeMs !== null && (
        <span
          className={`player-clock ${ticking ? 'running' : ''} ${low ? 'low' : ''} ${timeMs <= 0 ? 'flagged' : ''}`}
          title={`Restzeit ${name}`}
        >
          {formatClock(timeMs)}
        </span>
      )}
    </div>
  )
}
