import type { Color, Move, Square } from 'chess.js'
import { useMemo, useState, type CSSProperties } from 'react'
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard'

type Props = {
  fen: string
  orientation: Color
  lastMove?: Move
  checkSquare: Square | null
  canMove: boolean
  legalTargets: (from: Square) => Square[]
  needsPromotion: (from: Square, to: Square) => boolean
  onMove: (from: Square, to: Square, promotion?: string) => boolean
  arrows?: { from: string; to: string; color: string }[]
  hintSquares?: string[]
}

const PROMO_PIECES = [
  { p: 'q', w: '♕', b: '♛', name: 'Dame' },
  { p: 'r', w: '♖', b: '♜', name: 'Turm' },
  { p: 'b', w: '♗', b: '♝', name: 'Läufer' },
  { p: 'n', w: '♘', b: '♞', name: 'Springer' },
]

const colorOfPiece = (pieceType: string): Color => (pieceType[0] === 'w' ? 'w' : 'b')

export function Board(props: Props) {
  const { fen, orientation, lastMove, checkSquare, canMove, legalTargets, needsPromotion, onMove } = props
  const arrows = props.arrows ?? []
  const hintSquares = props.hintSquares ?? []
  const [selected, setSelected] = useState<Square | null>(null)
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)

  const targets = useMemo(() => (selected ? legalTargets(selected) : []), [selected, legalTargets])

  const attempt = (from: Square, to: Square): boolean => {
    if (needsPromotion(from, to)) {
      if (!legalTargets(from).includes(to)) return false
      setPromo({ from, to })
      setSelected(null)
      return true
    }
    const ok = onMove(from, to)
    setSelected(null)
    return ok
  }

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!targetSquare || !canMove) return false
    return attempt(sourceSquare as Square, targetSquare as Square)
  }

  const onSquareClick = ({ square, piece }: SquareHandlerArgs) => {
    if (!canMove) return
    const sq = square as Square
    if (selected && targets.includes(sq)) {
      attempt(selected, sq)
      return
    }
    if (piece && colorOfPiece(piece.pieceType) === orientationTurn(fen)) {
      setSelected(sq === selected ? null : sq)
    } else {
      setSelected(null)
    }
  }

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = { background: 'var(--last-move)' }
    squareStyles[lastMove.to] = { background: 'var(--last-move)' }
  }
  if (checkSquare) {
    squareStyles[checkSquare] = {
      background: 'radial-gradient(circle, rgba(255,60,60,.95) 0%, rgba(255,60,60,.45) 45%, transparent 75%)',
    }
  }
  for (const h of hintSquares) {
    squareStyles[h] = { ...squareStyles[h], boxShadow: 'inset 0 0 0 4px rgba(80, 200, 120, 0.9)' }
  }
  if (selected) squareStyles[selected] = { ...squareStyles[selected], boxShadow: 'inset 0 0 0 4px var(--accent)' }
  for (const t of targets) {
    squareStyles[t] = {
      ...squareStyles[t],
      backgroundImage: 'radial-gradient(circle, rgba(20,20,20,.35) 22%, transparent 24%)',
    }
  }

  const turn = orientationTurn(fen)

  return (
    <div className="board-wrap">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation === 'w' ? 'white' : 'black',
          onPieceDrop,
          onSquareClick,
          canDragPiece: ({ piece }) => canMove && colorOfPiece(piece.pieceType) === turn,
          squareStyles,
          arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color })),
          allowDrawingArrows: true,
          animationDurationInMs: 220,
          darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
          lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
          boardStyle: { borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.45)' },
        }}
      />
      {promo && (
        <div className="promo-overlay" onClick={() => setPromo(null)}>
          <div className="promo-box" onClick={(e) => e.stopPropagation()}>
            <span>Umwandeln in:</span>
            <div className="promo-choices">
              {PROMO_PIECES.map((x) => (
                <button
                  key={x.p}
                  title={x.name}
                  onClick={() => {
                    onMove(promo.from, promo.to, x.p)
                    setPromo(null)
                  }}
                >
                  {turn === 'w' ? x.w : x.b}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Wer laut FEN am Zug ist. */
function orientationTurn(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}
