import type { Color } from 'chess.js'
import { emptyCounts, type Category } from '../analysis/classify'
import type { GamePhase, MoveAnalysis, Motif } from '../analysis/explain'
import { openingFamily, openingFromPgn, type OpeningBook } from '../analysis/openings'
import type { GameResult } from '../game/status'

export type MistakeRecord = {
  date: number
  fen: string
  playedSan: string
  bestUci: string | null
  bestSan: string | null
  motif: Motif
  category: Category
  phase: GamePhase
}

export type GameRecord = {
  id: string
  date: number
  playerColor: Color
  level: number
  result: GameResult
  reason: string
  /** 'win' | 'draw' | 'loss' aus Sicht des Spielers */
  outcome: 'win' | 'draw' | 'loss'
  plies: number
  accuracy: number
  counts: Record<Category, number>
  pgn: string
  /** Tiefste erkannte Eröffnung, z. B. "C60 Spanische Partie" → nur der Name (optional, ältere Partien haben ihn nicht). */
  opening?: string
  eco?: string
}

export type Puzzle = {
  id: string
  fen: string
  bestUci: string
  bestSan: string
  motif: Motif
  explanation: string
  createdAt: number
  /** Leitner-Box 0–5: je höher, desto seltener wird gefragt. */
  box: number
  due: number
  attempts: number
  correct: number
}

export type Profile = {
  version: 1
  games: GameRecord[]
  mistakes: MistakeRecord[]
  puzzles: Puzzle[]
}

export const emptyProfile = (): Profile => ({ version: 1, games: [], mistakes: [], puzzles: [] })

const KEY = 'schach-trainer:profile'
const MAX_MISTAKES = 2000
const MAX_PUZZLES = 500

export function loadProfile(storage: Pick<Storage, 'getItem'> = localStorage): Profile {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return emptyProfile()
    const p = JSON.parse(raw) as Profile
    if (p?.version !== 1) return emptyProfile()
    // Ältere Profile: Zähler ohne 'book' ergänzen
    const games = (p.games ?? []).map((g) => ({ ...g, counts: { ...emptyCounts(), ...g.counts } }))
    return { ...emptyProfile(), ...p, games }
  } catch {
    return emptyProfile()
  }
}

export function saveProfile(p: Profile, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* Speicher voll oder blockiert – Profil bleibt nur für diese Sitzung */
  }
}

/** Genauigkeit eines Zugs (0–100) aus dem Verlust an Gewinnchance – Lichess-Formel. */
export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}

/**
 * Genauigkeit einer Partie: Mittel der Zug-Genauigkeiten. Buchzüge zählen NICHT mit
 * (Theorie auswendig spielen sagt wenig über die eigene Stärke). Bestand die Partie
 * nur aus Buchzügen, ist sie 100 %.
 */
export function gameAccuracy(analyses: MoveAnalysis[]): number {
  if (analyses.length === 0) return 0
  const own = analyses.filter((a) => a.category !== 'book')
  if (own.length === 0) return 100
  return own.reduce((s, a) => s + moveAccuracy(a.loss), 0) / own.length
}

const DAY = 24 * 60 * 60 * 1000
/** Abstand bis zur nächsten Wiederholung je Leitner-Box. */
export const BOX_INTERVALS = [0, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]
const RETRY_SOON = 10 * 60 * 1000

export type GameInput = {
  analyses: MoveAnalysis[]
  playerColor: Color
  level: number
  result: GameResult
  reason: string
  plies: number
  pgn: string
  /** Eröffnungsname; fehlt er, wird er (falls das Buch geladen ist) aus der PGN bestimmt. */
  opening?: string
  eco?: string
  now?: number
}

/** Fügt eine beendete Partie ins Profil ein: Statistik, Fehler, neue Puzzles. */
export function recordGame(p: Profile, g: GameInput): Profile {
  const now = g.now ?? Date.now()
  const counts = emptyCounts()
  for (const a of g.analyses) counts[a.category]++

  const won = (g.result === '1-0' && g.playerColor === 'w') || (g.result === '0-1' && g.playerColor === 'b')
  const game: GameRecord = {
    id: `${now}`,
    date: now,
    playerColor: g.playerColor,
    level: g.level,
    result: g.result,
    reason: g.reason,
    outcome: g.result === '1/2-1/2' ? 'draw' : won ? 'win' : 'loss',
    plies: g.plies,
    accuracy: Math.round(gameAccuracy(g.analyses) * 10) / 10,
    counts,
    pgn: g.pgn,
  }
  const op = g.opening ? { name: g.opening, eco: g.eco } : openingFromPgn(g.pgn)
  if (op) {
    game.opening = op.name
    if (op.eco) game.eco = op.eco
  }

  const bad = g.analyses.filter((a) => a.motif && (a.category === 'mistake' || a.category === 'blunder' || a.category === 'inaccuracy'))
  const mistakes: MistakeRecord[] = bad.map((a) => ({
    date: now,
    fen: a.fenBefore,
    playedSan: a.san,
    bestUci: a.bestUci,
    bestSan: a.bestSan,
    motif: a.motif!,
    category: a.category,
    phase: a.phase,
  }))

  const existing = new Set(p.puzzles.map((x) => x.id))
  const puzzles: Puzzle[] = []
  for (const a of bad) {
    if (a.category === 'inaccuracy' || !a.bestUci || !a.bestSan) continue
    const id = `${a.fenBefore}|${a.bestUci}`
    if (existing.has(id)) continue
    existing.add(id)
    puzzles.push({
      id,
      fen: a.fenBefore,
      bestUci: a.bestUci,
      bestSan: a.bestSan,
      motif: a.motif!,
      explanation: a.text,
      createdAt: now,
      box: 0,
      due: now,
      attempts: 0,
      correct: 0,
    })
  }

  return {
    ...p,
    games: [...p.games, game],
    mistakes: [...p.mistakes, ...mistakes].slice(-MAX_MISTAKES),
    puzzles: [...p.puzzles, ...puzzles].slice(-MAX_PUZZLES),
  }
}

