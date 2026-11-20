// Erzeugt src/data/openings.json aus der Lichess-Eröffnungsliste (CC0):
// https://github.com/lichess-org/chess-openings (a.tsv … e.tsv: eco, name, pgn)
// Aufruf: node scripts/build-openings.mjs
// Die TSV-Dateien landen in einem Temp-Ordner, nicht im Repo.
import { Chess } from 'chess.js'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const tmp = join(tmpdir(), 'schach-trainer-openings')
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'openings.json')

/** Häufige Familiennamen auf Deutsch; der Rest bleibt englisch. */
const FAMILY_DE = {
  'Sicilian Defense': 'Sizilianische Verteidigung',
  'French Defense': 'Französische Verteidigung',
  'Caro-Kann Defense': 'Caro-Kann-Verteidigung',
  'Ruy Lopez': 'Spanische Partie',
  'Italian Game': 'Italienische Partie',
  "Queen's Gambit Declined": 'Abgelehntes Damengambit',
  "Queen's Gambit Accepted": 'Angenommenes Damengambit',
  "Queen's Gambit": 'Damengambit',
  "King's Gambit": 'Königsgambit',
  "King's Gambit Accepted": 'Angenommenes Königsgambit',
  "King's Gambit Declined": 'Abgelehntes Königsgambit',
  "King's Indian Defense": 'Königsindische Verteidigung',
  "King's Indian Attack": 'Königsindischer Angriff',
  "Queen's Indian Defense": 'Damenindische Verteidigung',
  'Nimzo-Indian Defense': 'Nimzoindische Verteidigung',
  'Bogo-Indian Defense': 'Bogoljubow-Indische Verteidigung',
  'Old Indian Defense': 'Altindische Verteidigung',
  'Indian Defense': 'Indische Verteidigung',
  'Scotch Game': 'Schottische Partie',
  'Four Knights Game': 'Vierspringerspiel',
  'Three Knights Opening': 'Dreispringerspiel',
  "Petrov's Defense": 'Russische Verteidigung',
  'Philidor Defense': 'Philidor-Verteidigung',
  'English Opening': 'Englische Eröffnung',
  'Dutch Defense': 'Holländische Verteidigung',
  'Slav Defense': 'Slawische Verteidigung',
  'Semi-Slav Defense': 'Halbslawische Verteidigung',
  'Scandinavian Defense': 'Skandinavische Verteidigung',
  'Pirc Defense': 'Pirc-Verteidigung',
  'Modern Defense': 'Moderne Verteidigung',
  'Alekhine Defense': 'Aljechin-Verteidigung',
  'Grünfeld Defense': 'Grünfeld-Indische Verteidigung',
  'Benoni Defense': 'Benoni-Verteidigung',
  'Vienna Game': 'Wiener Partie',
  "Bishop's Opening": 'Läuferspiel',
  'Center Game': 'Mittelgambit',
  'Danish Gambit': 'Nordisches Gambit',
  "King's Pawn Game": 'Königsbauernspiel',
  "Queen's Pawn Game": 'Damenbauernspiel',
  'Catalan Opening': 'Katalanische Eröffnung',
  'Réti Opening': 'Réti-Eröffnung',
  'Bird Opening': 'Bird-Eröffnung',
  'Nimzo-Larsen Attack': 'Nimzowitsch-Larsen-Angriff',
  'Trompowsky Attack': 'Trompowsky-Angriff',
  'Budapest Defense': 'Budapester Gambit',
  'Benko Gambit': 'Wolga-Gambit',
  'Latvian Gambit': 'Lettisches Gambit',
  'Polish Opening': 'Polnische Eröffnung',
  'Zukertort Opening': 'Zukertort-Eröffnung',
  'Tarrasch Defense': 'Tarrasch-Verteidigung',
  'Ponziani Opening': 'Ponziani-Eröffnung',
  'Grob Opening': 'Grob-Eröffnung',
  'Owen Defense': 'Owen-Verteidigung',
  'Hungarian Opening': 'Ungarische Eröffnung',
  'Elephant Gambit': 'Elefantengambit',
}

const translate = (name) => {
  const i = name.indexOf(':')
  const fam = i < 0 ? name : name.slice(0, i)
  const de = FAMILY_DE[fam]
  return de ? de + name.slice(fam.length) : name
}

const key = (fen) => fen.split(' ').slice(0, 4).join(' ')

mkdirSync(tmp, { recursive: true })
const rows = []
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const file = join(tmp, `${f}.tsv`)
  if (!existsSync(file)) {
    const res = await fetch(`${BASE}${f}.tsv`)
    if (!res.ok) throw new Error(`${f}.tsv: HTTP ${res.status}`)
    writeFileSync(file, await res.text())
  }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).slice(1)
  for (const l of lines) {
    if (!l.trim()) continue
    const [eco, name, pgn] = l.split('\t')
    rows.push({ eco, name, pgn })
  }
}

// Kürzere Linien zuerst, damit bei Zugumstellungen der "kanonische" (kürzeste) Name gewinnt.
rows.sort((a, b) => a.pgn.length - b.pgn.length)

/** Positions-Schlüssel → Index in names (oder -1 = Buchstellung ohne eigenen Namen). */
const pos = {}
const names = []
const nameIdx = new Map()
let bad = 0
for (const r of rows) {
  const c = new Chess()
  try {
    c.loadPgn(r.pgn)
  } catch {
    bad++
    continue
  }
  const hist = c.history({ verbose: true })
  hist.forEach((m, i) => {
    const k = key(m.after)
    if (i === hist.length - 1) {
      if (pos[k] === undefined || pos[k] === -1) {
        const label = `${r.eco}|${translate(r.name)}`
        let idx = nameIdx.get(label)
        if (idx === undefined) {
          idx = names.length
          names.push([r.eco, translate(r.name)])
          nameIdx.set(label, idx)
        }
        pos[k] = idx
      }
    } else if (pos[k] === undefined) pos[k] = -1
  })
}

mkdirSync(dirname(out), { recursive: true })
const json = JSON.stringify({ source: 'lichess-org/chess-openings (CC0)', names, pos })
writeFileSync(out, json)
const named = Object.values(pos).filter((v) => v >= 0).length
console.log(`${rows.length} Linien, ${bad} unlesbar, ${Object.keys(pos).length} Stellungen (${named} benannt), ${names.length} Namen, ${(json.length / 1024).toFixed(0)} KB → ${out}`)
