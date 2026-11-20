import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { isHanging, other, valuableTargets, VALUE } from './pieces'

/**
 * Geometrische Taktik-Erkennung. Alle Funktionen bekommen eine Stellung und die
 * Engine-Variante (UCI) der Seite am Zug. Ein Motiv wird nur gemeldet, wenn die
 * Geometrie passt UND die Variante das betroffene Material tatsächlich gewinnt –
 * sonst lieber gar nichts (dann greift die allgemeine Erklärung).
 */
export type Tactic =
  | { kind: 'fork' | 'double_attack'; san: string; piece: PieceSymbol; to: Square; targets: { sq: Square; type: PieceSymbol }[] }
  | { kind: 'pin'; san: string; pinner: PieceSymbol; pinnerSq: Square; pinned: PieceSymbol; pinnedSq: Square; behind: PieceSymbol; behindSq: Square; exploit: boolean }
  | { kind: 'skewer'; san: string; piece: PieceSymbol; front: PieceSymbol; frontSq: Square; back: PieceSymbol; backSq: Square }
  | { kind: 'discovered'; san: string; check: boolean; double: boolean; mover: PieceSymbol; line: PieceSymbol; lineSq: Square; target: PieceSymbol; targetSq: Square }
  | { kind: 'trapped'; san: string; piece: PieceSymbol; sq: Square }

export type BackRankMate = { kingSq: Square; san: string[] }

type Dir = [number, number]
const ORTHO: Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAG: Dir[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const dirsOf = (p: PieceSymbol): Dir[] => (p === 'r' ? ORTHO : p === 'b' ? DIAG : p === 'q' ? [...ORTHO, ...DIAG] : [])

const fileOf = (s: Square) => s.charCodeAt(0) - 97
const rankOf = (s: Square) => Number(s[1]) - 1
const sq = (f: number, r: number): Square | null => (f < 0 || f > 7 || r < 0 || r > 7 ? null : (`${String.fromCharCode(97 + f)}${r + 1}` as Square))

/** Felder ab `from` (exklusiv) in Richtung `d` bis zum Rand. */
function* ray(from: Square, d: Dir): Generator<Square> {
  for (let f = fileOf(from) + d[0], r = rankOf(from) + d[1]; ; f += d[0], r += d[1]) {
    const s = sq(f, r)
    if (!s) return
    yield s
  }
}

/** Die ersten zwei Figuren auf einem Strahl. */
function firstTwo(c: Chess, from: Square, d: Dir) {
  const hits: { sq: Square; type: PieceSymbol; color: Color }[] = []
  for (const s of ray(from, d)) {
    const p = c.get(s)
    if (p) {
      hits.push({ sq: s, type: p.type, color: p.color })
      if (hits.length === 2) break
    }
  }
  return hits
}

type Gain = { sq: Square; type: PieceSymbol }

/** Schlagzüge der Seite `by` in den ersten `plies` Halbzügen der Variante. */
function gains(fen: string, pv: string[], by: Color, plies = 6): Gain[] {
  const c = new Chess(fen)
  const out: Gain[] = []
  for (const u of pv.slice(0, plies)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      if (m.color === by && m.captured) out.push({ sq: m.to, type: m.captured })
    } catch {
      break
    }
  }
  return out
}

function playFirst(fen: string, uci: string) {
  const c = new Chess(fen)
  try {
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return { c, m }
  } catch {
    return null
  }
}

/**
 * Findet eine Taktik im ersten Zug der Variante `pv` (gespielt von der Seite am Zug in `fen`).
 * Reihenfolge: Abzugsschach, Gabel/Doppelangriff, Spiess, Fesselung, Abzugsangriff, eingesperrte Figur.
 */
