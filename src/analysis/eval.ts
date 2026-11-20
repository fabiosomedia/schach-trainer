import type { Color } from 'chess.js'
import type { Score } from '../engine/uci'

/** Engine-Score (Sicht der Seite am Zug) → Score aus Sicht von Weiss. */
export function toWhite(score: Score, sideToMove: Color): Score {
  return sideToMove === 'w' ? score : { type: score.type, value: -score.value }
}

/** Score aus Sicht von Weiss → Sicht der angegebenen Farbe. */
export function forColor(whiteScore: Score, color: Color): Score {
  return color === 'w' ? whiteScore : { type: whiteScore.type, value: -whiteScore.value }
}

/**
 * Gewinnwahrscheinlichkeit 0–100 für die Seite, aus deren Sicht der Score ist.
 * Formel wie bei Lichess: flacht bei grossen Vorteilen ab, sodass +900 → +1000
 * kaum zählt, 0 → +100 aber schon.
 */
export function winPercent(score: Score): number {
  if (score.type === 'mate') {
    if (score.value > 0) return 100
    if (score.value < 0) return 0
    return 0 // "mate 0": Seite am Zug ist matt
  }
  const cp = Math.max(-1000, Math.min(1000, score.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Lesbare Bewertung aus Sicht von Weiss: "+1.3", "−0.4", "#3", "#-2". */
export function formatEval(whiteScore: Score): string {
  if (whiteScore.type === 'mate') return whiteScore.value >= 0 ? `#${whiteScore.value}` : `#-${-whiteScore.value}`
  const v = whiteScore.value / 100
  const s = Math.abs(v).toFixed(1)
  return v > 0.05 ? `+${s}` : v < -0.05 ? `−${s}` : '0.0'
}
