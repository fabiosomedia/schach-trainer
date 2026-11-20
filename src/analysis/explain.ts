import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import type { SearchResult } from '../engine/stockfish'
import type { Score } from '../engine/uci'
import { classify, isBad, type Category } from './classify'
import { forColor, toWhite, winPercent } from './eval'
import { backRankMate, detectTactic, type Tactic } from './motifs'
import type { OpeningBook } from './openings'
import {
  isHanging,
  materialBalance,
  other,
  playLine,
  thePiece,
  thePieceAcc,
  VALUE,
  yourPiece,
  yourPieceAcc,
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
  | 'allowed_pin'
  | 'missed_pin'
  | 'allowed_skewer'
  | 'missed_skewer'
  | 'allowed_discovered'
  | 'missed_discovered'
  | 'allowed_back_rank'
  | 'missed_back_rank'
  | 'allowed_double_attack'
  | 'missed_double_attack'
  | 'trapped_piece'
  | 'missed_trapped_piece'
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

export type AnalyseOptions = {
  /** Eröffnungsbuch: Züge, die im Buch bleiben, werden zu „Buchzug“ (ausser Fehler/Patzer). */
  book?: OpeningBook | null
}

export function analyseMove(m: MoveInput, before: SearchResult, after: SearchResult, opts: AnalyseOptions = {}): MoveAnalysis {
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
  // Buchzug: bleibt in der Theorie. Fehler und Patzer werden trotzdem als solche gezeigt
  // (die Lichess-Liste enthält auch zweifelhafte Gambits) – lieber ehrlich als „Buch“.
  if (opts.book && category !== 'mistake' && category !== 'blunder' && opts.book.has(m.fenAfter)) category = 'book'

  const best = bestLine ? playLine(m.fenBefore, bestLine.pv, 6) : { san: [], chess: new Chess(m.fenBefore) }
  const bestSan = best.san[0] ?? null
  const reply = after.lines[0] ? playLine(m.fenAfter, after.lines[0].pv, 6) : { san: [], chess: new Chess(m.fenAfter) }

  const arrows: Arrow[] = []
  let motif: Motif | null = null
  let text = ''

  if (category === 'book') {
    const o = opts.book!.at(m.fenAfter)
    text = `Buchzug – bekannte Eröffnungstheorie${o ? ` (${o.eco} ${o.name})` : ''}.`
  } else if (!isBad(category)) {
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
    tips: category === 'book' ? [] : openingTips(m, category),
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
    const br = backRankMate(m.fenBefore, bestPv, n * 2 - 1)
    if (br)
      return {
        motif: 'missed_back_rank',
        text: `Grundreihenmatt verpasst! Der König auf ${br.kingSq} steht hinter den eigenen Bauern eingesperrt: ${line(br.san)}.`,
      }
    return {
      motif: 'missed_mate',
      text: `Du hattest ein Matt in ${n}! ${line(best.san.slice(0, n * 2 - 1))} – schau immer zuerst nach Schachgeboten.`,
    }
  }

  // 2. Matt zugelassen
  if (myAfter.type === 'mate' && myAfter.value < 0) {
    const n = Math.max(1, Math.round(-myAfter.value))
    const br = backRankMate(m.fenAfter, replyPv, n * 2 - 1)
    if (br)
      return {
        motif: 'allowed_back_rank',
        text: `Grundreihenschwäche! Dein König auf ${br.kingSq} ist hinter den eigenen Bauern eingesperrt – ${line(br.san)} setzt matt.${better} Ein „Luftloch“ (ein Bauernzug vor dem König) hätte geholfen.`,
      }
    return {
      motif: 'allowed_mate',
      text: `Achtung: Jetzt kann ${sideName(opp)} in ${n} ${plural(n, 'Zug', 'Zügen')} mattsetzen (${line(reply.san.slice(0, n * 2 - 1))}).${better}`,
    }
  }

  const afterMove = new Chess(m.fenAfter)
  const matNow = sign(me) * materialBalance(new Chess(m.fenBefore))
  const matAfterReply = sign(me) * materialBalance(reply.chess)
  const matAfterBest = sign(me) * materialBalance(best.chess)

  // 3. Gegnerische Taktik (nur wenn die Engine-Variante wirklich Material gewinnt)
  if (matAfterReply <= matNow - 2) {
    const threat = replyPv[0]
    const t = threat ? detectTactic(m.fenAfter, replyPv) : null
    // Schlägt die Antwort einfach eine hängende Figur, ist das die klarere Erklärung
    const tSq = threat?.slice(2, 4) as Square | undefined
    const victim = tSq ? afterMove.get(tSq) : undefined
    const simpleCapture = !!victim && victim.color === me && isHanging(afterMove, tSq!)
    if (t && (strong(t) || !simpleCapture)) return { motif: ALLOWED[t.kind], text: allowedText(t) + better }

    // 4. Material eingestellt
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
          text: `Nach deinem Zug ist ${yourPiece(cap.piece)} auf ${cap.square} ungeschützt – ${cap.san} schlägt ${cap.piece === 'q' ? 'sie' : 'ihn'}.${better}`,
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
    const bSq = bestPv[0].slice(2, 4) as Square
    const target = before.get(bSq)
    const t = detectTactic(m.fenBefore, bestPv)
    if (target && target.color === opp && isHanging(before, bSq) && !(t && strong(t))) {
      return {
        motif: 'missed_capture',
        text: `${cap1(thePiece(target.type))} auf ${bSq} war ungedeckt – mit ${bestSan} hättest du ${target.type === 'q' ? 'sie' : 'ihn'} gewinnen können.`,
      }
    }
    if (t) return { motif: MISSED[t.kind], text: missedText(t) }
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

const ALLOWED: Record<Tactic['kind'], Motif> = {
  fork: 'allowed_fork',
  double_attack: 'allowed_double_attack',
  pin: 'allowed_pin',
  skewer: 'allowed_skewer',
  discovered: 'allowed_discovered',
  trapped: 'trapped_piece',
}
const MISSED: Record<Tactic['kind'], Motif> = {
  fork: 'missed_fork',
  double_attack: 'missed_double_attack',
  pin: 'missed_pin',
  skewer: 'missed_skewer',
  discovered: 'missed_discovered',
  trapped: 'missed_trapped_piece',
}
/** Taktiken, die auch dann die bessere Erklärung sind, wenn der erste Zug schon etwas schlägt. */
const strong = (t: Tactic) => t.kind === 'fork' || t.kind === 'double_attack' || (t.kind === 'discovered' && t.check)

/** "er" / "sie" für eine Figur. */
const pron = (p: PieceSymbol) => (p === 'q' ? 'sie' : 'er')
const listOf = (fmt: (p: PieceSymbol) => string, ts: { type: PieceSymbol; sq: Square }[]) =>
  ts.map((x) => `${fmt(x.type)} auf ${x.sq}`).join(' und ')

/** Erklärung, wenn der Gegner die Taktik gegen dich hat. */
export function allowedText(t: Tactic): string {
  switch (t.kind) {
    case 'fork':
      return `Gabel! Nach ${t.san} greift ${thePiece(t.piece)} ${listOf(yourPieceAcc, t.targets)} gleichzeitig an.`
    case 'double_attack':
      return `Doppelangriff der Dame! Nach ${t.san} greift sie ${listOf(yourPieceAcc, t.targets)} gleichzeitig an.`
    case 'pin': {
      const to = yourPieceAcc(t.behind)
      return t.exploit
        ? `${t.san} greift ${yourPieceAcc(t.pinned)} auf ${t.pinnedSq} an – ${pron(t.pinned)} ist an ${to} gefesselt und kann nicht ausweichen.`
        : `Fesselung! Nach ${t.san} ist ${yourPiece(t.pinned)} auf ${t.pinnedSq} an ${to} gefesselt${t.behind === 'k' ? ' und darf nicht mehr ziehen' : ` – zieht ${pron(t.pinned)} weg, fällt ${yourPiece(t.behind)}`}.`
    }
    case 'skewer':
      return `Spiess! ${t.san} greift ${yourPieceAcc(t.front)} an – weicht ${pron(t.front)} aus, fällt ${yourPiece(t.back)} auf ${t.backSq} dahinter.`
    case 'discovered':
      return t.check
        ? `${t.double ? 'Doppelschach' : 'Abzugsschach'}! ${t.san} öffnet die Linie für ${thePieceAcc(t.line)} auf ${t.lineSq}, der jetzt Schach gibt – ${thePiece(t.mover)} zieht dabei mit Tempo.`
        : `Abzugsangriff! ${t.san} öffnet die Linie: ${thePiece(t.line)} auf ${t.lineSq} greift jetzt ${yourPieceAcc(t.target)} auf ${t.targetSq} an.`
    case 'trapped':
      return `${cap1(yourPiece(t.piece))} auf ${t.sq} ist eingesperrt: Nach ${t.san} wird ${pron(t.piece)} angegriffen und hat kein sicheres Feld mehr.`
  }
}

/** Erklärung, wenn du die Taktik verpasst hast. */
export function missedText(t: Tactic): string {
  switch (t.kind) {
    case 'fork':
      return `Mit ${t.san} hättest du eine Gabel gehabt: ${thePiece(t.piece)} greift ${listOf(thePieceAcc, t.targets)} an.`
    case 'double_attack':
      return `Mit ${t.san} hätte deine Dame ${listOf(thePieceAcc, t.targets)} gleichzeitig angegriffen (Doppelangriff).`
    case 'pin': {
      const to = thePieceAcc(t.behind)
      return t.exploit
        ? `${t.san} hätte ${thePieceAcc(t.pinned)} auf ${t.pinnedSq} angegriffen – ${pron(t.pinned)} ist an ${to} gefesselt und kann nicht ausweichen.`
        : `Fesselung verpasst: Mit ${t.san} hättest du ${thePieceAcc(t.pinned)} auf ${t.pinnedSq} an ${to} gefesselt – das gewinnt Material.`
    }
    case 'skewer':
      return `Spiess verpasst: ${t.san} greift ${thePieceAcc(t.front)} an, und dahinter steht ${thePiece(t.back)} auf ${t.backSq}.`
    case 'discovered':
      return t.check
        ? `${t.double ? 'Doppelschach' : 'Abzugsschach'} verpasst: ${t.san} öffnet die Linie für ${thePieceAcc(t.line)} auf ${t.lineSq} – mit Schach, und ${thePiece(t.mover)} zieht mit Tempo.`
        : `Abzugsangriff verpasst: Nach ${t.san} hätte ${thePiece(t.line)} auf ${t.lineSq} ${thePieceAcc(t.target)} auf ${t.targetSq} angegriffen.`
    case 'trapped':
      return `${t.san} hätte ${thePieceAcc(t.piece)} auf ${t.sq} eingesperrt – ${pron(t.piece)} hat kein sicheres Feld mehr.`
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

const sign = (c: Color) => (c === 'w' ? 1 : -1)
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1)
const pick = (opts: string[], seed: number) => opts[seed % opts.length]