export function detectTactic(fen: string, pv: string[]): Tactic | null {
  if (!pv[0]) return null
  const played = playFirst(fen, pv[0])
  if (!played) return null
  const { c, m } = played
  const S = m.color
  const V = other(S)
  const won = gains(fen, pv, S)
  if (won.length === 0) return null
  const wonOn = (s: Square) => won.some((g) => g.sq === s)
  const wonValue = Math.max(...won.map((g) => VALUE[g.type]))

  const disc = discovered(new Chess(fen), c, m.from, m.to, S)
  if (disc && disc.check) return { kind: 'discovered', san: m.san, mover: m.piece, ...disc }

  const targets = valuableTargets(c, m.to)
  if (targets.length >= 2)
    return { kind: m.piece === 'q' ? 'double_attack' : 'fork', san: m.san, piece: m.piece, to: m.to, targets: targets.map((s) => ({ sq: s, type: c.get(s)!.type })) }

  // Spiess und Fesselung durch die gezogene Langschrittler-Figur
  for (const d of dirsOf(m.piece)) {
    const [a, b] = firstTwo(c, m.to, d)
    if (!a || !b || a.color !== V || b.color !== V) continue
    const frontForced = a.type === 'k' || VALUE[a.type] > VALUE[m.piece] || c.attackers(a.sq, V).length === 0
    if (a.type !== 'p' && b.type !== 'p' && b.type !== 'k' && (a.type === 'k' || VALUE[a.type] > VALUE[b.type]) && frontForced && wonOn(b.sq))
      return { kind: 'skewer', san: m.san, piece: m.piece, front: a.type, frontSq: a.sq, back: b.type, backSq: b.sq }
    if (a.type !== 'k' && a.type !== 'p' && (b.type === 'k' || VALUE[b.type] > VALUE[a.type]) && (wonOn(a.sq) || wonOn(b.sq)))
      return pinOf(m.san, m.piece, m.to, a, b, false)
  }

  // Bestehende Fesselung ausnutzen: die gezogene Figur greift eine gefesselte Figur an
  for (const p of c.board().flat()) {
    if (!p || p.color !== V || p.type === 'k' || p.type === 'p') continue
    if (!c.attackers(p.square, S).includes(m.to) || !wonOn(p.square)) continue
    if (VALUE[p.type] < VALUE[m.piece] && c.attackers(p.square, V).length > 0) continue
    const pin = pinnedBy(c, p.square, S)
    if (pin) return pinOf(m.san, pin.type, pin.sq, { sq: p.square, type: p.type }, pin.behind, true)
  }

  if (disc && wonValue >= 3) return { kind: 'discovered', san: m.san, mover: m.piece, ...disc }

  const trapped = trappedPiece(c, m.to, V)
  if (trapped && won.some((g) => g.type === trapped.type)) return { kind: 'trapped', san: m.san, piece: trapped.type, sq: trapped.sq }
  return null
}

function pinOf(san: string, pinner: PieceSymbol, pinnerSq: Square, a: { sq: Square; type: PieceSymbol }, b: { sq: Square; type: PieceSymbol }, exploit: boolean): Tactic {
  return { kind: 'pin', san, pinner, pinnerSq, pinned: a.type, pinnedSq: a.sq, behind: b.type, behindSq: b.sq, exploit }
}

/**
 * Ist die Figur auf `target` von einem Langschrittler der Farbe `by` gefesselt
 * (an den König oder eine wertvollere Figur)?
 */
export function pinnedBy(c: Chess, target: Square, by: Color) {
  const victim = c.get(target)
  if (!victim) return null
  for (const p of c.board().flat()) {
    if (!p || p.color !== by || !'brq'.includes(p.type)) continue
    for (const d of dirsOf(p.type)) {
      const [a, b] = firstTwo(c, p.square, d)
      if (a?.sq !== target || !b || b.color !== victim.color) continue
      if (b.type === 'k' || VALUE[b.type] > VALUE[victim.type]) return { sq: p.square, type: p.type, behind: { sq: b.sq, type: b.type } }
    }
  }
  return null
}

