// WebRTC-Verbindung über PeerJS (gratis öffentlicher PeerServer nur für den Verbindungsaufbau,
// die Partie selbst läuft direkt von Browser zu Browser).
import type { DataConnection, Peer as PeerT } from 'peerjs'
import { parseMessage, PROTOCOL_VERSION, type Msg } from './protocol'

export type LinkStatus =
  | 'starting' // Verbindung zum Vermittlungs-Server
  | 'waiting' // Gastgeber wartet auf Gegner
  | 'connecting' // Gast verbindet sich
  | 'connected'
  | 'reconnecting' // Verbindung weg, wird neu aufgebaut
  | 'lost' // länger als RECONNECT_MS weg (es wird weiter versucht)
  | 'error'

export type LinkEvents = {
  onStatus: (s: LinkStatus, info?: string) => void
  onMessage: (m: Msg) => void
  /** Gastgeber: eigene Peer-ID ist bekannt (für den Einladungslink). */
  onReady?: (peerId: string) => void
}

const PING_MS = 2000
const TIMEOUT_MS = 7000
const RETRY_MS = 3000
export const RECONNECT_MS = 30_000

async function createPeer(): Promise<PeerT> {
  const { Peer } = await import('peerjs')
  return new Peer({ debug: 0 })
}

const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')

/** Gast-Token pro Partie merken, damit ein Neuladen der Seite wieder in dieselbe Partie führt. */
function guestToken(hostId: string): string {
  const key = `online-token-${hostId}`
  try {
    const t = sessionStorage.getItem(key)
    if (t) return t
    const n = randomToken()
    sessionStorage.setItem(key, n)
    return n
  } catch {
    return randomToken()
  }
}

export class OnlineLink {
  private peer: PeerT | null = null
  private conn: DataConnection | null = null
  private status: LinkStatus = 'starting'
  private lastSeen = 0
  private droppedAt = 0
  private timers: ReturnType<typeof setInterval>[] = []
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private everConnected = false
  /** Gastgeber: Token des angenommenen Gastes. */
  private lockedToken: string | null = null

  private readonly role: 'host' | 'guest'
  private readonly ev: LinkEvents
  private readonly hostId: string | null
  private readonly name: string

  private constructor(role: 'host' | 'guest', ev: LinkEvents, hostId: string | null, name: string) {
    this.role = role
    this.ev = ev
    this.hostId = hostId
    this.name = name
  }

  static host(ev: LinkEvents): OnlineLink {
    const l = new OnlineLink('host', ev, null, '')
    void l.start()
    return l
  }

  static join(hostId: string, name: string, ev: LinkEvents): OnlineLink {
    const l = new OnlineLink('guest', ev, hostId, name)
    void l.start()
    return l
  }

  get currentStatus() {
    return this.status
  }

  send(m: Msg) {
    if (this.conn?.open) {
      try {
        this.conn.send(JSON.stringify(m))
      } catch {
        // geht bei Verbindungsabbruch verloren – nach dem Wiederverbinden gleicht `sync` ab
      }
    }
  }

  close() {
    this.closed = true
    this.timers.forEach(clearInterval)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    try {
      this.conn?.close()
    } catch {
      /* egal */
    }
    this.peer?.destroy()
  }

  private setStatus(s: LinkStatus, info?: string) {
    if (this.closed) return
    this.status = s
    this.ev.onStatus(s, info)
  }

