# Schach-Trainer – Projektplan

Ein Schach-Trainer im Browser, der klassisches Schach beibringt: Du spielst gegen
ihn, er analysiert jeden deiner Züge, erkennt deine typischen Fehler und trainiert
dich gezielt darauf. **100 % gratis, keine KI, kein Server** – alles läuft lokal im Browser.

---

## 1. Ziele & Grundsätze

- **Lernen statt nur Spielen:** Jeder Fehler wird erklärt („warum war das schlecht?“).
- **Personalisiert:** Der Trainer merkt sich deine Schwächen und übt genau diese.
- **Gratis & offline:** Stockfish (WebAssembly, ~7 MB) im Browser, Erklärungen regelbasiert,
  Daten in `localStorage`/IndexedDB. Hosting später gratis via GitHub/GitLab Pages.
- **Klein anfangen:** Jede Phase endet mit einer lauffähigen, nutzbaren Version.

## 2. Tech-Stack

| Teil | Wahl | Grund |
|---|---|---|
| Sprache | TypeScript | Typsicherheit, gute Tooling |
| Build | Vite | schnell, simpel |
| UI | React 18 | Komponenten, grosses Ökosystem |
| Regeln | `chess.js` | Zuggenerierung, FEN/PGN, Matt/Patt |
| Brett | `react-chessboard` | Drag & Drop, Pfeile, Markierungen, MIT-Lizenz |
| Engine | `stockfish` (npm, lite single-threaded WASM) | Weltklasse, läuft im Web Worker, braucht keine Spezial-Header |
| Speicher | `localStorage` (später IndexedDB) | kein Server nötig |
| Tests | Vitest | für Analyse-Regeln & Logik |

## 3. Architektur

```
src/
  engine/
    stockfish.ts      # Wrapper um den Web Worker (UCI-Protokoll, Promise-API)
    strength.ts       # Spielstärke: Skill Level / UCI_Elo / Suchtiefe
  game/
    useGame.ts        # React-Hook: Partiezustand (chess.js), Züge, Undo, Neustart
  analysis/
    classify.ts       # Zugbewertung: Best/Gut/Ungenau/Fehler/Patzer (Centipawn-Verlust)
    motifs.ts         # Motiv-Erkennung: hängende Figur, Gabel, Fesselung, Matt verpasst …
    explain.ts        # Baut aus Bewertung + Motiv einen verständlichen Satz
  profile/
    profile.ts        # Schwächen-Profil, Statistiken, Elo-Schätzung, Speichern/Laden
  training/
    puzzles.ts        # Puzzles aus eigenen Fehlern erzeugen & abfragen
    adaptive.ts       # Stärke anpassen, Trainingsauswahl
  ui/
    Board.tsx, MoveList.tsx, EvalBar.tsx, CoachPanel.tsx, Settings.tsx, Stats.tsx
  App.tsx, main.tsx
public/
  stockfish/          # stockfish.js + .wasm (aus node_modules kopiert)
```

**Datenfluss:** Spielerzug → `chess.js` prüft → Engine bewertet Stellung vor/nach dem Zug
→ `classify` + `motifs` → `explain` → CoachPanel zeigt Erklärung → Profil wird aktualisiert
→ Engine spielt Antwortzug in gewählter Stärke.

## 4. Phasen

### Phase 0 – Setup
- [x] Node.js LTS installieren
- [x] Vite-Projekt (React + TS) anlegen, Git initialisieren
- [x] Abhängigkeiten: `chess.js`, `react-chessboard`, `stockfish`, `vitest`
- [x] Stockfish-Dateien nach `public/stockfish/` kopieren (Script)
- [x] `CLAUDE.md` mit Stack, Befehlen, Konventionen
- **Fertig wenn:** `npm run dev` zeigt eine leere App, `npm test` läuft.

### Phase 1 – Spielen gegen Stockfish
- [x] Engine-Wrapper: Worker starten, `uci`/`isready`, `position fen …`, `go`, `bestmove` parsen
- [x] Brett mit Drag & Drop, nur legale Züge, Bauernumwandlung
- [x] Farbe wählen (Weiss/Schwarz), Brett drehen
- [x] Stärke einstellen (Stufe 1–20 → Skill Level + Bedenkzeit)
- [x] Zugliste (SAN), Neues Spiel, Zug zurücknehmen
- [x] Spielende erkennen: Matt, Patt, Remis (50 Züge, Wiederholung, Material), Aufgabe
- **Fertig wenn:** Eine komplette Partie gegen Stockfish spielbar ist.

