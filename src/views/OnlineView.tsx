import { Chess, type Color, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkedKingSquare } from '../game/status'
import { OnlineLink, RECONNECT_MS, type LinkStatus } from '../online/connection'
import { formatClock, hasClock, TIME_CONTROLS } from '../online/clock'
import {
  claimWin,
  cleanName,
  colorOf,
  currentClocks,
  hostTick,
  joinIdFromSearch,
  localDraw,
  localMove,
  localRematch,
  localResign,
  MAX_CHAT,
  MAX_NAME,
  newSession,
  otherRole,
  receive,
  replay,
  sessionPgn,
  toSnapshot,
  toUci,
  turnOf,
  type Msg,
  type Role,
  type Session,
  type Step,
} from '../online/protocol'
import '../online/online.css'
import { Board } from '../ui/Board'
import { MoveList } from '../ui/MoveList'
import { playSound } from '../ui/sound'

type Props = {
  sound: boolean
  /** Beendete Partie in der Analyse öffnen. */
  onReview?: (pgn: string, color: Color) => void
}

type ColorChoice = 'w' | 'b' | 'random'
type ChatLine = { from: 'me' | 'them' | 'info'; text: string }

const NAME_KEY = 'online-name'
const loadName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n)
  } catch {
    /* privater Modus */
  }
}

const NO_ANALYSES = {}

