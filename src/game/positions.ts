import { Chess, type Color } from 'chess.js'

export type StartPosition = {
  id: string
  group: 'Normal' | 'Eröffnung' | 'Endspiel'
  name: string
  /** Kurze Aufgabe / Idee, wird beim Start angezeigt. */
  goal?: string
  fen?: string
  /** Erzwungene Spielerfarbe (z. B. Endspiele: immer die starke Seite). */
  color?: Color
}

const fromMoves = (san: string[]) => {
  const c = new Chess()
  for (const m of san) c.move(m)
  return c.fen()
}

export const START_POSITIONS: StartPosition[] = [
  { id: 'start', group: 'Normal', name: 'Grundstellung' },

  {
    id: 'italian',
    group: 'Eröffnung',
    name: 'Italienisch',
    fen: fromMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']),
    goal: 'Klassische Entwicklung: Läufer auf c4 zielt auf f7. Rochiere früh und kämpfe ums Zentrum mit c3 und d4.',
  },
  {
    id: 'sicilian',
    group: 'Eröffnung',
    name: 'Sizilianisch',
    fen: fromMoves(['e4', 'c5']),
    goal: 'Schwarz kämpft asymmetrisch um d4. Weiss spielt meist Sf3 und d4, Schwarz sucht Gegenspiel am Damenflügel.',
  },
  {
    id: 'french',
    group: 'Eröffnung',
    name: 'Französisch',
    fen: fromMoves(['e4', 'e6', 'd4', 'd5']),
    goal: 'Feste Bauernkette. Schwarz greift die Kette später mit c5 und f6 an; der Läufer c8 ist das Sorgenkind.',
  },
  {
    id: 'caro',
    group: 'Eröffnung',
    name: 'Caro-Kann',
    fen: fromMoves(['e4', 'c6', 'd4', 'd5']),
    goal: 'Solide Verteidigung: Schwarz bekommt den Läufer c8 oft vor die Bauernkette (Lf5).',
  },
  {
    id: 'qgambit',
    group: 'Eröffnung',
    name: 'Damengambit',
    fen: fromMoves(['d4', 'd5', 'c4']),
    goal: 'Weiss bietet den c-Bauern an, um das Zentrum zu übernehmen. Schwarz kann annehmen (dxc4) oder mit e6/c6 ablehnen.',
  },
  {
    id: 'london',
    group: 'Eröffnung',
    name: 'London-System',
    fen: fromMoves(['d4', 'd5', 'Bf4']),
    goal: 'Einfaches System für Weiss: Lf4, e3, Sf3, Ld3, c3 – fast immer gleicher Aufbau, sehr solide.',
  },

  {
    id: 'kq-k',
    group: 'Endspiel',
    name: 'König + Dame gegen König',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    color: 'w',
    goal: 'Setze matt! Drücke den König mit der Dame an den Rand (Springerzug-Abstand), hole deinen König heran. Vorsicht vor Patt!',
  },
  {
    id: 'kr-k',
    group: 'Endspiel',
    name: 'König + Turm gegen König',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    color: 'w',
    goal: 'Setze matt! Der Turm schneidet den König ab, dein König unterstützt. Opposition nutzen, Box verkleinern.',
  },
  {
    id: 'kp-k',
    group: 'Endspiel',
    name: 'Bauernendspiel',
    fen: '4k3/8/8/8/8/4K3/4P3/8 w - - 0 1',
    color: 'w',
    goal: 'Bring den Bauern zur Dame. Der König geht voran – nutze die Opposition!',
  },
]

export const findPosition = (id: string) => START_POSITIONS.find((p) => p.id === id) ?? START_POSITIONS[0]
