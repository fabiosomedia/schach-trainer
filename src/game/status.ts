import type { Chess, Color, Square } from 'chess.js'

export type GameResult = '1-0' | '0-1' | '1/2-1/2'

export type GameStatus = {
  over: boolean
  result?: GameResult
  reason?: string
}

const winFor = (c: Color): GameResult => (c === 'w' ? '1-0' : '0-1')
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** Ermittelt, ob und wie die Partie zu Ende ist. */
export function computeStatus(chess: Chess, resigned: Color | null = null): GameStatus {
  if (resigned) return { over: true, result: winFor(other(resigned)), reason: 'Aufgabe' }
  if (chess.isCheckmate()) return { over: true, result: winFor(other(chess.turn())), reason: 'Schachmatt' }
  if (chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'Patt' }
  if (chess.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'Zu wenig Material' }
  if (chess.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'Dreifache Stellungswiederholung' }
  if (chess.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', reason: '50-Züge-Regel' }
  return { over: false }
}

/** Feld des Königs, der gerade im Schach steht (oder null). */
export function checkedKingSquare(chess: Chess): Square | null {
  if (!chess.inCheck()) return null
  const turn = chess.turn()
  for (const row of chess.board()) {
    for (const p of row) {
      if (p && p.type === 'k' && p.color === turn) return p.square
    }
  }
  return null
}
