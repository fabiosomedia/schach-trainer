// Geschlagene Figuren und Materialvorteil für die Spielerleisten – reine Logik.
import type { Chess, Color, PieceSymbol } from 'chess.js'

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p']

const GLYPH: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
}

export const pieceGlyph = (color: Color, type: PieceSymbol) => GLYPH[color][type]

/**
 * Welche Figuren hat jede Seite geschlagen? `w` = von Weiss geschlagene (schwarze) Figuren.
 * Aus der Zugliste, damit es auch bei Startstellungen ohne volle Figurenzahl stimmt.
 * Sortiert: Dame, Türme, Läufer, Springer, Bauern.
 */
export function capturedBy(moves: { color: Color; captured?: PieceSymbol }[]): Record<Color, PieceSymbol[]> {
  const res: Record<Color, PieceSymbol[]> = { w: [], b: [] }
  for (const m of moves) if (m.captured) res[m.color].push(m.captured)
  for (const c of ['w', 'b'] as const) res[c].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return res
}

/** Materialbilanz auf dem Brett aus Sicht von Weiss (B=1, S/L=3, T=5, D=9). */
export function materialDiff(chess: Pick<Chess, 'board'>): number {
  let sum = 0
  for (const row of chess.board()) for (const p of row) if (p) sum += (p.color === 'w' ? 1 : -1) * VALUE[p.type]
  return sum
}
