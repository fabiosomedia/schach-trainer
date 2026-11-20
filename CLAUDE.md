# Schach-Trainer

Browser-Schachtrainer: Spieler spielt gegen Stockfish, jeder Zug wird analysiert und
erklärt, Schwächen werden gespeichert und gezielt trainiert. **Gratis, keine KI, kein Server.**
Detaillierter Plan und Phasen-Checklisten: `PLAN.md` (nach jeder Phase abhaken).

## Stack
TypeScript · React 19 · Vite · `chess.js` (Regeln) · `react-chessboard` v5 (API: `<Chessboard options={{...}} />`)
· `stockfish` 19 lite single-threaded WASM im Web Worker · Vitest · playwright-core (nur Smoke-Test, nutzt installiertes Edge).

## Online
https://fabiosomedia.github.io/schach-trainer/ – jeder Push auf `main` testet, baut und veröffentlicht via GitHub Actions
(`.github/workflows/deploy.yml`). Repo: github.com/fabiosomedia/schach-trainer (öffentlich).
`gh` liegt portabel in `C:\Users\fbrazerol\tools\gh\bin`. Commits nur mit der GitHub-noreply-Adresse (ist in der Repo-Git-Config gesetzt).

## Befehle
Node liegt portabel in `C:\Users\fbrazerol\tools\node` (im User-PATH; in alten Shells ggf. voranstellen).
- `npm run dev` – Dev-Server
- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Typecheck + Produktions-Build
- Browser-Tests (brauchen `npm run build` + laufendes `npm run preview` auf :4173):
  `node scripts/e2e-smoke.mjs` (Spiel + Coach), `e2e-phase3.mjs` (Profil, Puzzle, Statistik), `e2e-phase4.mjs` (Endspiel, PGN-Analyse)
  `e2e-online.mjs` (zwei Browser-Seiten spielen online gegeneinander; braucht Internet für den PeerJS-Server)
  `e2e-play.mjs` (Spielansicht: Uhr inkl. Zeitüberschreitung ~1 Min., Premove, Brett drehen, Brettfarben, Handy-Layout)
  `e2e-browse.mjs` (in laufender Partie zurückblättern), `e2e-puzzles.mjs` (Taktik-Puzzles, Sprint)
  Selektoren: Brettfelder über `#<board-id>-square-e4` (IDs: play / puzzle / review / online / tactics / sprint); Spiel- und Online-Ansicht bleiben versteckt gemountet → `:visible` nutzen
- `npm install` kopiert die Engine via `postinstall` nach `public/stockfish/` (nicht committen)

## Struktur
- `src/engine/` – `stockfish.ts` (Worker-Wrapper, serielle Queue), `uci.ts` (reine Parser), `strength.ts` (Stufen 1–10)
- `src/game/` – `useGame.ts` (Partiezustand, Engine-Antwort), `status.ts` (Spielende, Schach)
- `src/game/positions.ts` – Startstellungen (Eröffnungen, Endspiel-Übungen)
- `src/game/clock.ts` (Schachuhr gegen den Computer, rein), `useClock.ts`, `material.ts` (geschlagene Figuren, Materialbilanz)
- `src/analysis/` – `explain.ts` (Einstufung + Motiv-Erkennung → Erklärtext), `motifs.ts` (Fesselung, Spiess, Abzug, Grundreihe, Doppelangriff, gefangene Figur),
  `openings.ts` (Eröffnungsbuch, Buchzüge; Daten `src/data/openings.json`, neu erzeugen mit `node scripts/build-openings.mjs`),
  `gameReview.ts` (Schlüsselmomente, Leistungsschätzung), `EvalGraph.tsx`, `useCoach.ts` (2. Engine, Analyse-Cache), `eval.ts`, `pieces.ts`
- `src/puzzles/` – Taktik-Puzzles (Lichess-DB, CC0, `public/puzzles/*.json`, erzeugt mit `scripts/build-puzzles.py`), Puzzle-Wertung, Sprint
- Weitere Browser-Tests: `e2e-review.mjs` (Opera-Partie analysieren, Eröffnung, Bewertungskurve)
- `src/profile/` – `profile.ts` (Partien, Fehler, Puzzles/Leitner, Schwächen; localStorage), `settings.ts` (Stufe, Auto-Stufe, Ton), `motifInfo.ts`
- `src/online/` – Online-Partien per WebRTC (`peerjs`, gratis öffentlicher PeerServer nur zur Vermittlung): `protocol.ts` (Nachrichten, Zustand, Gastgeber führt die Uhr), `clock.ts`, `connection.ts` (Verbindung, Herzschlag, Wiederverbinden)
- `src/views/` – PlayView, TrainingView, ReviewView, StatsView, OnlineView (`?join=<peerId>` öffnet den Tab); `src/ui/` – Board, CoachPanel, EvalBar, MoveList, sound

## Konventionen
- UI-Texte auf Deutsch (Hochdeutsch, „ss“ statt „ß“).
- Engine-Scores kommen aus Sicht der Seite am Zug – vor Vergleichen immer auf Weiss normieren.
- Reine Logik (Parser, Analyse, Profil) ohne React/Worker schreiben und mit Tests absichern;
  Motiv-Regeln mit echten FEN-Stellungen testen.
- Lieber eine allgemeine Erklärung als eine falsche.