/** Öffnet der Zug von `from` eine Linie eines eigenen Langschrittlers auf eine lohnende Figur? */
function discovered(before: Chess, after: Chess, from: Square, to: Square, S: Color) {
  const V = other(S)
  const moverChecks = after.attackers(after.findPiece({ type: 'k', color: V })[0] ?? 'a1', S).includes(to)
  let best: { check: boolean; double: boolean; line: PieceSymbol; lineSq: Square; target: PieceSymbol; targetSq: Square } | null = null
  for (const p of after.board().flat()) {
    if (!p || p.color !== S || p.square === to || !'brq'.includes(p.type)) continue
    for (const d of dirsOf(p.type)) {
      let passed = false
      for (const s of ray(p.square, d)) {
        if (s === from) {
          passed = true
          continue
        }
        const q = after.get(s)
        if (!q) continue
        if (passed && q.color === V) {
          const wasHidden = !before.attackers(s, S).includes(p.square)
          const defended = after.attackers(s, V).length > 0
          const worth = q.type === 'k' || VALUE[q.type] > VALUE[p.type] || (!defended && q.type !== 'p')
          if (wasHidden && worth && (!best || q.type === 'k'))
            best = { check: q.type === 'k', double: q.type === 'k' && moverChecks, line: p.type, lineSq: p.square, target: q.type, targetSq: s }
        }
        break
      }
    }
  }
  return best
}

/**
 * Eingesperrte Figur: von einer billigeren Figur angegriffen (Decken hilft nicht)
 * und jedes Fluchtfeld ist ebenfalls unsicher. Nur wenn die Figur von `attackerSq` angegriffen wird.
 */
export function trappedPiece(c: Chess, attackerSq: Square, V: Color): { sq: Square; type: PieceSymbol } | null {
  if (c.turn() !== V || c.inCheck()) return null
  const S = other(V)
  for (const p of c.board().flat()) {
    if (!p || p.color !== V || !'nbrq'.includes(p.type)) continue
    const att = c.attackers(p.square, S)
    if (!att.includes(attackerSq)) continue
    const cheapest = Math.min(...att.map((a) => VALUE[c.get(a)!.type]))
    if (cheapest >= VALUE[p.type]) continue
    const escapes = c.moves({ square: p.square, verbose: true }).filter((mv) => {
      if (mv.captured && VALUE[mv.captured] >= VALUE[p.type] - 1) return true
      const c2 = new Chess(c.fen())
      c2.move(mv.san)
      return !isHanging(c2, mv.to)
    })
    if (escapes.length === 0) return { sq: p.square, type: p.type }
  }
  return null
}

/**
 * Grundreihenmatt: Die Variante endet im Matt durch Turm/Dame auf der Grundreihe des Königs,
 * und die Felder vor dem König sind durch eigene Figuren (mind. ein Bauer) verstellt oder bedroht.
 */
export function backRankMate(fen: string, pv: string[], maxPlies: number): BackRankMate | null {
  const c = new Chess(fen)
  const san: string[] = []
  let last
  for (const u of pv.slice(0, maxPlies)) {
    try {
      last = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      san.push(last.san)
    } catch {
      return null
    }
    if (c.isCheckmate()) break
  }
  if (!last || !c.isCheckmate() || (last.piece !== 'r' && last.piece !== 'q')) return null
  const M = c.turn()
  const kingSq = c.findPiece({ type: 'k', color: M })[0]
  const home = M === 'w' ? 0 : 7
  if (!kingSq || rankOf(kingSq) !== home || rankOf(last.to) !== home) return null
  const fwd = M === 'w' ? 1 : -1
  let ownPawn = false
  for (const df of [-1, 0, 1]) {
    const s = sq(fileOf(kingSq) + df, home + fwd)
    if (!s) continue
    const p = c.get(s)
    if (p && p.color === M) {
      if (p.type === 'p') ownPawn = true
    } else if (c.attackers(s, other(M)).length === 0) return null
  }
  return ownPawn ? { kingSq, san } : null
}