export function OnlineView({ sound, onReview }: Props) {
  const [joinId, setJoinId] = useState<string | null>(() => joinIdFromSearch(location.search))
  const [role, setRole] = useState<Role | null>(() => (joinId ? 'guest' : null))
  const [tcId, setTcId] = useState('5+0')
  const [colorChoice, setColorChoice] = useState<ColorChoice>('random')
  const [name, setName] = useState(loadName)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [link, setLink] = useState<{ status: LinkStatus; info?: string; since: number }>({ status: 'starting', since: 0 })
  const [session, setSession] = useState<Session | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [chatText, setChatText] = useState('')
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const linkRef = useRef<OnlineLink | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const roleRef = useRef<Role | null>(role)
  roleRef.current = role
  const setupRef = useRef({ tcId, colorChoice, name })
  setupRef.current = { tcId, colorChoice, name }

  const commit = useCallback((r: Step | null) => {
    if (!r) return
    sessionRef.current = r.s
    setSession(r.s)
    for (const m of r.out) linkRef.current?.send(m)
  }, [])

  const addChat = useCallback((l: ChatLine) => setChat((c) => [...c.slice(-99), l]), [])

  const onMessage = useCallback(
    (m: Msg) => {
      const r = roleRef.current
      const s = sessionRef.current
      const t = Date.now()
      if (m.t === 'chat') {
        addChat({ from: 'them', text: m.text })
        return
      }
      if (m.t === 'hello' && r === 'host') {
        if (!s) {
          const { tcId: tc, colorChoice: cc, name: n } = setupRef.current
          const hostColor: Color = cc === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : cc
          const next = newSession({ hostColor, tcId: tc, names: { host: cleanName(n, 'Gastgeber'), guest: m.name }, now: t })
          commit({ s: next, out: [{ t: 'sync', s: toSnapshot(next, t) }] })
          addChat({ from: 'info', text: `${m.name} ist beigetreten.` })
        } else {
          const next = { ...s, names: { ...s.names, guest: m.name } }
          commit({ s: next, out: [{ t: 'sync', s: toSnapshot(next, t) }] })
          addChat({ from: 'info', text: `${m.name} ist wieder verbunden.` })
        }
        return
      }
      if (r === 'guest' && m.t === 'sync' && !s) {
        commit(receive(newSession({ hostColor: 'w', tcId: 'none', names: { host: '', guest: '' }, now: t }), 'guest', m, t))
        return
      }
      if (!s || !r) return
      commit(receive(s, r, m, t))
    },
    [addChat, commit],
  )

  const startLink = useCallback(
    (r: Role, hostId?: string) => {
      linkRef.current?.close()
      const ev = {
        onStatus: (status: LinkStatus, info?: string) => setLink({ status, info, since: Date.now() }),
        onMessage,
        onReady: (id: string) => setPeerId(id),
      }
      linkRef.current = r === 'host' ? OnlineLink.host(ev) : OnlineLink.join(hostId!, cleanName(setupRef.current.name, 'Gast'), ev)
    },
    [onMessage],
  )

  // Einladungslink geöffnet → automatisch verbinden
  useEffect(() => {
    if (joinId) startLink('guest', joinId)
  }, [joinId, startLink])
  useEffect(() => () => linkRef.current?.close(), [])

  const createGame = () => {
    saveName(name)
    setRole('host')
    roleRef.current = 'host'
    startLink('host')
  }

  const leave = () => {
    linkRef.current?.close()
    linkRef.current = null
    sessionRef.current = null
    setSession(null)
    setRole(null)
    setPeerId(null)
    setJoinId(null)
    setChat([])
    setLink({ status: 'starting', since: 0 })
    if (location.search.includes('join=')) history.replaceState(null, '', location.pathname)
  }

  // --- Partie ---
  const sessionMoves = session?.moves
  const chess = useMemo(() => (sessionMoves ? (replay(sessionMoves) ?? new Chess()) : new Chess()), [sessionMoves])
  const moves = useMemo(() => chess.history({ verbose: true }), [chess])
  const me: Color = session && role ? colorOf(session, role) : (colorChoice === 'b' ? 'b' : 'w')
  const opp: Color = me === 'w' ? 'b' : 'w'
  const result = session?.result ?? null
  const myTurn = !!session && !result && turnOf(session) === me
  const clocks = session ? currentClocks(session, now) : null
  const checkSquare = useMemo(() => checkedKingSquare(chess), [chess])

  // Uhr-Takt; der Gastgeber prüft dabei auf Zeitüberschreitung
  const running = !!session && !result && !!session.clocks
  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (roleRef.current === 'host' && sessionRef.current) commit(hostTick(sessionRef.current, t))
    }, 100)
    return () => clearInterval(iv)
  }, [running, commit])
  // Für den Verbindungs-Countdown
  useEffect(() => {
    if (link.status !== 'reconnecting') return
    const iv = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(iv)
  }, [link.status])

  const legalTargets = useCallback(
    (from: Square) => chess.moves({ square: from, verbose: true }).map((m) => m.to),
    [chess],
  )
  const needsPromotion = useCallback(
    (from: Square, to: Square) => {
      const p = chess.get(from)
      return !!p && p.type === 'p' && (to[1] === '8' || to[1] === '1')
    },
    [chess],
  )
  const onMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const s = sessionRef.current
      const r = roleRef.current
      if (!s || !r) return false
      const step = localMove(s, r, toUci(from, to, promotion), Date.now())
      commit(step)
      return !!step
    },
    [commit],
  )

  // Töne bei neuen Zügen und Partieende
  const heard = useRef({ n: 0, g: 0, over: false })
  useEffect(() => {
    if (!session) return
    const h = heard.current
    const n = session.moves.length
    const over = !!session.result
    if (sound && session.gameNo === h.g) {
      if (over && !h.over) {
        const won = (session.result!.result === '1-0' && me === 'w') || (session.result!.result === '0-1' && me === 'b')
        playSound(session.result!.result === '1/2-1/2' ? 'move' : won ? 'win' : 'lose')
      } else if (n > h.n) {
        const last = moves[moves.length - 1]
        if (last) playSound(last.san.includes('+') ? 'check' : last.captured ? 'capture' : 'move')
      }
    }
    heard.current = { n, g: session.gameNo, over }
  }, [session, sound, me, moves])

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatText.trim().slice(0, MAX_CHAT)
    if (!text || link.status !== 'connected') return
    linkRef.current?.send({ t: 'chat', text })
    addChat({ from: 'me', text })
    setChatText('')
  }
  const chatRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.length])

  const inviteUrl = peerId ? `${location.origin}${location.pathname}?join=${peerId}` : ''
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      const el = document.getElementById('online-invite') as HTMLInputElement | null
      el?.select()
      document.execCommand?.('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const act = (f: (s: Session, r: Role) => Step | null) => {
    const s = sessionRef.current
    const r = roleRef.current
    if (s && r) commit(f(s, r))
  }

  // --- Texte ---
  const names = session?.names
  const myName = names && role ? names[role] : cleanName(name, 'Du')
  const oppName = names && role ? names[otherRole(role)] || 'Gegner' : 'Gegner'
  const disconnected = link.status === 'reconnecting' || link.status === 'lost'
  const reconnectLeft = Math.max(0, Math.ceil((RECONNECT_MS - (now - link.since)) / 1000))

  let statusText: string
  let statusClass = ''
  if (!role) statusText = 'Spiele online gegen Freunde – erstelle eine Partie und schicke den Link.'
  else if (link.status === 'error') {
    statusText = link.info ?? 'Verbindungsfehler'
    statusClass = 'bad'
  } else if (!session) {
    statusText =
      link.status === 'starting'
        ? 'Verbinde mit dem Vermittlungs-Server …'
        : link.status === 'waiting'
          ? 'Warte auf Gegner …'
          : 'Verbinde mit der Partie …'
    statusClass = 'thinking'
  } else if (result) {
    const won = (result.result === '1-0' && me === 'w') || (result.result === '0-1' && me === 'b')
    statusText = `${result.result === '1/2-1/2' ? 'Remis' : won ? 'Du hast gewonnen! 🎉' : `${oppName} gewinnt`} – ${result.reason}`
    statusClass = 'over'
  } else if (myTurn) statusText = checkSquare ? 'Schach! Du bist am Zug' : 'Du bist am Zug'
  else statusText = `${oppName} ist am Zug …`

  const lastMove = moves[moves.length - 1]
  const showClock = !!session && hasClock(session.tc)

  const playerBar = (c: Color, label: string, mine: boolean) => {
    const active = !!session && !result && turnOf(session) === c
    const ms = clocks?.[c] ?? 0
    return (
      <div className={`online-player ${active ? 'active' : ''}`}>
        <span className={`online-dot ${c}`} />
        <span className="online-name">
          {label}
          {mine && label !== 'Du' && <span className="muted-text small"> (du)</span>}
        </span>
        {showClock && (
          <span id={`online-clock-${mine ? 'me' : 'opp'}`} className={`online-clock ${active ? 'running' : ''} ${ms < 20_000 ? 'low' : ''}`}>
            {formatClock(ms)}
          </span>
        )}
      </div>
    )
  }

  return (
    <main className="layout online">
      <section className="board-col">
        <div className={`status ${statusClass}`} id="online-status">
          {statusText}
        </div>
        {disconnected && session && (
          <div className="online-banner">
            {link.status === 'reconnecting' ? (
              <span>Verbindung unterbrochen – versuche neu zu verbinden … ({reconnectLeft} s)</span>
            ) : (
              <>
                <span>{oppName} ist nicht mehr erreichbar.</span>
                {!result && (
                  <button className="primary" onClick={() => act(claimWin)}>
                    🏆 Sieg beanspruchen
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {playerBar(opp, oppName, false)}
        <div className="board-row">
          <Board
            id="online"
            fen={chess.fen()}
            orientation={me}
            lastMove={lastMove}
            checkSquare={checkSquare}
            canMove={myTurn}
            legalTargets={legalTargets}
            needsPromotion={needsPromotion}
            onMove={onMove}
          />
        </div>
        {playerBar(me, myName, true)}
      </section>

      <aside className="panel">
        {!role && (
          <div className="card">
            <h2>Online-Partie</h2>
            <p className="muted-text small">
              Direkt von Browser zu Browser – gratis, ohne Konto. Erstelle eine Partie und schicke den Link an deinen
              Gegner.
            </p>
            <div className="field">
              <span>Bedenkzeit</span>
              <div className="online-tc">
                {TIME_CONTROLS.map((t) => (
                  <button key={t.id} aria-pressed={tcId === t.id} onClick={() => setTcId(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Deine Farbe</span>
              <div className="seg">
                {(
                  [
                    ['w', '○ Weiss'],
                    ['b', '● Schwarz'],
                    ['random', '◐ Zufall'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} aria-pressed={colorChoice === v} onClick={() => setColorChoice(v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Dein Name (optional)</span>
              <input
                id="online-name"
                className="online-input"
                value={name}
                maxLength={MAX_NAME}
                placeholder="z. B. Ritter Kunibert"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="primary" id="online-create" onClick={createGame}>
              ⚔ Partie erstellen
            </button>
          </div>
        )}

        {role === 'host' && !session && (
          <div className="card">
            <h2>Einladung</h2>
            {peerId ? (
              <>
                <p className="small">Schicke diesen Link an deinen Gegner:</p>
                <div className="online-invite">
                  <input id="online-invite" className="online-input" readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
                  <button onClick={copyInvite}>{copied ? '✓ Kopiert' : '⧉ Kopieren'}</button>
                </div>
                <p className="online-wait">Warte auf Gegner …</p>
              </>
            ) : (
              <p className="online-wait">{link.status === 'error' ? link.info : 'Einladung wird erstellt …'}</p>
            )}
            <button onClick={leave}>Abbrechen</button>
          </div>
        )}

        {role === 'guest' && !session && (
          <div className="card">
            <h2>Beitreten</h2>
            <p className="online-wait">{link.status === 'error' ? link.info : 'Verbinde mit der Partie …'}</p>
            <button onClick={leave}>{link.status === 'error' ? 'Zurück' : 'Abbrechen'}</button>
          </div>
        )}

        {session && (
          <div className="card">
            <h2>Partie</h2>
            <div className="online-conn">
              <span className={`online-led ${link.status}`} />
              {link.status === 'connected'
                ? `Verbunden mit ${oppName}`
                : link.status === 'reconnecting'
                  ? 'Verbindung unterbrochen …'
                  : link.status === 'lost'
                    ? 'Gegner nicht erreichbar'
                    : link.status === 'error'
                      ? 'Verbindungsfehler'
                      : 'Verbinde …'}
              <span className="muted-text small online-tclabel">{session.tc.label}</span>
            </div>

            {!result && session.drawOffer === otherRole(role!) && (
              <div className="online-offer">
                <span>{oppName} bietet Remis an.</span>
                <div className="row">
                  <button className="primary" onClick={() => act((s, r) => localDraw(s, r, 'accept'))}>
                    Annehmen
                  </button>
                  <button onClick={() => act((s, r) => localDraw(s, r, 'decline'))}>Ablehnen</button>
                </div>
              </div>
            )}
            {!result && (
              <div className="row">
                <button id="online-resign" onClick={() => confirm('Wirklich aufgeben?') && act(localResign)}>
                  🏳 Aufgeben
                </button>
                <button
                  id="online-draw"
                  onClick={() => act((s, r) => localDraw(s, r, 'offer'))}
                  disabled={!!session.drawOffer || link.status !== 'connected'}
                >
                  {session.drawOffer === role ? 'Remis angeboten …' : '½ Remis anbieten'}
                </button>
              </div>
            )}

            {result && (
              <>
                {session.rematchOffer === otherRole(role!) ? (
                  <div className="online-offer">
                    <span>{oppName} möchte eine Revanche.</span>
                    <div className="row">
                      <button className="primary" id="online-rematch-accept" onClick={() => act((s, r) => localRematch(s, r, 'accept', Date.now()))}>
                        Annehmen
                      </button>
                      <button onClick={() => act((s, r) => localRematch(s, r, 'decline', Date.now()))}>Ablehnen</button>
                    </div>
                  </div>
                ) : (
                  <button
                    id="online-rematch"
                    onClick={() => act((s, r) => localRematch(s, r, 'offer', Date.now()))}
                    disabled={!!session.rematchOffer || link.status !== 'connected'}
                  >
                    {session.rematchOffer === role ? 'Revanche angeboten …' : '⟳ Revanche (Farben tauschen)'}
                  </button>
                )}
                {onReview && moves.length > 0 && (
                  <button className="primary" id="online-review" onClick={() => onReview(sessionPgn(session), me)}>
                    🔍 Partie analysieren
                  </button>
                )}
              </>
            )}
            <button className="link" onClick={() => (result || confirm('Partie wirklich verlassen?')) && leave()}>
              Online-Partie verlassen
            </button>
          </div>
        )}

        {session && (
          <div className="card">
            <h2>Züge</h2>
            <MoveList moves={moves} analyses={NO_ANALYSES} />
          </div>
        )}

        {session && (
          <div className="card">
            <h2>Chat</h2>
            <div className="online-chat" ref={chatRef}>
              {chat.length === 0 && <div className="muted small">Noch keine Nachrichten</div>}
              {chat.map((l, i) => (
                <div key={i} className={`online-msg ${l.from}`}>
                  {l.from === 'info' ? l.text : (
                    <>
                      <strong>{l.from === 'me' ? myName : oppName}:</strong> {l.text}
                    </>
                  )}
                </div>
              ))}
            </div>
            <form className="online-chat-form" onSubmit={sendChat}>
              <input
                id="online-chat-input"
                className="online-input"
                value={chatText}
                maxLength={MAX_CHAT}
                placeholder="Nachricht …"
                onChange={(e) => setChatText(e.target.value)}
              />
              <button type="submit" disabled={!chatText.trim() || link.status !== 'connected'}>
                Senden
              </button>
            </form>
          </div>
        )}
      </aside>
    </main>
  )
}
