import type { Color } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import '../analysis/review.css'
import { CATEGORY_INFO } from '../analysis/classify'
import { loadOpenings, openingBook, type OpeningBook } from '../analysis/openings'
import { MOTIF_INFO, PHASE_LABEL } from '../profile/motifInfo'
import { duePuzzles, gameOpening, mistakesByPhase, openingStats, weaknesses, type Profile } from '../profile/profile'

const OUTCOME = { win: { label: 'Sieg', cls: 'win' }, draw: { label: 'Remis', cls: 'draw' }, loss: { label: 'Niederlage', cls: 'loss' } }

type Props = { profile: Profile; onReset: () => void; onReview: (pgn: string, color: Color) => void }

export function StatsView({ profile, onReset, onReview }: Props) {
  const games = profile.games
  const wins = games.filter((g) => g.outcome === 'win').length
  const draws = games.filter((g) => g.outcome === 'draw').length
  const losses = games.length - wins - draws
  const recent = games.slice(-10)
  const avgAcc = recent.length ? recent.reduce((s, g) => s + g.accuracy, 0) / recent.length : 0
  const weak = weaknesses(profile).slice(0, 5)
  const phases = mistakesByPhase(profile)
  const phaseMax = Math.max(1, ...Object.values(phases))
  const last20 = games.slice(-20)
  // Buch für ältere Partien ohne gespeicherten Eröffnungsnamen
  const [book, setBook] = useState<OpeningBook | null>(openingBook())
  useEffect(() => {
    if (!book) loadOpenings().then(setBook, () => {})
  }, [book])
  const openings = useMemo(() => openingStats(profile, book).slice(0, 8), [profile, book])

  if (games.length === 0) {
    return (
      <main className="layout single">
        <div className="card empty">
          <h2>Statistik</h2>
          <p>Noch keine Partien gespielt. Nach deiner ersten Partie siehst du hier deine Stärken und Schwächen.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="stats">
      <div className="kpis">
        <div className="card kpi">
          <span>Partien</span>
          <strong>{games.length}</strong>
          <small>
            {wins} S · {draws} R · {losses} N
          </small>
        </div>
        <div className="card kpi">
          <span>Genauigkeit (letzte 10)</span>
          <strong>{Math.round(avgAcc)} %</strong>
          <small>Ø pro Zug, 100 = wie Stockfish</small>
        </div>
        <div className="card kpi">
          <span>Puzzles</span>
          <strong>{profile.puzzles.length}</strong>
          <small>{duePuzzles(profile).length} fällig</small>
        </div>
      </div>

      <div className="card">
        <h2>Genauigkeit im Verlauf</h2>
        <div className="spark">
          {last20.map((g) => (
            <div key={g.id} className="spark-col" title={`${new Date(g.date).toLocaleDateString('de-CH')}: ${g.accuracy} %`}>
              <div className={`spark-bar ${OUTCOME[g.outcome].cls}`} style={{ height: `${Math.max(4, g.accuracy)}%` }} />
            </div>
          ))}
        </div>
        <p className="muted-text small">Letzte {last20.length} Partien · Farbe = Ergebnis</p>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Deine grössten Schwächen</h2>
          {weak.length === 0 && <p className="muted-text">Noch keine Fehler erkannt – stark!</p>}
          <ol className="weak-list">
            {weak.map((w) => (
              <li key={w.motif}>
                <div className="weak-head">
                  <strong>{MOTIF_INFO[w.motif].label}</strong>
                  <span className="muted-text">{w.count}×</span>
                </div>
                <p>{MOTIF_INFO[w.motif].advice}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="card">
          <h2>Fehler nach Spielphase</h2>
          {(Object.keys(phases) as (keyof typeof phases)[]).map((ph) => (
            <div key={ph} className="phase-row">
              <span>{PHASE_LABEL[ph]}</span>
              <div className="phase-bar">
                <div style={{ width: `${(phases[ph] / phaseMax) * 100}%` }} />
              </div>
              <span className="muted-text">{phases[ph]}</span>
            </div>
          ))}
          <p className="muted-text small">Fehler und Patzer, ohne Ungenauigkeiten.</p>
        </div>
      </div>

      <div className="card">
        <h2>Eröffnungen</h2>
        {openings.length === 0 ? (
          <p className="muted-text">Noch keine Eröffnung erkannt.</p>
        ) : (
          <table className="games openings">
            <thead>
              <tr>
                <th>Eröffnung</th>
                <th>Partien</th>
                <th>Punkte</th>
                <th>Ø Genauigkeit</th>
              </tr>
            </thead>
            <tbody>
              {openings.map((o) => (
                <tr key={o.family}>
                  <td>{o.family}</td>
                  <td title={`${o.wins} S · ${o.draws} R · ${o.losses} N`}>{o.games}</td>
                  <td>{Math.round(o.score)} %</td>
                  <td>{Math.round(o.accuracy)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted-text small">Nach Eröffnungsfamilie (Lichess-Eröffnungsliste) · Punkte: Sieg 1, Remis ½.</p>
      </div>

      <div className="card">
        <h2>Letzte Partien</h2>
        <table className="games">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Farbe</th>
              <th>Eröffnung</th>
              <th>Stufe</th>
              <th>Ergebnis</th>
              <th>Genauigkeit</th>
              <th>Fehler</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...games].reverse().slice(0, 15).map((g) => (
              <tr key={g.id}>
                <td>{new Date(g.date).toLocaleDateString('de-CH')}</td>
                <td>{g.playerColor === 'w' ? '○ Weiss' : '● Schwarz'}</td>
                <td className="opening-cell" title={gameOpening(g, book) ?? undefined}>
                  {gameOpening(g, book) ?? '–'}
                </td>
                <td>{g.level}</td>
                <td className={OUTCOME[g.outcome].cls} title={g.reason}>
                  {OUTCOME[g.outcome].label}
                </td>
                <td>{g.accuracy} %</td>
                <td>
                  <span style={{ color: CATEGORY_INFO.mistake.color }}>? {g.counts.mistake}</span>{' '}
                  <span style={{ color: CATEGORY_INFO.blunder.color }}>?? {g.counts.blunder}</span>
                </td>
                <td>
                  <button className="link" onClick={() => onReview(g.pgn, g.playerColor)} disabled={!g.pgn}>
                    Analysieren
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="danger"
        onClick={() => {
          if (confirm('Wirklich alle Partien, Fehler und Puzzles löschen?')) onReset()
        }}
      >
        Profil zurücksetzen
      </button>
    </main>
  )
}
