import { Chess, type Color } from 'chess.js'

/**
 * Taktik-Puzzles aus der Lichess-Puzzle-Datenbank (CC0) – reine Logik ohne React.
 *
 * Lichess-Format: Die FEN ist die Stellung VOR dem Zug des Gegners. Der erste Zug in
 * `moves` ist dieser Gegnerzug (wird automatisch gespielt), danach wechseln sich
 * Löser und Gegner ab. Der Löser ist die Seite, die nach dem ersten Zug am Zug ist.
 */
export const ATTRIBUTION = 'Puzzles: Lichess-Puzzle-Datenbank (CC0)'

export type LibPuzzle = {
  id: string
  fen: string
  moves: string[]
  rating: number
  themes: string[]
}

/** So liegt ein Puzzle in public/puzzles/rXXXX.json: [id, fen, zuege, wertung, themen]. */
export type RawPuzzle = [string, string, string, number, string]

export type BandInfo = { min: number; max: number; file: string; count: number; themes: Record<string, number> }
export type PuzzleIndex = { source: string; bandSize: number; bands: BandInfo[] }

export function parseBand(raw: RawPuzzle[]): LibPuzzle[] {
  return raw.map(([id, fen, moves, rating, themes]) => ({
    id,
    fen,
    moves: moves.split(' '),
    rating,
    themes: themes ? themes.split(' ') : [],
  }))
}

/** Die Seite, die das Puzzle löst (nach dem Gegnerzug am Zug). */
export function solverColor(p: Pick<LibPuzzle, 'fen'>): Color {
  return p.fen.split(' ')[1] === 'w' ? 'b' : 'w'
}

// ---------------------------------------------------------------- Lösung prüfen

export type Verdict = 'continue' | 'solved' | 'wrong'

/**
 * Prüft einen Zug des Lösers. `ply` ist der Index des erwarteten Zuges in `moves`
 * (1, 3, 5, …), `fenBefore` die Stellung vor dem Zug.
 * Jedes Matt zählt als Lösung – auch wenn die Datenbank ein anderes Matt vorsieht.
 */
export function judgeMove(p: Pick<LibPuzzle, 'moves'>, ply: number, fenBefore: string, uci: string): Verdict {
  const expected = p.moves[ply]
  if (expected && sameMove(expected, uci)) return ply >= p.moves.length - 1 ? 'solved' : 'continue'
  const c = new Chess(fenBefore)
  try {
    c.move(uciToMove(uci))
  } catch {
    return 'wrong'
  }
  return c.isCheckmate() ? 'solved' : 'wrong'
}

const sameMove = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4) && (a[4] ?? 'q') === (b[4] ?? 'q') && a.length >= 4

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
}

/** Spielt einen UCI-Zug und gibt neue FEN + chess.js-Zug zurück (null, wenn illegal). */
export function applyUci(fen: string, uci: string) {
  const c = new Chess(fen)
  try {
    const move = c.move(uciToMove(uci))
    return { fen: c.fen(), move }
  } catch {
    return null
  }
}

/** Die Lösung (ohne den ersten Gegnerzug) in SAN, z. B. ['Dxf7+', 'Kh8', 'Dg8#']. */
export function solutionSan(p: Pick<LibPuzzle, 'fen' | 'moves'>): string[] {
  let fen = p.fen
  const out: string[] = []
  p.moves.forEach((m, i) => {
    const r = applyUci(fen, m)
    if (!r) return
    fen = r.fen
    if (i > 0) out.push(r.move.san)
  })
  return out
}

// ---------------------------------------------------------------- Wertung

export const START_RATING = 1200
export const MIN_RATING = 400
export const MAX_RATING = 3000

/** Elo-Erwartung des Spielers gegen ein Puzzle. */
export function expectedScore(player: number, puzzle: number): number {
  return 1 / (1 + 10 ** ((puzzle - player) / 400))
}

/** Grosser K-Faktor am Anfang, damit sich die Wertung schnell einpendelt. */
export function kFactor(games: number): number {
  if (games < 10) return 48
  if (games < 30) return 32
  return 20
}

