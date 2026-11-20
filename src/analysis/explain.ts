import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import type { SearchResult } from '../engine/stockfish'
import type { Score } from '../engine/uci'
import { classify, isBad, type Category } from './classify'
import { forColor, toWhite, winPercent } from './eval'
import {
  isHanging,
  materialBalance,
  other,
  playLine,
  thePiece,
  thePieceAcc,
  VALUE,
  valuableTargets,
  yourPiece,
} from './pieces'

export type Motif =
  | 'missed_mate'
  | 'allowed_mate'
  | 'allowed_fork'
  | 'hung_moved_piece'
  | 'hung_piece'
  | 'lost_material'
  | 'missed_capture'
  | 'missed_fork'
  | 'missed_tactic'
  | 'positional'
  | 'early_queen'
  | 'knight_rim'
  | 'king_center'

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

export type Arrow = { from: string; to: string; color: string }

export type MoveAnalysis = {
  ply: number
  san: string
  uci: string
  color: Color
  fenBefore: string
  phase: GamePhase
  category: Category
  /** Verlust an Gewinnwahrscheinlichkeit in Prozentpunkten (Sicht des Spielers). */
  loss: number
  scoreBefore: Score // Sicht Weiss
  scoreAfter: Score // Sicht Weiss
  bestUci: string | null
  bestSan: string | null
  bestLineSan: string[]
  /** Hauptgrund (nur bei schlechten Zügen). */
  motif: Motif | null
  text: string
  tips: { motif: Motif; text: string }[]
  arrows: Arrow[]
}

export type MoveInput = {
  ply: number
  fenBefore: string
  fenAfter: string
  san: string
  from: string
  to: string
  promotion?: string
  piece: PieceSymbol
  color: Color
}

const GREEN = 'rgba(80, 200, 120, 0.85)'
const RED = 'rgba(255, 80, 80, 0.85)'

const sideName = (c: Color) => (c === 'w' ? 'Weiss' : 'Schwarz')
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const line = (san: string[]) => san.join(' ')

export function gamePhase(fen: string): GamePhase {
  const c = new Chess(fen)
  const fullmove = Number(fen.split(' ')[5] ?? 1)
  let heavy = 0
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') heavy += VALUE[p.type]
  if (heavy <= 26) return 'endgame'
  if (fullmove <= 10) return 'opening'
  return 'middlegame'
}

/**
 * Bewertung einer Stellung aus Sicht von Weiss. Bei Partieende (keine Engine-Varianten)
 * aus den Regeln abgeleitet.
 */
export function positionScore(fen: string, res: SearchResult): Score {
  const top = res.lines[0]
  const c = new Chess(fen)
  if (!top) {
    // Partie vorbei. Bei Matt gewinnt die Seite, die NICHT am Zug ist (als "Matt in 1" codiert,
    // damit das Vorzeichen erhalten bleibt). Patt = 0.
    if (c.isCheckmate()) return { type: 'mate', value: c.turn() === 'w' ? -1 : 1 }
    return { type: 'cp', value: 0 }
  }
  return toWhite(top.score, c.turn())
}

