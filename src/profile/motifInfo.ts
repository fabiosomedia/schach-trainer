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
  allowed_pin: {
    label: 'Fesselung übersehen',
    advice: 'Steht eine Figur vor deinem König oder deiner Dame auf einer Linie? Dann kann der Gegner sie fesseln – stell sie rechtzeitig um.',
  },
  missed_pin: {
    label: 'Fesselung verpasst',
    advice: 'Suche gegnerische Figuren, die vor König oder Dame stehen – Läufer und Türme können sie fesseln.',
  },
  allowed_skewer: {
    label: 'Spiess zugelassen',
    advice: 'Stell König und Dame (oder Turm) nicht auf dieselbe Linie, wenn ein gegnerischer Läufer, Turm oder die Dame sie erreichen kann.',
  },
  missed_skewer: {
    label: 'Spiess verpasst',
    advice: 'Stehen zwei gegnerische Figuren auf einer Linie, die wertvollere vorne? Greif die vordere an – dahinter fällt die andere.',
  },
  allowed_discovered: {
    label: 'Abzugsangriff übersehen',
    advice: 'Achte auf gegnerische Figuren, die eine Linie von Läufer, Turm oder Dame verstellen – zieht sie weg, öffnet sich ein Angriff.',
  },
  missed_discovered: {
    label: 'Abzugsangriff verpasst',
    advice: 'Steht eine eigene Figur vor deinem Läufer, Turm oder deiner Dame? Ziehst du sie mit Drohung weg, entstehen zwei Angriffe auf einmal.',
  },
  allowed_back_rank: {
    label: 'Grundreihenschwäche',
    advice: 'Gib deinem König ein „Luftloch“ (z. B. h3 bzw. h6), damit er bei einem Schach auf der Grundreihe nicht matt ist.',
  },
  missed_back_rank: {
    label: 'Grundreihenmatt verpasst',
    advice: 'Steht der gegnerische König hinter eigenen Bauern auf der Grundreihe? Prüfe Turm- und Damenschachs auf dieser Reihe.',
  },
  allowed_double_attack: {
    label: 'Doppelangriff der Dame zugelassen',
    advice: 'Die Dame greift in alle Richtungen an – lass keine ungedeckten Figuren stehen und achte auf Schachs mit gleichzeitiger Drohung.',
  },
  missed_double_attack: {
    label: 'Doppelangriff verpasst',
    advice: 'Suche Damenzüge, die zwei Ziele gleichzeitig angreifen – am stärksten mit Schach und einer ungedeckten Figur.',
  },
  trapped_piece: {
    label: 'Figur eingesperrt',
    advice: 'Bevor du eine Figur tief ins gegnerische Lager ziehst: Hat sie dort noch Rückzugsfelder?',
  },
  missed_trapped_piece: {
    label: 'Figur fangen verpasst',
    advice: 'Hat eine gegnerische Figur kaum Felder? Greif sie mit einer billigeren Figur an – oft kann sie nicht mehr entkommen.',
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
