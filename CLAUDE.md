# Schach-Trainer

Browser-Schachtrainer: Spieler spielt gegen Stockfish, jeder Zug wird analysiert und
erklärt, Schwächen werden gespeichert und gezielt trainiert. **Gratis, keine KI, kein Server.**
Detaillierter Plan und Phasen-Checklisten: `PLAN.md` (nach jeder Phase abhaken).

## Stack
TypeScript · React 19 · Vite · `chess.js` (Regeln) · `react-chessboard` v5 (API: `<Chessboard options={{...}} />`)
· `stockfish` 19 lite single-threaded WASM im Web Worker · Vitest · playwright-core (nur Smoke-Test, nutzt installiertes Edge).

## Befehle
Node liegt portabel in `C:\Users\fbrazerol\tools\node` (im User-PATH; in alten Shells ggf. voranstellen).
- `npm run dev` – Dev-Server
- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Typecheck + Produktions-Build
- `npm run preview` + `node scripts/e2e-smoke.mjs` – Browser-Rauchtest (spielt e2-e4, wartet auf Engine-Antwort)
- `npm install` kopiert die Engine via `postinstall` nach `public/stockfish/` (nicht committen)

## Struktur
- `src/engine/` – `stockfish.ts` (Worker-Wrapper, serielle Queue), `uci.ts` (reine Parser), `strength.ts` (Stufen 1–10)
- `src/game/` – `useGame.ts` (Partiezustand, Engine-Antwort), `status.ts` (Spielende, Schach)
- `src/analysis/` – Zugbewertung & Motiv-Erkennung (Phase 2)
- `src/ui/` – React-Komponenten

## Konventionen
- UI-Texte auf Deutsch (Hochdeutsch, „ss“ statt „ß“).
- Engine-Scores kommen aus Sicht der Seite am Zug – vor Vergleichen immer auf Weiss normieren.
- Reine Logik (Parser, Analyse, Profil) ohne React/Worker schreiben und mit Tests absichern;
  Motiv-Regeln mit echten FEN-Stellungen testen.
- Lieber eine allgemeine Erklärung als eine falsche.