### Phase 2 – Analyse & Coach
- [x] Bewertungsleiste (Eval Bar) live
- [x] Nach jedem Spielerzug: Bewertung vorher (bester Zug) vs. nachher → Centipawn-Verlust
- [x] Klassifikation (über Gewinnwahrscheinlichkeit, damit ±10 nicht wie ±1 zählt):
      Bester / Gut / Ungenau / Fehler / Patzer (Schwellen 5 / 10 / 15 Prozentpunkte wie Lichess)
- [x] Motiv-Erkennung (regelbasiert):
  - Figur hängt (ungedeckt angegriffen) / Figur eingestellt
  - Gabel übersehen (eigene Chance oder gegnerische Drohung)
  - Fesselung / Spiess *(noch offen – kommt mit Phase 3/4)*
  - Matt in N verpasst / Mattdrohung übersehen
  - Ungünstiger Abtausch (Materialbilanz)
  - Eröffnungsprinzipien (Dame nicht zu früh, Springer nicht an den Rand, rechtzeitig rochieren)
- [x] Coach-Panel: Erklärung + besserer Zug als Pfeil auf dem Brett
- [x] „Nochmal versuchen“: Fehlerzug zurücknehmen und es selbst besser machen
- [x] Hinweis-Knopf (stufenweise: Figur → Feld → Zug)
- **Fertig wenn:** Jeder Fehler wird markiert und verständlich erklärt.

### Phase 3 – Schwächen-Profil & Puzzles
- [x] Profil speichern: Partien, Fehler pro Motiv, Fehler pro Spielphase (Eröffnung/Mittelspiel/Endspiel)
- [x] Statistik-Seite: Top-Schwächen, Genauigkeit pro Partie, Verlauf
- [x] Puzzles aus eigenen Fehlern: Stellung vor dem Fehler → „Finde den besten Zug“
- [x] Wiederholungs-Logik (Spaced Repetition): falsch gelöste Puzzles kommen öfter
- **Fertig wenn:** Nach ein paar Partien zeigt der Trainer deine Schwächen und übt sie.
- Umgesetzt: Profil in `localStorage`, Tabs Spielen/Training/Statistik, Puzzle-Lösung auch mit gleichwertigem Alternativzug (Engine-Check ≤ 3 Prozentpunkte).

### Phase 4 – Adaptives Training & Feinschliff
- [x] Spielstärke passt sich automatisch an (nach Ergebnis + Genauigkeit, abschaltbar)
- [x] Trainingsmodi: 6 Eröffnungen, 3 Endspiel-Übungen (K+D, K+T, Bauernendspiel) als Startstellungen mit Aufgabe
- [x] PGN-Export (Download) und Import mit kompletter Partie-Analyse (Tab „Analyse“, auch aus Statistik)
- [x] Design: dunkles Theme, Animationen, WebAudio-Sounds, Handy-tauglich (390 px getestet)
- [ ] Deploy auf GitLab/GitHub Pages
- **Fertig wenn:** Der Trainer ist im Alltag nutzbar und online erreichbar.

## 5. Bewertungs-Logik (Details)

- Engine liefert `score cp X` oder `score mate N` aus Sicht der Seite am Zug → immer auf Weiss normieren.
- Gewinnwahrscheinlichkeit (Lichess-Formel): `W = 50 + 50·(2/(1+e^(−0.00368·cp)) − 1)`.
- Verlust = W(bester Zug) − W(gespielter Zug) aus Sicht des Spielers:
  - < 5 → Gut (bzw. Bester, wenn = Engine-Zug), 5–10 → Ungenau, 10–15 → Fehler, ≥ 15 → Patzer
- Analyse-Tiefe 13 mit separater Coach-Engine (2. Worker), damit Spiel und Analyse sich nicht blockieren.

## 6. Risiken

- **Engine-Performance auf schwachen Geräten:** lite-Variante + begrenzte Tiefe.
- **Motiv-Erkennung ist heuristisch:** Lieber eine allgemeine Erklärung als eine falsche.
  Jede Regel bekommt Tests mit echten Stellungen (FEN).
- **Schwache Stufen spielen „unnatürlich“:** Skill Level + kleine Zufallsauswahl unter den Top-Zügen (MultiPV).
