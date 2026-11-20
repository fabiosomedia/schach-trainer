import type { Color } from 'chess.js'
import { familyOf, lineSide, type Course, type OLine } from './trainer'

/** Kuratierte Kurse: welche Linien dazugehören, welche Seite man lernt, kurze Einführung. */
type CourseDef = { id: string; title: string; side: Color; intro: string; match: (l: OLine) => boolean }

const fam = (...names: string[]) => (l: OLine) => names.includes(familyOf(l.name))
const has = (s: string) => (l: OLine) => l.name.includes(s)

export const COURSE_DEFS: CourseDef[] = [
  {
    id: 'italian',
    title: 'Italienische Partie',
    side: 'w',
    intro: '1.e4 e5 2.Sf3 Sc6 3.Lc4 – der Läufer zielt auf f7. Ruhige Entwicklung, frühe Rochade, später Kampf ums Zentrum mit c3 und d4.',
    match: fam('Italienische Partie'),
  },
  {
    id: 'spanish',
    title: 'Spanische Partie',
    side: 'w',
    intro: '3.Lb5 setzt den Springer c6 unter Druck, der e5 verteidigt. Eine der ältesten und tiefsten Eröffnungen überhaupt.',
    match: fam('Spanische Partie'),
  },
  {
    id: 'london',
    title: 'London-System',
    side: 'w',
    intro: 'Lf4, e3, Sf3, Ld3, c3 – fast immer derselbe Aufbau. Solide und schnell zu lernen.',
    match: has('London System'),
  },
  {
    id: 'qgambit',
    title: 'Damengambit',
    side: 'w',
    intro: '1.d4 d5 2.c4 – Weiss bietet den c-Bauern an, um das Zentrum zu übernehmen. Schwarz kann annehmen (dxc4) oder ablehnen (e6, c6).',
    match: fam('Damengambit', 'Angenommenes Damengambit', 'Abgelehntes Damengambit'),
  },
  {
    id: 'vienna',
    title: 'Wiener Partie',
    side: 'w',
    intro: '1.e4 e5 2.Sc3 – flexibel: Weiss kann später mit f4 angreifen oder ruhig mit Lc4 und g3 spielen.',
    match: fam('Wiener Partie'),
  },
  {
    id: 'kingsgambit',
    title: 'Königsgambit',
    side: 'w',
    intro: '1.e4 e5 2.f4 – ein romantisches Bauernopfer für schnelle Entwicklung und Angriff über die f-Linie.',
    match: fam('Königsgambit', 'Angenommenes Königsgambit', 'Abgelehntes Königsgambit'),
  },
  {
    id: 'alien',
    title: 'Alien Gambit (gegen Caro-Kann)',
    side: 'w',
    intro: 'Eine Überraschungswaffe: Nach 5.Sg5 h6 opfert Weiss mit 6.Sxf7 einen Springer, um den schwarzen König aus der Deckung zu holen.',
    match: has('Alien Gambit'),
  },
  {
    id: 'caro',
    title: 'Caro-Kann-Verteidigung',
    side: 'b',
    intro: '1…c6 und 2…d5: solide wie Französisch, aber der Läufer c8 kommt oft vor die Bauernkette (…Lf5). Du lernst die Antworten auf alle weissen Systeme.',
    match: fam('Caro-Kann-Verteidigung'),
  },
  {
    id: 'sicilian',
    title: 'Sizilianische Verteidigung',
    side: 'b',
    intro: '1…c5 kämpft asymmetrisch um d4. Schwarz bekommt Gegenspiel am Damenflügel – scharf und sehr umfangreich.',
    match: fam('Sizilianische Verteidigung'),
  },
  {
    id: 'french',
    title: 'Französische Verteidigung',
    side: 'b',
    intro: '1…e6 und 2…d5: eine feste Bauernkette. Schwarz greift das weisse Zentrum später mit …c5 und …f6 an.',
    match: fam('Französische Verteidigung'),
  },
  {
    id: 'scandinavian',
    title: 'Skandinavische Verteidigung',
    side: 'b',
    intro: '1…d5 greift e4 sofort an. Nach 2.exd5 Dxd5 zieht die Dame früh – dafür ist die Stellung leicht zu verstehen.',
    match: fam('Skandinavische Verteidigung'),
  },
  {
    id: 'kingsindian',
    title: 'Königsindische Verteidigung',
    side: 'b',
    intro: 'Schwarz überlässt Weiss das Zentrum, stellt den Läufer nach g7 und schlägt später mit …e5 oder …c5 zurück.',
    match: fam('Königsindische Verteidigung'),
  },
]

export function buildCourses(all: OLine[]): Course[] {
  return COURSE_DEFS.map((d) => ({ id: d.id, title: d.title, side: d.side, intro: d.intro, lines: all.filter(d.match) })).filter(
    (c) => c.lines.length > 0,
  )
}

/** Suchtreffer: ganze Familien (alle Varianten) und einzelne Linien. */
export function searchCourses(all: OLine[], query: string, limit = 30): Course[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const out: Course[] = []
  const families = new Map<string, OLine[]>()
  for (const l of all) {
    const f = familyOf(l.name)
    if (f.toLowerCase().includes(q)) families.set(f, [...(families.get(f) ?? []), l])
  }
  for (const [f, lines] of families) {
    out.push({
      id: `fam:${f}`,
      title: `${f} (alle Varianten)`,
      side: /verteidigung|defen[cs]e/i.test(f) ? 'b' : 'w',
      lines,
    })
  }
  for (const l of all) {
    if (out.length >= limit) break
    if (l.name.toLowerCase().includes(q) || l.eco.toLowerCase() === q) {
      out.push({ id: `line:${l.eco}:${l.name}:${l.moves.join(' ')}`, title: l.name, side: lineSide(l), lines: [l] })
    }
  }
  return out.slice(0, limit)
}
