import type { Color } from 'chess.js'
import type { Score } from '../engine/uci'
import { MOTIF_INFO } from '../profile/motifInfo'
import { CATEGORY_INFO, isBad } from './classify'
import { forColor, formatEval, winPercent } from './eval'
import type { MoveAnalysis } from './explain'

/**
 * Bewertungsverlauf (Sicht Weiss): Index 0 = Startstellung, i+1 = nach Halbzug i.
 * Analysiert werden nur die Züge des Spielers; deren Stellung davor/danach deckt aber
 * auch die gegnerischen Züge ab. Lücken bleiben null.
 */
export function evalSeries(plies: number, analyses: Record<number, MoveAnalysis>): (Score | null)[] {
  const out: (Score | null)[] = Array.from({ length: plies + 1 }, () => null)
  for (const a of Object.values(analyses)) {
    if (a.ply < 0 || a.ply >= plies) continue
    out[a.ply] = a.scoreBefore
    out[a.ply + 1] = a.scoreAfter
  }
  return out
}

/** Gewinnchance für Weiss 0–100 (null bleibt null). */
export const whiteWin = (s: Score | null) => (s ? winPercent(s) : null)

export type KeyMoment = {
  ply: number
  san: string
  color: Color
  /** Änderung der Gewinnchance aus Sicht des Spielers (Prozentpunkte, negativ = schlecht für dich). */
  swing: number
  text: string
}

const firstSentence = (t: string) => t.split(/(?<=[.!?])\s/)[0]

/**
 * Die grössten Umschwünge der Partie (Standard: 3, mind. 8 Prozentpunkte), chronologisch,
 * je mit einer Zeile Erklärung.
 */
export function keyMoments(
  moves: { san: string; color: Color }[],
  analyses: Record<number, MoveAnalysis>,
  player: Color,
  count = 3,
  minSwing = 8,
): KeyMoment[] {
  const series = evalSeries(moves.length, analyses)
  const cands: KeyMoment[] = []
  for (let i = 0; i < moves.length; i++) {
    const a = series[i]
    const b = series[i + 1]
    if (!a || !b) continue
    const swing = winPercent(forColor(b, player)) - winPercent(forColor(a, player))
    if (Math.abs(swing) < minSwing) continue
    const m = moves[i]
    cands.push({ ply: i, san: m.san, color: m.color, swing, text: momentText(i, m.color === player, swing, analyses, a, b) })
  }
  return cands
    .sort((x, y) => Math.abs(y.swing) - Math.abs(x.swing))
    .slice(0, count)
    .sort((x, y) => x.ply - y.ply)
}

function momentText(ply: number, mine: boolean, swing: number, analyses: Record<number, MoveAnalysis>, a: Score, b: Score): string {
  const evals = `(${formatEval(a)} → ${formatEval(b)})`
  if (mine) {
    const an = analyses[ply]
    if (!an) return `Die Bewertung kippt ${evals}.`
    if (!isBad(an.category)) return `${CATEGORY_INFO[an.category].label} – die Stellung verbessert sich deutlich ${evals}.`
    const label = an.motif ? MOTIF_INFO[an.motif].label : CATEGORY_INFO[an.category].label
    const first = firstSentence(an.text)
    const hint = an.bestSan && an.bestSan !== an.san && !first.includes(an.bestSan) ? ` Besser: ${an.bestSan}.` : ''
    return `${CATEGORY_INFO[an.category].label} (${label}): ${first}${hint} ${evals}`
  }
  if (swing > 0) {
    const next = analyses[ply + 1]
    if (!next) return `Fehler des Gegners ${evals}.`
    if (isBad(next.category) && next.bestSan) return `Fehler des Gegners ${evals} – mit ${next.bestSan} hättest du ihn bestrafen können, ${next.san} hat die Chance vergeben.`
    return `Fehler des Gegners ${evals} – ${next.san} hat die Chance genutzt.`
  }
  return `Starker Zug des Gegners ${evals} – die Gefahr war vorher schon da und wurde jetzt sichtbar.`
}

/** Stützpunkte Genauigkeit → grobe Elo-Schätzung (eigene Faustregel, keine offizielle Formel). */
const RATING_TABLE: [number, number][] = [
  [0, 400],
  [40, 600],
  [55, 800],
  [65, 1000],
  [72, 1200],
  [78, 1400],
  [83, 1600],
  [87, 1800],
  [91, 2000],
  [94, 2200],
  [96.5, 2450],
  [100, 2800],
]

/**
 * Geschätzte Turnierleistung („Performance“) aus der Genauigkeit einer Partie.
 * Sehr grob: eine einzelne Partie schwankt stark. null, wenn zu wenig eigene Züge (ohne Buchzüge).
 */
export function estimatePerformance(accuracy: number, ownMoves: number): number | null {
  if (ownMoves < 8 || !Number.isFinite(accuracy)) return null
  const acc = Math.max(0, Math.min(100, accuracy))
  for (let i = 1; i < RATING_TABLE.length; i++) {
    const [a1, r1] = RATING_TABLE[i - 1]
    const [a2, r2] = RATING_TABLE[i]
    if (acc <= a2) return Math.round((r1 + ((acc - a1) / (a2 - a1)) * (r2 - r1)) / 50) * 50
  }
  return RATING_TABLE[RATING_TABLE.length - 1][1]
}
