export type Category = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export const CATEGORY_INFO: Record<Category, { label: string; symbol: string; color: string }> = {
  best: { label: 'Bester Zug', symbol: '★', color: '#2f7d3f' },
  good: { label: 'Guter Zug', symbol: '✓', color: '#5e8a24' },
  inaccuracy: { label: 'Ungenau', symbol: '?!', color: '#b07c00' },
  mistake: { label: 'Fehler', symbol: '?', color: '#c25a12' },
  blunder: { label: 'Patzer', symbol: '??', color: '#a3221c' },
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
