import { useCallback, useEffect, useState } from 'react'
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
import { PlayView } from './views/PlayView'
import { StatsView } from './views/StatsView'
import { TrainingView } from './views/TrainingView'

type Tab = 'play' | 'train' | 'stats'

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

function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  useEffect(() => saveProfile(profile), [profile])
  return [profile, setProfile] as const
}

export default function App() {
  const engines = useEngines()
  const [profile, setProfile] = useProfile()
  const [tab, setTab] = useState<Tab>('play')
  const [level, setLevel] = useState(3)

  const onGameFinished = useCallback((g: GameInput) => setProfile((p) => recordGame(p, g)), [setProfile])
  const onAnswer = useCallback(
    (id: string, correct: boolean) => setProfile((p) => answerPuzzle(p, id, correct)),
    [setProfile],
  )
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
          <button aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>
            Statistik
          </button>
        </nav>
      </header>

      {/* Spielansicht bleibt gemountet, damit die laufende Partie beim Tab-Wechsel erhalten bleibt */}
      <div hidden={tab !== 'play'}>
        <PlayView engines={engines} level={level} onLevelChange={setLevel} onGameFinished={onGameFinished} />
      </div>
      {tab === 'train' && <TrainingView engine={engines?.coach ?? null} profile={profile} onAnswer={onAnswer} />}
      {tab === 'stats' && <StatsView profile={profile} onReset={() => setProfile(emptyProfile())} />}
    </div>
  )
}
