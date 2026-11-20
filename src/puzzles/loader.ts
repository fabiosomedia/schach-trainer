import { bandsByDistance, parseBand, pickPuzzle, type LibPuzzle, type PuzzleIndex, type RawPuzzle } from './puzzleLib'

/** Lädt die Puzzle-Bänder erst, wenn sie gebraucht werden (je ~50 KB). */
const base = () => `${import.meta.env.BASE_URL}puzzles/`

let indexPromise: Promise<PuzzleIndex> | null = null
const bandCache = new Map<string, Promise<LibPuzzle[]>>()

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return (await r.json()) as T
}

export function loadIndex(): Promise<PuzzleIndex> {
  if (!indexPromise) {
    indexPromise = getJson<PuzzleIndex>(base() + 'index.json')
    indexPromise.catch(() => (indexPromise = null))
  }
  return indexPromise
}

export function loadBand(file: string): Promise<LibPuzzle[]> {
  let p = bandCache.get(file)
  if (!p) {
    p = getJson<RawPuzzle[]>(base() + file).then(parseBand)
    p.catch(() => bandCache.delete(file))
    bandCache.set(file, p)
  }
  return p
}

/**
 * Sucht ein Puzzle nahe `target`. Lädt zuerst das passende Band, bei zu wenig
 * Treffern (z. B. seltenes Thema) schrittweise die Nachbarbänder dazu.
 */
export async function findPuzzle(target: number, opts: { exclude?: Iterable<string>; theme?: string | null } = {}) {
  const index = await loadIndex()
  const bands = bandsByDistance(index, target).filter((b) => !opts.theme || (b.themes[opts.theme] ?? 0) > 0)
  const exclude = new Set(opts.exclude ?? [])
  const pool: LibPuzzle[] = []
  for (let i = 0; i < bands.length; i++) {
    pool.push(...(await loadBand(bands[i].file)))
    // Bevorzugt nahe Puzzles; je mehr Bänder geladen sind, desto grösser der erlaubte Abstand
    const hit = pickPuzzle(pool, target, { exclude, theme: opts.theme, maxDistance: 150 + i * 200 })
    if (hit) return hit
  }
  // Alles schon gesehen – dann eben ein bekanntes Puzzle
  return pickPuzzle(pool, target, { theme: opts.theme }) ?? null
}
