// Eröffnungs-Trainer: reine Logik (ohne React), damit sie testbar ist.
// Ein Kurs besteht aus Linien der Lichess-Eröffnungsliste (CC0). Daraus wird ein
// Variantenbaum gebaut; der Gegner wählt Fortsetzungen, der Spieler muss mit einem
// Zug aus dem Repertoire antworten, bis eine Linie zu Ende ist.
import { Chess, type Color } from 'chess.js'

export type OLine = { eco: string; name: string; moves: string[] }

export type Course = {
  id: string
  title: string
  side: Color
  intro?: string
  lines: OLine[]
}

export type Child = { san: string; uci: string; to: string }
export type TNode = { key: string; fen: string; children: Child[]; name?: string; eco?: string }
export type Tree = { root: string; nodes: Map<string, TNode> }

/** Stellungs-Schlüssel ohne Zugzähler (Zugumstellungen landen im selben Knoten). */
export const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export const START_FEN = new Chess().fen()

export function parseLines(raw: { lines: [string, string, string][] }): OLine[] {
  return raw.lines.map(([eco, name, moves]) => ({ eco, name, moves: moves ? moves.split(' ') : [] }))
}

/** Baut den Variantenbaum. Unlesbare Linien werden übersprungen. */
export function buildTree(lines: OLine[]): Tree {
  const c0 = new Chess()
  const root = posKey(c0.fen())
  const nodes = new Map<string, TNode>([[root, { key: root, fen: c0.fen(), children: [] }]])
  for (const line of lines) {
    const c = new Chess()
    let key = root
    for (const san of line.moves) {
      let m
      try {
        m = c.move(san)
      } catch {
        break
      }
      const next = posKey(c.fen())
      const node = nodes.get(key)!
      if (!node.children.some((ch) => ch.san === m.san)) node.children.push({ san: m.san, uci: m.lan, to: next })
      if (!nodes.has(next)) nodes.set(next, { key: next, fen: c.fen(), children: [] })
      key = next
    }
    const end = nodes.get(key)!
    // Kürzester bzw. erster Name gewinnt nicht automatisch – der längste (spezifischste) schon
    if (!end.name || line.name.length > end.name.length) {
      end.name = line.name
      end.eco = line.eco
    }
  }
  return { root, nodes }
}

/** Blätter (Linienenden) unterhalb eines Knotens, gesamt und noch nicht gemeistert. */
export function leafStats(
  tree: Tree,
  key: string,
  mastered: ReadonlySet<string>,
  memo = new Map<string, { total: number; open: number }>(),
  seen = new Set<string>(),
): { total: number; open: number } {
  const hit = memo.get(key)
  if (hit) return hit
  const node = tree.nodes.get(key)
  if (!node || seen.has(key)) return { total: 0, open: 0 }
  if (node.children.length === 0) {
    const r = { total: 1, open: mastered.has(key) ? 0 : 1 }
    memo.set(key, r)
    return r
  }
  seen.add(key)
  let total = 0
  let open = 0
  for (const ch of node.children) {
    const s = leafStats(tree, ch.to, mastered, memo, seen)
    total += s.total
    open += s.open
  }
  seen.delete(key)
  const r = { total, open }
  memo.set(key, r)
  return r
}

/** Alle Linienenden des Baums. */
export const leafKeys = (tree: Tree) => [...tree.nodes.values()].filter((n) => n.children.length === 0).map((n) => n.key)

/**
 * Gegnerzug wählen: bevorzugt Fortsetzungen, unter denen noch ungelernte Linien liegen
 * (Gewicht = offene Linien + 0.15, damit auch Gelerntes gelegentlich wiederkommt).
 */
export function chooseOpponentMove(tree: Tree, key: string, mastered: ReadonlySet<string>, rnd = Math.random): Child | null {
  const node = tree.nodes.get(key)
  if (!node || node.children.length === 0) return null
  const memo = new Map<string, { total: number; open: number }>()
  const weights = node.children.map((ch) => leafStats(tree, ch.to, mastered, memo).open + 0.15)
  let r = rnd() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return node.children[i]
  }
  return node.children[node.children.length - 1]
}

/** Empfohlener eigener Zug (für Pfeil/Hinweis): der mit den meisten offenen Linien, sonst den meisten Linien. */
export function suggestMove(tree: Tree, key: string, mastered: ReadonlySet<string>): Child | null {
  const node = tree.nodes.get(key)
  if (!node || node.children.length === 0) return null
  const memo = new Map<string, { total: number; open: number }>()
  return [...node.children].sort((a, b) => {
    const sa = leafStats(tree, a.to, mastered, memo)
    const sb = leafStats(tree, b.to, mastered, memo)
    return sb.open - sa.open || sb.total - sa.total
  })[0]
}

/** Ist der gespielte Zug im Repertoire? Gibt die passende Fortsetzung zurück. */
export const repertoireMove = (tree: Tree, key: string, san: string): Child | null =>
  tree.nodes.get(key)?.children.find((c) => c.san === san) ?? null

/** Seite, die den letzten Zug der Linie macht (für Einzel-Linien: wer das Gambit/die Idee spielt). */
export const lineSide = (l: OLine): Color => (l.moves.length % 2 === 1 ? 'w' : 'b')

/** Name des tiefsten benannten Knotens auf einem Pfad von Stellungs-Schlüsseln. */
export function deepestName(tree: Tree, path: string[]): { eco: string; name: string } | null {
  for (let i = path.length - 1; i >= 0; i--) {
    const n = tree.nodes.get(path[i])
    if (n?.name) return { eco: n.eco ?? '', name: n.name }
  }
  return null
}

export const familyOf = (name: string) => name.split(':')[0].trim()

// ---------- Fortschritt (localStorage) ----------

export type CourseProgress = { mastered: string[]; runs: number; perfect: number; lastPlayed: number }
export type OpeningProgress = { version: 1; courses: Record<string, CourseProgress> }

const KEY = 'schach-trainer:openings'
export const emptyProgress = (): OpeningProgress => ({ version: 1, courses: {} })

export function loadProgress(storage: Pick<Storage, 'getItem'> = localStorage): OpeningProgress {
  try {
    const p = JSON.parse(storage.getItem(KEY) ?? 'null')
    return p?.version === 1 && p.courses && typeof p.courses === 'object' ? p : emptyProgress()
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(p: OpeningProgress, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* egal */
  }
}

/** Ergebnis eines Durchlaufs eintragen: fehlerfrei → Linienende gilt als gelernt; mit Fehlern → wieder offen. */
export function recordRun(p: OpeningProgress, courseId: string, leaf: string, mistakes: number, now = Date.now()): OpeningProgress {
  const c = p.courses[courseId] ?? { mastered: [], runs: 0, perfect: 0, lastPlayed: 0 }
  const set = new Set(c.mastered)
  if (mistakes === 0) set.add(leaf)
  else set.delete(leaf)
  return {
    ...p,
    courses: {
      ...p.courses,
      [courseId]: { mastered: [...set], runs: c.runs + 1, perfect: c.perfect + (mistakes === 0 ? 1 : 0), lastPlayed: now },
    },
  }
}
