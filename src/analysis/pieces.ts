import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

const NAME: Record<PieceSymbol, string> = {
  p: 'Bauer',
  n: 'Springer',
  b: 'Läufer',
  r: 'Turm',
  q: 'Dame',
  k: 'König',
}

export const pieceName = (p: PieceSymbol) => NAME[p]

/** "dein Springer" / "deine Dame" (Nominativ). */
export const yourPiece = (p: PieceSymbol) => (p === 'q' ? 'deine Dame' : `dein ${NAME[p]}`)
/** "deinen Springer" / "deine Dame" (Akkusativ). */
export const yourPieceAcc = (p: PieceSymbol) => (p === 'q' ? 'deine Dame' : `deinen ${NAME[p]}`)
/** "der Springer" / "die Dame". */
export const thePiece = (p: PieceSymbol) => (p === 'q' ? 'die Dame' : `der ${NAME[p]}`)
/** "den Springer" / "die Dame". */
export const thePieceAcc = (p: PieceSymbol) => (p === 'q' ? 'die Dame' : `den ${NAME[p]}`)

/** Materialbilanz aus Sicht von Weiss (ohne Könige). */
export function materialBalance(chess: Chess): number {
  let sum = 0
  for (const row of chess.board())
    for (const p of row) if (p && p.type !== 'k') sum += (p.color === 'w' ? 1 : -1) * VALUE[p.type]
  return sum
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/**
 * Ist die Figur auf `sq` "hängend"? D. h. vom Gegner angegriffen und entweder
 * gar nicht gedeckt oder von einer billigeren Figur angegriffen.
 */
export function isHanging(chess: Chess, sq: Square): boolean {
  const piece = chess.get(sq)
  if (!piece || piece.type === 'k') return false
  const enemy = other(piece.color)
  const attackers = chess.attackers(sq, enemy)
  if (attackers.length === 0) return false
  const defenders = chess.attackers(sq, piece.color)
  if (defenders.length === 0) return true
  const cheapest = Math.min(...attackers.map((a) => VALUE[chess.get(a)!.type]))
  return cheapest < VALUE[piece.type]
}

/**
 * Welche gegnerischen Figuren greift die Figur auf `from` an, die sich lohnen?
 * (König, höherwertige oder ungedeckte Figuren.) Für Gabel-Erkennung.
 */
export function valuableTargets(chess: Chess, from: Square): Square[] {
  const attacker = chess.get(from)
  if (!attacker) return []
  const enemy = other(attacker.color)
  const out: Square[] = []
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== enemy) continue
      if (!chess.attackers(p.square, attacker.color).includes(from)) continue
      const defended = chess.attackers(p.square, enemy).length > 0
      if (p.type === 'k' || VALUE[p.type] > VALUE[attacker.type] || (!defended && p.type !== 'p')) out.push(p.square)
    }
  }
  return out
}

/** Spielt eine UCI-Zugfolge auf einer Kopie und liefert SAN-Liste + Endstellung. */
export function playLine(fen: string, uciMoves: string[], maxPlies = uciMoves.length) {
  const c = new Chess(fen)
  const san: string[] = []
  for (const u of uciMoves.slice(0, maxPlies)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      san.push(m.san)
    } catch {
      break
    }
  }
  return { san, chess: c }
}