/** Neue Wertung nach einem Puzzle (einfaches Elo gegen die Puzzle-Wertung). */
export function updateRating(player: number, puzzle: number, solved: boolean, games: number): number {
  const delta = Math.round(kFactor(games) * ((solved ? 1 : 0) - expectedScore(player, puzzle)))
  // Mindestens ±1, damit ein Ergebnis immer sichtbar zählt
  const d = delta === 0 ? (solved ? 1 : -1) : delta
  return Math.min(MAX_RATING, Math.max(MIN_RATING, player + d))
}

// ---------------------------------------------------------------- Statistik

export type ThemeStat = { solved: number; failed: number }

export type PuzzleStats = {
  version: 1
  rating: number
  games: number
  solved: number
  failed: number
  streak: number
  bestStreak: number
  sprintBest: number
  sprintRuns: number
  /** Zuletzt gespielte Puzzle-IDs (neueste zuletzt) – werden nicht so bald wiederholt. */
  recent: string[]
  themes: Record<string, ThemeStat>
  history: { date: number; rating: number }[]
}

export const STATS_KEY = 'schach-trainer:puzzles'
const MAX_RECENT = 1500
const MAX_HISTORY = 300

export const emptyStats = (): PuzzleStats => ({
  version: 1,
  rating: START_RATING,
  games: 0,
  solved: 0,
  failed: 0,
  streak: 0,
  bestStreak: 0,
  sprintBest: 0,
  sprintRuns: 0,
  recent: [],
  themes: {},
  history: [],
})

export function loadStats(storage: Pick<Storage, 'getItem'> = localStorage): PuzzleStats {
  try {
    const raw = storage.getItem(STATS_KEY)
    if (!raw) return emptyStats()
    const s = JSON.parse(raw) as PuzzleStats
    if (s?.version !== 1) return emptyStats()
    return { ...emptyStats(), ...s }
  } catch {
    return emptyStats()
  }
}

export function saveStats(s: PuzzleStats, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(STATS_KEY, JSON.stringify(s))
  } catch {
    /* Speicher voll oder blockiert */
  }
}

const remember = (recent: string[], id: string) => [...recent.filter((r) => r !== id), id].slice(-MAX_RECENT)

/** Ergebnis eines gewerteten Taktik-Puzzles eintragen. */
export function recordRated(s: PuzzleStats, p: LibPuzzle, solved: boolean, now = Date.now()): PuzzleStats {
  const rating = updateRating(s.rating, p.rating, solved, s.games)
  const streak = solved ? s.streak + 1 : 0
  const themes = { ...s.themes }
  for (const t of p.themes) {
    const old = themes[t] ?? { solved: 0, failed: 0 }
    themes[t] = solved ? { ...old, solved: old.solved + 1 } : { ...old, failed: old.failed + 1 }
  }
  return {
    ...s,
    rating,
    games: s.games + 1,
    solved: s.solved + (solved ? 1 : 0),
    failed: s.failed + (solved ? 0 : 1),
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    recent: remember(s.recent, p.id),
    themes,
    history: [...s.history, { date: now, rating }].slice(-MAX_HISTORY),
  }
}

/** Puzzle nur als gesehen merken (Sprint, ungewertet). */
export function markSeen(s: PuzzleStats, id: string): PuzzleStats {
  return { ...s, recent: remember(s.recent, id) }
}

export function recordSprint(s: PuzzleStats, score: number): PuzzleStats {
  return { ...s, sprintRuns: s.sprintRuns + 1, sprintBest: Math.max(s.sprintBest, score) }
}

// ---------------------------------------------------------------- Auswahl

/**
 * Wählt ein Puzzle nahe `target`: unter den passenden, noch nicht gesehenen Puzzles
 * eines der `spread` nächstgelegenen (zufällig). Liefert null, wenn keines passt.
 */
export function pickPuzzle(
  pool: LibPuzzle[],
  target: number,
  opts: { exclude?: Iterable<string>; theme?: string | null; spread?: number; maxDistance?: number } = {},
  rng: () => number = Math.random,
): LibPuzzle | null {
  const exclude = new Set(opts.exclude ?? [])
  const maxDist = opts.maxDistance ?? Infinity
  const cands = pool.filter(
    (p) => !exclude.has(p.id) && (!opts.theme || p.themes.includes(opts.theme)) && Math.abs(p.rating - target) <= maxDist,
  )
  if (!cands.length) return null
  cands.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target))
  const n = Math.min(cands.length, opts.spread ?? 12)
  return cands[Math.floor(rng() * n)]
}