export function analyseMove(m: MoveInput, before: SearchResult, after: SearchResult): MoveAnalysis {
  const me = m.color
  const opp = other(me)
  const uci = m.from + m.to + (m.promotion ?? '')
  const scoreBefore = positionScore(m.fenBefore, before)
  const scoreAfter = positionScore(m.fenAfter, after)
  const myBefore = forColor(scoreBefore, me)
  const myAfter = forColor(scoreAfter, me)

  const bestLine = before.lines[0]
  const bestUci = bestLine?.pv[0] ?? before.bestmove
  const playedIsBest = bestUci === uci
  const loss = Math.max(0, winPercent(myBefore) - winPercent(myAfter))
  let category = classify(loss, playedIsBest)
  // Matt gesetzt ist immer bester Zug
  if (new Chess(m.fenAfter).isCheckmate()) category = 'best'

  const best = bestLine ? playLine(m.fenBefore, bestLine.pv, 6) : { san: [], chess: new Chess(m.fenBefore) }
  const bestSan = best.san[0] ?? null
  const reply = after.lines[0] ? playLine(m.fenAfter, after.lines[0].pv, 6) : { san: [], chess: new Chess(m.fenAfter) }

  const arrows: Arrow[] = []
  let motif: Motif | null = null
  let text = ''

  if (!isBad(category)) {
    text =
      category === 'best'
        ? pick(['Stark! Genau das hätte auch Stockfish gespielt.', 'Bester Zug – sauber gespielt!', 'Perfekt.'], m.ply)
        : bestSan && !playedIsBest
          ? `Guter Zug. Etwas genauer wäre ${bestSan} gewesen.`
          : 'Guter Zug.'
  } else {
    const found = findMotif(m, me, opp, myBefore, myAfter, bestLine?.pv ?? [], after.lines[0]?.pv ?? [], best, reply)
    motif = found.motif
    text = found.text
    if (bestUci && !playedIsBest) arrows.push({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), color: GREEN })
    const threat = after.lines[0]?.pv[0]
    if (threat) arrows.push({ from: threat.slice(0, 2), to: threat.slice(2, 4), color: RED })
  }

  return {
    ply: m.ply,
    san: m.san,
    uci,
    color: me,
    fenBefore: m.fenBefore,
    phase: gamePhase(m.fenBefore),
    category,
    loss,
    scoreBefore,
    scoreAfter,
    bestUci,
    bestSan,
    bestLineSan: best.san,
    motif,
    text,
    tips: openingTips(m, category),
    arrows,
  }
}

type Line = { san: string[]; chess: Chess }

function findMotif(
  m: MoveInput,
  me: Color,
  opp: Color,
  myBefore: Score,
  myAfter: Score,
  bestPv: string[],
  replyPv: string[],
  best: Line,
  reply: Line,
): { motif: Motif; text: string } {
  const bestSan = best.san[0]
  const better = bestSan ? ` Besser war ${bestSan}.` : ''

  // 1. Matt verpasst
  if (myBefore.type === 'mate' && myBefore.value > 0 && !(myAfter.type === 'mate' && myAfter.value > 0)) {
    const n = Math.round(myBefore.value)
    return {
      motif: 'missed_mate',
      text: `Du hattest ein Matt in ${n}! ${line(best.san.slice(0, n * 2 - 1))} – schau immer zuerst nach Schachgeboten.`,
    }
  }

  // 2. Matt zugelassen
  if (myAfter.type === 'mate' && myAfter.value < 0) {
    const n = Math.max(1, Math.round(-myAfter.value))
    return {
      motif: 'allowed_mate',
      text: `Achtung: Jetzt kann ${sideName(opp)} in ${n} ${plural(n, 'Zug', 'Zügen')} mattsetzen (${line(reply.san.slice(0, n * 2 - 1))}).${better}`,
    }
  }

  const afterMove = new Chess(m.fenAfter)
  const matNow = sign(me) * materialBalance(new Chess(m.fenBefore))
  const matAfterReply = sign(me) * materialBalance(reply.chess)
  const matAfterBest = sign(me) * materialBalance(best.chess)

  // 3. Gegner hat eine Gabel
  const threat = replyPv[0]
  if (threat) {
    const afterThreat = new Chess(m.fenAfter)
    try {
      const t = afterThreat.move({ from: threat.slice(0, 2), to: threat.slice(2, 4), promotion: threat[4] })
      const targets = valuableTargets(afterThreat, t.to)
      if (targets.length >= 2 && matAfterReply <= matNow - 2) {
        const names = targets.map((s) => `${pieceLabel(afterThreat, s)} auf ${s}`)
        return {
          motif: 'allowed_fork',
          text: `Gabel! Nach ${t.san} greift ${thePiece(t.piece)} ${names.join(' und ')} gleichzeitig an.${better}`,
        }
      }
    } catch {
      /* ignorieren */
    }
  }

  // 4. Material eingestellt
  if (matAfterReply <= matNow - 2) {
    const cap = firstCapture(m.fenAfter, replyPv, opp)
    if (cap) {
      if (cap.square === m.to) {
        return {
          motif: 'hung_moved_piece',
          text: `${cap1(yourPiece(cap.piece))} auf ${cap.square} kann geschlagen werden (${cap.san}).${better}`,
        }
      }
      if (isHanging(afterMove, cap.square as Square)) {
        return {
          motif: 'hung_piece',
          text: `Nach deinem Zug ist ${yourPiece(cap.piece)} auf ${cap.square} ungeschützt – ${cap.san} schlägt ihn.${better}`,
        }
      }
    }
    return {
      motif: 'lost_material',
      text: `Damit verlierst du Material: ${line(reply.san.slice(0, 4))}.${better}`,
    }
  }

  // 5. Gewinn verpasst
  if (bestPv[0] && matAfterBest >= matNow + 2 && matAfterReply < matAfterBest) {
    const before = new Chess(m.fenBefore)
    const target = before.get(bestPv[0].slice(2, 4) as Square)
    if (target && target.color === opp && isHanging(before, bestPv[0].slice(2, 4) as Square)) {
      return {
        motif: 'missed_capture',
        text: `${cap1(thePiece(target.type))} auf ${bestPv[0].slice(2, 4)} war ungedeckt – mit ${bestSan} hättest du ${target.type === 'q' ? 'sie' : 'ihn'} gewinnen können.`,
      }
    }
    const afterBest = new Chess(m.fenBefore)
    try {
      const bm = afterBest.move({ from: bestPv[0].slice(0, 2), to: bestPv[0].slice(2, 4), promotion: bestPv[0][4] })
      const targets = valuableTargets(afterBest, bm.to)
      if (targets.length >= 2) {
        const names = targets.map((s) => `${pieceLabel(afterBest, s)} auf ${s}`)
        return {
          motif: 'missed_fork',
          text: `Mit ${bestSan} hättest du eine Gabel gehabt: ${thePiece(bm.piece)} greift ${names.join(' und ')} an.`,
        }
      }
    } catch {
      /* ignorieren */
    }
    return {
      motif: 'missed_tactic',
      text: `Hier gab es eine Taktik: ${line(best.san.slice(0, 4))} gewinnt Material.`,
    }
  }

  // 6. Allgemein
  return {
    motif: 'positional',
    text: `Dieser Zug verschlechtert deine Stellung.${better}${best.san.length > 1 ? ` Idee: ${line(best.san.slice(0, 3))}` : ''}`,
  }
}

