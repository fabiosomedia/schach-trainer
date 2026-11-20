import type { Color } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StockfishEngine } from './engine/stockfish'
import {
  answerPuzzle,
  duePuzzles,
  emptyProfile,
  loadProfile,
  recordGame,
  saveProfile,
  type GameInput,
  type Profile,
} from './profile/profile'
import { adaptLevel, loadSettings, saveSettings, type Settings } from './profile/settings'
import { playSound } from './ui/sound'
import { PlayView } from './views/PlayView'
import { ReviewView } from './views/ReviewView'
import { StatsView } from './views/StatsView'
import { TrainingView } from './views/TrainingView'

type Tab = 'play' | 'train' | 'review' | 'stats'

/** Zwei Engines: eine spielt, eine analysiert – so blockieren sie sich nicht. */
function useEngines() {
  const [engines, setEngines] = useState<{ play: StockfishEngine; coach: StockfishEngine } | null>(null)
  useEffect(() => {
    const e = { play: new StockfishEngine(), coach: new StockfishEngine() }
    setEngines(e)
    return () => {
      e.play.terminate()
      e.coach.terminate()
    }
  }, [])
  return engines
}

function usePersisted<T>(load: () => T, save: (v: T) => void) {
  const [v, setV] = useState<T>(load)
  useEffect(() => save(v), [v, save])
  return [v, setV] as const
}

export default function App() {
  const engines = useEngines()
  const [profile, setProfile] = usePersisted<Profile>(loadProfile, saveProfile)
  const [settings, setSettings] = usePersisted<Settings>(loadSettings, saveSettings)
  const [tab, setTab] = useState<Tab>('play')
  const [toast, setToast] = useState<string | null>(null)
  const [review, setReview] = useState<{ pgn: string; color: Color; key: number } | null>(null)

  const set = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v })), [setSettings])

  // Refs, damit der Callback stabil bleibt und State-Updater frei von Nebenwirkungen sind
  const profileRef = useRef(profile)
  profileRef.current = profile
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const onGameFinished = useCallback(
    (g: GameInput) => {
      const next = recordGame(profileRef.current, g)
      setProfile(next)
      const s = settingsRef.current
      if (!s.autoLevel) return
      const lvl = adaptLevel(s.level, next.games[next.games.length - 1])
      if (lvl !== s.level) {
        setSettings({ ...s, level: lvl })
        setToast(`Stärke angepasst: Stufe ${s.level} → ${lvl}`)
      }
    },
    [setProfile, setSettings],
  )
  const onAnswer = useCallback(
    (id: string, correct: boolean) => {
      if (settings.sound) playSound(correct ? 'correct' : 'wrong')
      setProfile((p) => answerPuzzle(p, id, correct))
    },
    [setProfile, settings.sound],
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const due = duePuzzles(profile).length

  return (
    <div className="app">
      <header className="top">
        <h1>
          ♞ Schach<span>Trainer</span>
        </h1>
        <nav className="tabs">
          <button aria-pressed={tab === 'play'} onClick={() => setTab('play')}>
            Spielen
          </button>
          <button aria-pressed={tab === 'train'} onClick={() => setTab('train')}>
            Training {due > 0 && <span className="pill">{due}</span>}
          </button>
          <button aria-pressed={tab === 'review'} onClick={() => setTab('review')}>
            Analyse
          </button>
          <button aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>
            Statistik
          </button>
          <button
            className="icon"
            title={settings.sound ? 'Ton aus' : 'Ton an'}
            onClick={() => set('sound', !settings.sound)}
          >
            {settings.sound ? '🔊' : '🔇'}
          </button>
        </nav>
      </header>

      {/* Spielansicht bleibt gemountet, damit die laufende Partie beim Tab-Wechsel erhalten bleibt */}
      <div hidden={tab !== 'play'}>
        <PlayView
          engines={engines}
          level={settings.level}
          onLevelChange={(l) => set('level', l)}
          autoLevel={settings.autoLevel}
          onAutoLevelChange={(on) => set('autoLevel', on)}
          sound={settings.sound}
          onGameFinished={onGameFinished}
        />
      </div>
      {tab === 'train' && <TrainingView engine={engines?.coach ?? null} profile={profile} onAnswer={onAnswer} />}
      {tab === 'review' && <ReviewView engine={engines?.coach ?? null} initial={review} />}
      {tab === 'stats' && (
        <StatsView
          profile={profile}
          onReset={() => setProfile(emptyProfile())}
          onReview={(pgn, color) => {
            setReview({ pgn, color, key: Date.now() })
            setTab('review')
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
