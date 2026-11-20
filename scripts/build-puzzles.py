"""Baut die Taktik-Puzzle-Bibliothek aus der Lichess-Puzzle-Datenbank (CC0).

Die Datei https://database.lichess.org/lichess_db_puzzle.csv.zst ist gross. Sie wird
deshalb nur gestreamt (zstd-Dekompression im Fluss), und der Download bricht ab,
sobald jedes Wertungsband genug Kandidaten hat. Nichts davon wird gespeichert,
nur das Ergebnis in public/puzzles/.

Aufruf (aus dem Repo-Wurzelordner):
    python -m pip install --user zstandard
    python -I scripts/build-puzzles.py [ziel-ordner]

Ausgabe:
    public/puzzles/index.json        Baender, Anzahl, Themen pro Band
    public/puzzles/r0400.json ...    je Band ein Array [id, fen, zuege, wertung, themen]
"""
import csv
import io
import json
import os
import sys
import urllib.request

import zstandard

URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "puzzles")

BAND_SIZE = 200
BANDS = list(range(400, 2600, BAND_SIZE))  # 400, 600, ..., 2400 -> 11 Baender
TARGET_TOTAL = 4000
PER_BAND = -(-TARGET_TOTAL // len(BANDS))  # aufrunden
CANDIDATES_PER_BAND = PER_BAND * 4
MAX_ROWS = 3_000_000

MIN_POPULARITY = 80
MIN_PLAYS = 500
MAX_RD = 90

# Themen, die wir behalten (alle anderen Lichess-Tags werden weggelassen, spart Platz).
THEMES = {
    "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5", "backRankMate", "smotheredMate",
    "fork", "pin", "skewer", "hangingPiece", "discoveredAttack", "doubleCheck", "deflection",
    "attraction", "sacrifice", "promotion", "advancedPawn", "trappedPiece", "interference",
    "clearance", "intermezzo", "quietMove", "xRayAttack", "zugzwang", "capturingDefender",
    "exposedKing", "kingsideAttack", "queensideAttack", "defensiveMove", "endgame",
    "rookEndgame", "pawnEndgame", "queenEndgame", "bishopEndgame", "knightEndgame",
    "opening", "middlegame", "oneMove", "short", "long", "veryLong", "mate",
}
# Motive, auf deren Abdeckung bei der Auswahl geachtet wird
FOCUS = [
    "fork", "pin", "skewer", "mateIn1", "mateIn2", "mateIn3", "backRankMate", "hangingPiece",
    "discoveredAttack", "endgame", "promotion", "sacrifice", "deflection", "attraction",
    "trappedPiece", "doubleCheck", "smotheredMate", "interference", "clearance", "intermezzo",
    "quietMove", "xRayAttack", "zugzwang", "capturingDefender", "rookEndgame", "pawnEndgame",
    "advancedPawn", "exposedKing", "defensiveMove",
]


def band_of(rating):
    if rating < BANDS[0] or rating >= BANDS[-1] + BAND_SIZE:
        return None
    return BANDS[0] + (rating - BANDS[0]) // BAND_SIZE * BAND_SIZE


def stream_rows():
    req = urllib.request.Request(URL, headers={"User-Agent": "puzzle-builder"})
    with urllib.request.urlopen(req) as resp:
        reader = zstandard.ZstdDecompressor().stream_reader(resp)
        text = io.TextIOWrapper(reader, encoding="utf-8", newline="")
        yield from csv.DictReader(text)


def main():
    cand = {b: [] for b in BANDS}
    seen = 0
    for row in stream_rows():
        seen += 1
        if seen > MAX_ROWS:
            break
        if seen % 100000 == 0:
            print(seen, {k: len(v) for k, v in cand.items()}, flush=True)
        try:
            rating = int(row["Rating"])
            if int(row["Popularity"]) < MIN_POPULARITY or int(row["NbPlays"]) < MIN_PLAYS or int(row["RatingDeviation"]) > MAX_RD:
                continue
        except (KeyError, ValueError, TypeError):
            continue
        b = band_of(rating)
        if b is None or len(cand[b]) >= CANDIDATES_PER_BAND:
            continue
        moves = row["Moves"].split()
        if len(moves) < 2:
            continue
        themes = [t for t in row["Themes"].split() if t in THEMES]
        cand[b].append({
            "id": row["PuzzleId"], "fen": row["FEN"], "moves": " ".join(moves), "rating": rating,
            "themes": themes, "pop": int(row["Popularity"]),
        })
        if all(len(v) >= CANDIDATES_PER_BAND for v in cand.values()):
            break
    print("Zeilen gelesen:", seen)

    os.makedirs(OUT, exist_ok=True)
    index = {"source": "Lichess-Puzzle-Datenbank (CC0), database.lichess.org", "bandSize": BAND_SIZE, "bands": []}
    for b in BANDS:
        pool = cand[b]
        counts = {t: 0 for t in FOCUS}
        chosen = []
        # Gierig: immer das Puzzle, dessen Motive bisher am wenigsten vertreten sind
        while pool and len(chosen) < PER_BAND:
            best_i, best_score = 0, -1.0
            for i, p in enumerate(pool):
                # seltenstes Motiv zählt (Summe würde Puzzles mit vielen Tags, v. a. Endspiele, bevorzugen)
                rarity = [1.0 / (1 + counts[t]) for t in p["themes"] if t in counts]
                score = (max(rarity) if rarity else 0.0) + p["pop"] / 10000
                if score > best_score:
                    best_i, best_score = i, score
            p = pool.pop(best_i)
            for t in p["themes"]:
                if t in counts:
                    counts[t] += 1
            chosen.append(p)
        chosen.sort(key=lambda p: p["rating"])
        data = [[p["id"], p["fen"], p["moves"], p["rating"], " ".join(p["themes"])] for p in chosen]
        name = f"r{b:04d}.json"
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, separators=(",", ":"))
        theme_counts = {}
        for p in chosen:
            for t in p["themes"]:
                theme_counts[t] = theme_counts.get(t, 0) + 1
        index["bands"].append({"min": b, "max": b + BAND_SIZE - 1, "file": name, "count": len(chosen), "themes": theme_counts})
        print(name, len(chosen))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