  private async start() {
    this.setStatus('starting')
    let peer: PeerT
    try {
      peer = await createPeer()
    } catch {
      this.setStatus('error', 'PeerJS konnte nicht geladen werden.')
      return
    }
    if (this.closed) {
      peer.destroy()
      return
    }
    this.peer = peer
    peer.on('open', (id) => {
      if (this.role === 'host') {
        this.ev.onReady?.(id)
        if (!this.everConnected) this.setStatus('waiting')
      } else if (!this.conn?.open) this.connectToHost()
    })
    peer.on('connection', (c) => this.role === 'host' && this.attach(c))
    // Verbindung zum Vermittlungs-Server weg → neu anmelden (laufende Partie bleibt bestehen)
    peer.on('disconnected', () => {
      if (!this.closed && !peer.destroyed) setTimeout(() => !this.closed && !peer.destroyed && peer.disconnected && peer.reconnect(), 1000)
    })
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type
      if (type === 'peer-unavailable') {
        if (!this.everConnected) {
          this.setStatus('error', 'Partie nicht gefunden – ist der Link richtig und das Fenster des Gastgebers noch offen?')
        }
        return // beim Wiederverbinden: weiter versuchen
      }
      if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        if (!this.everConnected) this.setStatus('error', 'Vermittlungs-Server nicht erreichbar. Bitte Internetverbindung prüfen.')
        return
      }
      if (type === 'browser-incompatible') this.setStatus('error', 'Dieser Browser unterstützt kein WebRTC.')
      else if (!this.everConnected) this.setStatus('error', `Verbindungsfehler (${type ?? 'unbekannt'})`)
    })

    this.timers.push(setInterval(() => this.heartbeat(), PING_MS / 2))
  }

  private connectToHost() {
    if (this.closed || !this.peer || !this.hostId) return
    if (!this.everConnected) this.setStatus('connecting')
    if (this.peer.disconnected) {
      this.peer.reconnect()
      return // nach 'open' wird erneut verbunden
    }
    const c = this.peer.connect(this.hostId, { reliable: true, serialization: 'json' })
    this.attach(c)
  }

  private attach(c: DataConnection) {
    let accepted = this.role === 'guest'
    c.on('open', () => {
      if (this.role === 'guest') {
        this.useConn(c)
        c.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token: guestToken(this.hostId!), name: this.name } satisfies Msg))
      }
    })
    c.on('data', (raw) => {
      const m = parseMessage(raw)
      if (!m) return
      if (this.role === 'host' && !accepted) {
        // Erste Nachricht muss `hello` sein; nur der erste Gast (bzw. derselbe nach Neuverbindung) darf rein
        if (m.t !== 'hello') return
        if (this.lockedToken && this.lockedToken !== m.token) {
          c.send(JSON.stringify({ t: 'full' } satisfies Msg))
          setTimeout(() => c.close(), 500)
          return
        }
        this.lockedToken = m.token
        accepted = true
        this.useConn(c)
      }
      if (c !== this.conn) return
      this.lastSeen = Date.now()
      if (m.t === 'full') {
        this.setStatus('error', 'Diese Partie hat bereits einen Gegner.')
        this.close()
        return
      }
      if (m.t !== 'ping') this.ev.onMessage(m)
    })
    c.on('close', () => c === this.conn && this.dropped())
    c.on('error', () => c === this.conn && this.dropped())
  }

  private useConn(c: DataConnection) {
    const old = this.conn
    this.conn = c
    if (old && old !== c) {
      try {
        old.close()
      } catch {
        /* egal */
      }
    }
    this.lastSeen = Date.now()
    this.everConnected = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.setStatus('connected')
  }

  private heartbeat() {
    if (this.closed) return
    const now = Date.now()
    if (this.status === 'connected') {
      if (now - this.lastSeen > TIMEOUT_MS) this.dropped()
      else this.send({ t: 'ping' })
    } else if (this.status === 'reconnecting' && now - this.droppedAt > RECONNECT_MS) {
      this.setStatus('lost')
    }
  }

  private dropped() {
    if (this.closed || this.status === 'reconnecting' || this.status === 'lost') return
    const c = this.conn
    this.conn = null
    try {
      c?.close()
    } catch {
      /* egal */
    }
    this.droppedAt = Date.now()
    this.setStatus('reconnecting')
    if (this.role === 'guest') this.scheduleRetry()
    else if (this.peer?.disconnected) this.peer.reconnect()
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      if (this.closed || this.conn?.open) return
      this.connectToHost()
      this.scheduleRetry()
    }, RETRY_MS)
  }
}