/** Ergebnis eines Puzzle-Versuchs eintragen (Leitner-System). */
export function answerPuzzle(p: Profile, id: string, correct: boolean, now = Date.now()): Profile {
  return {
    ...p,
    puzzles: p.puzzles.map((z) => {
      if (z.id !== id) return z
      const box = correct ? Math.min(z.box + 1, BOX_INTERVALS.length - 1) : 0
      return {
        ...z,
        box,
        due: now + (correct ? BOX_INTERVALS[box] : RETRY_SOON),
        attempts: z.attempts + 1,
        correct: z.correct + (correct ? 1 : 0),
      }
    }),
  }
}

/** Fällige Puzzles, die am längsten überfälligen zuerst. */
export function duePuzzles(p: Profile, now = Date.now()): Puzzle[] {
  return p.puzzles.filter((z) => z.due <= now).sort((a, b) => a.due - b.due)
}

/**
 * Schwächen nach Motiv, gewichtet nach Schwere und Aktualität
 * (Fehler aus den letzten 20 Partien zählen voll, ältere halb).
 */
export function weaknesses(p: Profile): { motif: Motif; score: number; count: number }[] {
  const recentFrom = p.games.length > 20 ? p.games[p.games.length - 20].date : 0
  const weight: Record<Category, number> = { book: 0, best: 0, good: 0, inaccuracy: 0.5, mistake: 1, blunder: 2 }
  const by = new Map<Motif, { score: number; count: number }>()
  for (const m of p.mistakes) {
    const w = weight[m.category] * (m.date >= recentFrom ? 1 : 0.5)
    const e = by.get(m.motif) ?? { score: 0, count: 0 }
    by.set(m.motif, { score: e.score + w, count: e.count + 1 })
  }
  return [...by.entries()].map(([motif, v]) => ({ motif, ...v })).sort((a, b) => b.score - a.score)
}

export function mistakesByPhase(p: Profile): Record<GamePhase, number> {
  const out: Record<GamePhase, number> = { opening: 0, middlegame: 0, endgame: 0 }
  for (const m of p.mistakes) if (m.category !== 'inaccuracy') out[m.phase]++
  return out
}

export type OpeningStat = { family: string; games: number; score: number; accuracy: number; wins: number; draws: number; losses: number }

/** Eröffnungsname einer gespeicherten Partie (gespeichert oder nachträglich aus der PGN). */
export function gameOpening(g: GameRecord, book?: OpeningBook | null): string | null {
  return g.opening ?? openingFromPgn(g.pgn, book)?.name ?? null
}

/**
 * Statistik pro Eröffnungsfamilie (Teil vor dem Doppelpunkt): Partien, Punkte in %
 * (Sieg 1, Remis ½) und Ø-Genauigkeit. Sortiert nach Anzahl Partien.
 */
export function openingStats(p: Profile, book?: OpeningBook | null): OpeningStat[] {
  const by = new Map<string, { games: number; points: number; acc: number; wins: number; draws: number; losses: number }>()
  for (const g of p.games) {
    const name = gameOpening(g, book)
    if (!name) continue
    const fam = openingFamily(name)
    const e = by.get(fam) ?? { games: 0, points: 0, acc: 0, wins: 0, draws: 0, losses: 0 }
    e.games++
    e.acc += g.accuracy
    if (g.outcome === 'win') {
      e.wins++
      e.points += 1
    } else if (g.outcome === 'draw') {
      e.draws++
      e.points += 0.5
    } else e.losses++
    by.set(fam, e)
  }
  return [...by.entries()]
    .map(([family, e]) => ({ family, games: e.games, score: (e.points / e.games) * 100, accuracy: e.acc / e.games, wins: e.wins, draws: e.draws, losses: e.losses }))
    .sort((a, b) => b.games - a.games || b.score - a.score)
}
