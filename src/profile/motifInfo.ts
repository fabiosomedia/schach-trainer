import type { GamePhase, Motif } from '../analysis/explain'

export const MOTIF_INFO: Record<Motif, { label: string; advice: string }> = {
  missed_mate: {
    label: 'Matt übersehen',
    advice: 'Prüfe vor jedem Zug alle Schachgebote – auch die, die nach Opfer aussehen.',
  },
  allowed_mate: {
    label: 'Mattdrohung übersehen',
    advice: 'Frag dich nach jedem gegnerischen Zug: Was droht er? Achte besonders auf die Grundreihe.',
  },
  allowed_fork: {
    label: 'Gabel zugelassen',
    advice: 'Achte auf Felder, von denen ein Springer zwei deiner Figuren gleichzeitig angreifen kann.',
  },
  hung_moved_piece: {
    label: 'Figur in Angriff gezogen',
    advice: 'Bevor du loslässt: Wer kann das Zielfeld angreifen? Ist die Figur dort gedeckt?',
  },
  hung_piece: {
    label: 'Figur ungedeckt gelassen',
    advice: 'Wenn du eine Figur wegziehst, prüfe, was sie vorher gedeckt hat.',
  },
  lost_material: {
    label: 'Material verloren',
    advice: 'Zähle bei Abtauschen Angreifer und Verteidiger, bevor du schlägst.',
  },
  missed_capture: {
    label: 'Freie Figur nicht genommen',
    advice: 'Schau bei jedem Zug, ob der Gegner etwas ungedeckt stehen lässt.',
  },
  missed_fork: {
    label: 'Eigene Gabel verpasst',
    advice: 'Suche Felder, von denen aus du König, Dame oder Türme gleichzeitig angreifen kannst.',
  },
  missed_tactic: {
    label: 'Taktik verpasst',
    advice: 'Checks, Captures, Threats: Geh diese drei Fragen bei jedem Zug durch.',
  },
  positional: {
    label: 'Stellungsfehler',
    advice: 'Halte deine Figuren aktiv und zentral, und vermeide Schwächen vor deinem König.',
  },
  early_queen: {
    label: 'Dame zu früh',
    advice: 'Entwickle in der Eröffnung zuerst Springer und Läufer, die Dame später.',
  },
  knight_rim: {
    label: 'Springer am Rand',
    advice: 'Springer gehören in die Mitte – dort kontrollieren sie bis zu 8 Felder.',
  },
  king_center: {
    label: 'König in der Mitte',
    advice: 'Rochiere früh, damit dein König sicher steht und die Türme verbunden werden.',
  },
}

export const PHASE_LABEL: Record<GamePhase, string> = {
  opening: 'Eröffnung',
  middlegame: 'Mittelspiel',
  endgame: 'Endspiel',
}
