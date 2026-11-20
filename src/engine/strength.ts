// Spielstärke-Stufen 1–10. Kombiniert Stockfishs "Skill Level" (0–20, wählt mit
// Absicht schwächere Züge) mit begrenzter Suchtiefe, damit tiefe Stufen auch
// wirklich menschlich-schwach spielen.

export type LevelConfig = {
  level: number
  label: string
  skill: number
  depth?: number
  movetime?: number
}

export const MIN_LEVEL = 1
export const MAX_LEVEL = 10

const TABLE: Omit<LevelConfig, 'level'>[] = [
  { label: 'Anfänger', skill: 0, depth: 1 },
  { label: 'Anfänger', skill: 1, depth: 2 },
  { label: 'Einsteiger', skill: 3, depth: 3 },
  { label: 'Einsteiger', skill: 5, depth: 4 },
  { label: 'Hobbyspieler', skill: 7, depth: 5 },
  { label: 'Hobbyspieler', skill: 9, depth: 6 },
  { label: 'Klubspieler', skill: 12, depth: 8 },
  { label: 'Klubspieler', skill: 15, depth: 10 },
  { label: 'Experte', skill: 18, depth: 12 },
  { label: 'Meister', skill: 20, movetime: 1000 },
]

export function levelConfig(level: number): LevelConfig {
  const l = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))
  return { level: l, ...TABLE[l - 1] }
}
