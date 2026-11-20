export type Category = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export const CATEGORY_INFO: Record<Category, { label: string; symbol: string; color: string }> = {
  best: { label: 'Bester Zug', symbol: '★', color: '#5fd38a' },
  good: { label: 'Guter Zug', symbol: '✓', color: '#9fd36a' },
  inaccuracy: { label: 'Ungenau', symbol: '?!', color: '#f0c43a' },
  mistake: { label: 'Fehler', symbol: '?', color: '#f08a3a' },
  blunder: { label: 'Patzer', symbol: '??', color: '#ff5c5c' },
}

/**
 * Einstufung anhand des Verlusts an Gewinnwahrscheinlichkeit (Prozentpunkte,
 * aus Sicht des Spielers). Schwellen angelehnt an Lichess.
 */
export function classify(lossPercent: number, playedIsBest: boolean): Category {
  if (playedIsBest || lossPercent < 2) return playedIsBest ? 'best' : 'good'
  // Lichess: Δ winningChances (−1..1) ≥ 0.1 / 0.2 / 0.3 → hier in Prozentpunkten 5 / 10 / 15
  if (lossPercent < 5) return 'good'
  if (lossPercent < 10) return 'inaccuracy'
  if (lossPercent < 15) return 'mistake'
  return 'blunder'
}

export const isBad = (c: Category) => c === 'inaccuracy' || c === 'mistake' || c === 'blunder'
