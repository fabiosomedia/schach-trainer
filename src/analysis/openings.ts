import { Chess } from 'chess.js'
import openingsUrl from '../data/openings.json?url'

/**
 * Eröffnungsbuch aus der Lichess-Liste (CC0, erzeugt mit scripts/build-openings.mjs).
 * Die Daten (~700 KB, gzip ~100 KB) werden als gehashte Datei erst bei Bedarf geladen (fetch).
 */
export type Opening = { eco: string; name: string }

export type OpeningData = {
  names: [string, string][]
  /** Stellungs-Schlüssel → Index in names, -1 = Buchstellung ohne eigenen Namen. */
  pos: Record<string, number>
}

export class OpeningBook {
  private data: OpeningData
  constructor(data: OpeningData) {
    this.data = data
  }

  /** Liegt die Stellung im Eröffnungsbuch? */
  has(fen: string): boolean {
    return this.data.pos[positionKey(fen)] !== undefined
  }

  /** Name der Stellung (nur wenn die Stellung selbst benannt ist). */
  at(fen: string): Opening | null {
    const i = this.data.pos[positionKey(fen)]
    if (i === undefined || i < 0) return null
    const [eco, name] = this.data.names[i]
    return { eco, name }
  }

  get size() {
    return Object.keys(this.data.pos).length
  }
}

/** FEN ohne Zugzähler (Brett, Seite am Zug, Rochaderechte, en passant). */
export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/** "Sizilianische Verteidigung: Najdorf-Variante" → "Sizilianische Verteidigung". */
export const openingFamily = (name: string) => name.split(':')[0].trim()

let loaded: OpeningBook | null = null
let loading: Promise<OpeningBook> | null = null

/** Lädt das Buch (einmalig, danach aus dem Cache). */
export function loadOpenings(): Promise<OpeningBook> {
  if (loaded) return Promise.resolve(loaded)
  loading ??= fetch(openingsUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`Eröffnungsbuch: HTTP ${r.status}`)
      return r.json() as Promise<OpeningData>
    })
    .then((d) => (loaded = new OpeningBook(d)))
    .catch((e) => {
      loading = null // später erneut versuchen
      throw e
    })
  return loading
}

/** Für Tests: Buch direkt setzen. */
export function setOpeningBook(b: OpeningBook | null) {
  loaded = b
  loading = null
}

/** Bereits geladenes Buch oder null (synchron). */
export const openingBook = () => loaded

type MoveLike = string | { after: string }

/**
 * Tiefste bekannte Eröffnung einer Zugfolge (SAN-Strings oder chess.js-Züge mit `after`).
 * Ohne `book` wird das bereits geladene Buch genutzt (null, falls noch nicht geladen).
 */
export function openingAt(moves: MoveLike[], book: OpeningBook | null = loaded, startFen?: string): Opening | null {
  if (!book) return null
  let found: Opening | null = null
  const c = typeof moves[0] === 'string' ? new Chess(startFen) : null
  for (const m of moves) {
    let fen: string
    if (typeof m === 'string') {
      try {
        c!.move(m)
      } catch {
        break
      }
      fen = c!.fen()
    } else fen = m.after
    found = book.at(fen) ?? found
  }
  return found
}

/** Eröffnung einer PGN (null bei unlesbarer PGN oder ohne Buch). */
export function openingFromPgn(pgn: string, book: OpeningBook | null = loaded): Opening | null {
  if (!book || !pgn.trim()) return null
  const c = new Chess()
  try {
    c.loadPgn(pgn.trim())
  } catch {
    return null
  }
  return openingAt(c.history({ verbose: true }), book)
}