function openingTips(m: MoveInput, category: Category): { motif: Motif; text: string }[] {
  const tips: { motif: Motif; text: string }[] = []
  const fullmove = Number(m.fenBefore.split(' ')[5] ?? 1)
  if (fullmove > 12) return tips
  const isCapture = new Chess(m.fenBefore).get(m.to as Square) !== undefined

  if (m.piece === 'q' && fullmove <= 5 && !isCapture && category !== 'best') {
    tips.push({
      motif: 'early_queen',
      text: 'Tipp: Die Dame früh rauszubringen ist riskant – der Gegner kann sie mit Tempo angreifen. Entwickle zuerst Springer und Läufer.',
    })
  }
  if (m.piece === 'n' && (m.to[0] === 'a' || m.to[0] === 'h') && category !== 'best') {
    tips.push({
      motif: 'knight_rim',
      text: 'Tipp: „Springer am Rand bringt Kummer und Schand“ – am Rand kontrolliert er nur halb so viele Felder.',
    })
  }
  if (fullmove >= 9 && m.piece !== 'k') {
    const c = new Chess(m.fenAfter)
    const kingSq = c.findPiece({ type: 'k', color: m.color })[0]
    const home = m.color === 'w' ? 'e1' : 'e8'
    const rights = c.getCastlingRights(m.color)
    if (kingSq === home && (rights.k || rights.q) && fullmove % 3 === 0) {
      tips.push({
        motif: 'king_center',
        text: 'Tipp: Dein König steht noch in der Mitte. Eine Rochade bringt ihn in Sicherheit und aktiviert den Turm.',
      })
    }
  }
  return tips
}

function firstCapture(fen: string, pv: string[], by: Color) {
  const c = new Chess(fen)
  for (const u of pv.slice(0, 4)) {
    let mv
    try {
      mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      return null
    }
    if (mv.color === by && mv.captured) return { square: mv.to, piece: mv.captured, san: mv.san }
  }
  return null
}

function pieceLabel(c: Chess, sq: Square) {
  const p = c.get(sq)
  return p ? thePieceAcc(p.type) : sq
}

const sign = (c: Color) => (c === 'w' ? 1 : -1)
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1)
const pick = (opts: string[], seed: number) => opts[seed % opts.length]