/** Dateien der Bänder, sortiert nach Abstand zur Wertung (nächstes zuerst). */
export function bandsByDistance(index: PuzzleIndex, rating: number): BandInfo[] {
  const mid = (b: BandInfo) => (b.min + b.max) / 2
  return [...index.bands].sort((a, b) => Math.abs(mid(a) - rating) - Math.abs(mid(b) - rating))
}

// ---------------------------------------------------------------- Sprint

export const SPRINT_SECONDS = 180
export const SPRINT_LIVES = 3

/** Ziel-Wertung für das n-te Sprint-Puzzle (0-basiert): leicht beginnen, dann steigern. */
export function sprintTarget(n: number): number {
  return Math.min(2550, 500 + n * 70)
}

// ---------------------------------------------------------------- Themen

/** Deutsche Namen der Lichess-Themen. */
export const THEME_LABELS: Record<string, string> = {
  mate: 'Matt',
  mateIn1: 'Matt in 1',
  mateIn2: 'Matt in 2',
  mateIn3: 'Matt in 3',
  mateIn4: 'Matt in 4',
  mateIn5: 'Matt in 5+',
  backRankMate: 'Grundreihenmatt',
  smotheredMate: 'Ersticktes Matt',
  fork: 'Gabel',
  pin: 'Fesselung',
  skewer: 'Spiess',
  hangingPiece: 'Hängende Figur',
  discoveredAttack: 'Abzugsangriff',
  doubleCheck: 'Doppelschach',
  deflection: 'Ablenkung',
  attraction: 'Hinlenkung',
  sacrifice: 'Opfer',
  promotion: 'Umwandlung',
  advancedPawn: 'Vorgerückter Bauer',
  trappedPiece: 'Gefangene Figur',
  interference: 'Unterbrechung',
  clearance: 'Räumung',
  intermezzo: 'Zwischenzug',
  quietMove: 'Stiller Zug',
  xRayAttack: 'Röntgenangriff',
  zugzwang: 'Zugzwang',
  capturingDefender: 'Verteidiger schlagen',
  exposedKing: 'Ungeschützter König',
  kingsideAttack: 'Angriff am Königsflügel',
  queensideAttack: 'Angriff am Damenflügel',
  defensiveMove: 'Verteidigungszug',
  endgame: 'Endspiel',
  rookEndgame: 'Turmendspiel',
  pawnEndgame: 'Bauernendspiel',
  queenEndgame: 'Damenendspiel',
  bishopEndgame: 'Läuferendspiel',
  knightEndgame: 'Springerendspiel',
  opening: 'Eröffnung',
  middlegame: 'Mittelspiel',
  oneMove: 'Ein Zug',
  short: 'Kurz',
  long: 'Lang',
  veryLong: 'Sehr lang',
}

/** Themen, die im Filter angeboten werden (Reihenfolge = Anzeige). */
export const FILTER_THEMES = [
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'backRankMate',
  'smotheredMate',
  'fork',
  'pin',
  'skewer',
  'hangingPiece',
  'discoveredAttack',
  'doubleCheck',
  'deflection',
  'attraction',
  'sacrifice',
  'trappedPiece',
  'promotion',
  'advancedPawn',
  'intermezzo',
  'quietMove',
  'zugzwang',
  'endgame',
  'rookEndgame',
  'pawnEndgame',
]

/** Themen für die Anzeige: Motive zuerst, Länge/Phase/Bewertung weglassen. */
const META = new Set(['oneMove', 'short', 'long', 'veryLong', 'opening', 'middlegame', 'mate', 'kingsideAttack', 'queensideAttack'])
export function displayThemes(themes: string[]): string[] {
  const shown = themes.filter((t) => !META.has(t) && THEME_LABELS[t])
  return (shown.length ? shown : themes.filter((t) => THEME_LABELS[t])).map((t) => THEME_LABELS[t])
}
