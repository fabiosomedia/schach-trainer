// Reine Parser für das UCI-Protokoll – ohne Worker, damit sie testbar sind.

export type Score = { type: 'cp' | 'mate'; value: number }

export type PvLine = {
  multipv: number
  depth: number
  /** Aus Sicht der Seite am Zug (so liefert es die Engine). */
  score: Score
  /** Zugfolge in UCI-Notation, z. B. ["e2e4", "e7e5"]. */
  pv: string[]
}

/** Parst eine `info ... pv ...`-Zeile. Gibt null zurück, wenn sie keine Variante enthält. */
export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith('info ')) return null
  const tokens = line.split(/\s+/)
  const pvIdx = tokens.indexOf('pv')
  const scoreIdx = tokens.indexOf('score')
  if (pvIdx < 0 || scoreIdx < 0) return null

  const num = (key: string, fallback: number) => {
    const i = tokens.indexOf(key)
    return i >= 0 && i + 1 < tokens.length ? Number(tokens[i + 1]) : fallback
  }

  const kind = tokens[scoreIdx + 1]
  const value = Number(tokens[scoreIdx + 2])
  if ((kind !== 'cp' && kind !== 'mate') || Number.isNaN(value)) return null

  return {
    multipv: num('multipv', 1),
    depth: num('depth', 0),
    score: { type: kind, value },
    pv: tokens.slice(pvIdx + 1).filter(Boolean),
  }
}

/** Parst `bestmove e2e4 ponder e7e5`. `(none)` heisst: kein legaler Zug. */
export function parseBestmove(line: string): string | null {
  const m = line.match(/^bestmove\s+(\S+)/)
  if (!m || m[1] === '(none)') return null
  return m[1]
}

/** Zerlegt einen UCI-Zug wie "e7e8q" in from/to/promotion. */
export function splitUci(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  }
}
