// Protokoll für Online-Partien (WebRTC-Datenkanal) – reine Logik ohne React/Netzwerk.
//
// Grundsätze:
// - Beide Seiten prüfen jeden Zug mit chess.js; unpassende Nachrichten (falsche Partie,
//   falscher Halbzug, nicht am Zug, illegal) werden ignoriert.
// - Der Gastgeber ist für die Uhr massgebend: Er misst die Zeit des Gastes selbst und
//   schickt nach jedem Gastzug die gültigen Restzeiten zurück; Zeitüberschreitung stellt
//   nur er fest und meldet sie per `sync`.
// - Jede Funktion gibt den neuen Zustand und die zu sendenden Nachrichten zurück
//   (oder null, wenn die Aktion/Nachricht verworfen wird).
import { Chess, type Color, type Move } from 'chess.js'
import { computeStatus, type GameResult } from '../game/status'
import {
  chargeMove,
  clockRunsAt,
  compensateLag,
  findTimeControl,
  initialClocks,
  remaining,
  timeoutResult,
  type Clocks,
  type TimeControl,
} from './clock'

export const PROTOCOL_VERSION = 1
export const MAX_CHAT = 300
export const MAX_NAME = 24

export type Role = 'host' | 'guest'
export type GameEnd = { result: GameResult; reason: string }
export type Offer = 'offer' | 'accept' | 'decline'

/** Zustand einer Online-Partie (auf beiden Seiten gleich aufgebaut). */
export type Session = {
  gameNo: number
  hostColor: Color
  tc: TimeControl
  /** Gespielte Züge in UCI-Notation (e2e4, e7e8q) ab der Grundstellung. */
  moves: string[]
  clocks: Clocks | null
  /** Lokaler Zeitpunkt (ms), seit dem die Seite am Zug nachdenkt. */
  turnStartedAt: number
  result: GameEnd | null
  names: { host: string; guest: string }
  drawOffer: Role | null
  rematchOffer: Role | null
}

/** Über das Netz übertragener Zustand (ohne lokale Zeitstempel). */
export type Snapshot = Omit<Session, 'turnStartedAt' | 'tc'> & { tcId: string }

export type Msg =
  | { t: 'hello'; v: number; token: string; name: string }
  | { t: 'full' }
  | { t: 'sync'; s: Snapshot }
  | { t: 'move'; g: number; ply: number; uci: string; clocks: Clocks | null }
  | { t: 'clock'; g: number; ply: number; clocks: Clocks }
  | { t: 'resign'; g: number }
  | { t: 'draw'; g: number; a: Offer }
  | { t: 'rematch'; g: number; a: Offer }
  | { t: 'chat'; text: string }
  | { t: 'ping' }

export type Step = { s: Session; out: Msg[] }

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const otherRole = (r: Role): Role => (r === 'host' ? 'guest' : 'host')
export const colorOf = (s: Session, r: Role): Color => (r === 'host' ? s.hostColor : other(s.hostColor))
export const roleOf = (s: Session, c: Color): Role => (s.hostColor === c ? 'host' : 'guest')
export const turnOf = (s: Session): Color => (s.moves.length % 2 === 0 ? 'w' : 'b')
const winFor = (c: Color): GameResult => (c === 'w' ? '1-0' : '0-1')

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/

export const cleanName = (n: unknown, fallback: string): string => {
  const s = typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
  return s || fallback
}

// ---------------------------------------------------------------- Partie & Züge

export function newSession(opts: {
  hostColor: Color
  tcId: string
  names: { host: string; guest: string }
  gameNo?: number
  now: number
}): Session {
  const tc = findTimeControl(opts.tcId)
  return {
    gameNo: opts.gameNo ?? 1,
    hostColor: opts.hostColor,
    tc,
    moves: [],
    clocks: initialClocks(tc),
    turnStartedAt: opts.now,
    result: null,
    names: opts.names,
    drawOffer: null,
    rematchOffer: null,
  }
}

/** Revanche: neue Partie mit getauschten Farben. */
export const rematchSession = (s: Session, now: number): Session =>
  newSession({ hostColor: other(s.hostColor), tcId: s.tc.id, names: s.names, gameNo: s.gameNo + 1, now })

/** Spielt die Züge nach. Gibt null zurück, wenn ein Zug ungültig ist. */
export function replay(moves: string[]): Chess | null {
  const chess = new Chess()
  for (const m of moves) if (!applyUci(chess, m)) return null
  return chess
}

/** Führt einen UCI-Zug aus, wenn er legal ist. */
export function applyUci(chess: Chess, uci: string): Move | null {
  if (typeof uci !== 'string' || !UCI_RE.test(uci)) return null
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
}

export const toUci = (from: string, to: string, promotion?: string) => `${from}${to}${promotion ?? ''}`

export const isRunning = (s: Session) => !s.result && !!s.clocks

/** Aktuelle Restzeiten beider Seiten. */
export function currentClocks(s: Session, now: number): Clocks | null {
  if (!s.clocks) return null
  const turn = turnOf(s)
  const ply = s.moves.length
  const run = isRunning(s)
  return {
    w: remaining(s.clocks, 'w', turn, ply, s.turnStartedAt, now, run),
    b: remaining(s.clocks, 'b', turn, ply, s.turnStartedAt, now, run),
  }
}

/**
 * Zug ausführen (ohne Rollenprüfung). `clocks` sind die Uhren nach dem Zug
 * (bereits berechnet) – sonst bleiben sie unverändert.
 */
function withMove(s: Session, uci: string, clocks: Clocks | null, now: number): Session | null {
  const chess = replay(s.moves)
  if (!chess || !applyUci(chess, uci)) return null
  const st = computeStatus(chess)
  return {
    ...s,
    moves: [...s.moves, uci],
    clocks,
    turnStartedAt: now,
    result: st.over && st.result ? { result: st.result, reason: st.reason ?? '' } : null,
    drawOffer: null,
  }
}

/** Uhren nach einem Zug, gemessen mit der lokalen Uhr. */
function chargedLocally(s: Session, mover: Color, now: number): Clocks | null {
  if (!s.clocks) return null
  return chargeMove(s.clocks, mover, s.moves.length, now - s.turnStartedAt, s.tc.incrementMs)
}

function flag(s: Session, flagged: Color, now: number): Session {
  const chess = replay(s.moves) ?? new Chess()
  const clocks = currentClocks(s, now)
  return { ...s, clocks: clocks ? { ...clocks, [flagged]: 0 } : null, turnStartedAt: now, result: timeoutResult(chess, flagged), drawOffer: null }
}

export function toSnapshot(s: Session, now: number): Snapshot {
  const { turnStartedAt: _t, tc, ...rest } = s
  return { ...rest, clocks: currentClocks(s, now), tcId: tc.id }
}

export function fromSnapshot(snap: Snapshot, now: number): Session {
  const { tcId, ...rest } = snap
  return { ...rest, tc: findTimeControl(tcId), turnStartedAt: now }
}

// ---------------------------------------------------------------- lokale Aktionen

/** Eigener Zug. */
export function localMove(s: Session, role: Role, uci: string, now: number): Step | null {
  const me = colorOf(s, role)
  if (s.result || turnOf(s) !== me) return null
  const cur = currentClocks(s, now)
  if (cur && cur[me] <= 0) return null // Zeit schon abgelaufen – der Gastgeber entscheidet
  const ply = s.moves.length
  const next = withMove(s, uci, chargedLocally(s, me, now), now)
  if (!next) return null
  return { s: next, out: [{ t: 'move', g: s.gameNo, ply, uci, clocks: next.clocks }] }
}

export function localResign(s: Session, role: Role): Step | null {
  if (s.result) return null
  const me = colorOf(s, role)
  return { s: { ...s, result: { result: winFor(other(me)), reason: 'Aufgabe' }, drawOffer: null }, out: [{ t: 'resign', g: s.gameNo }] }
}

export function localDraw(s: Session, role: Role, a: Offer): Step | null {
  if (s.result) return null
  if (a === 'offer') {
    if (s.drawOffer) return null
    return { s: { ...s, drawOffer: role }, out: [{ t: 'draw', g: s.gameNo, a }] }
  }
  if (s.drawOffer !== otherRole(role)) return null
  const next: Session =
    a === 'accept'
      ? { ...s, drawOffer: null, result: { result: '1/2-1/2', reason: 'Remis vereinbart' } }
      : { ...s, drawOffer: null }
  return { s: next, out: [{ t: 'draw', g: s.gameNo, a }] }
}

export function localRematch(s: Session, role: Role, a: Offer, now: number): Step | null {
  if (!s.result) return null
  const msg: Msg = { t: 'rematch', g: s.gameNo, a }
  if (a === 'offer') {
    if (s.rematchOffer) return null
    return { s: { ...s, rematchOffer: role }, out: [msg] }
  }
  if (s.rematchOffer !== otherRole(role)) return null
  if (a === 'decline') return { s: { ...s, rematchOffer: null }, out: [msg] }
  // Annehmen: Der Gastgeber startet die neue Partie, der Gast meldet nur die Zusage.
  if (role === 'host') {
    const next = rematchSession(s, now)
    return { s: next, out: [{ t: 'sync', s: toSnapshot(next, now) }] }
  }
  return { s, out: [msg] }
}

/** Sieg beanspruchen, wenn der Gegner nicht mehr erreichbar ist (nur lokal). */
export function claimWin(s: Session, role: Role): Step | null {
  if (s.result) return null
  const me = colorOf(s, role)
  return { s: { ...s, result: { result: winFor(me), reason: 'Gegner hat die Verbindung verloren' }, drawOffer: null }, out: [] }
}

/** Nur Gastgeber: Zeitüberschreitung prüfen. */
export function hostTick(s: Session, now: number): Step | null {
  if (!isRunning(s)) return null
  const cur = currentClocks(s, now)!
  const turn = turnOf(s)
  if (cur[turn] > 0) return null
  const next = flag(s, turn, now)
  return { s: next, out: [{ t: 'sync', s: toSnapshot(next, now) }] }
}

// ---------------------------------------------------------------- Empfang

/** Eingehende Nachricht der Gegenseite verarbeiten. */
export function receive(s: Session, role: Role, msg: Msg, now: number): Step | null {
  const them = otherRole(role)
  switch (msg.t) {
    case 'move': {
      if (msg.g !== s.gameNo || s.result || msg.ply !== s.moves.length) return null
      const mover = colorOf(s, them)
      if (turnOf(s) !== mover) return null
      if (role === 'guest') {
        // Uhrzeiten des Gastgebers gelten
        const clocks = s.clocks && msg.clocks && validClocks(msg.clocks) ? msg.clocks : s.clocks
        const next = withMove(s, msg.uci, clocks, now)
        return next ? { s: next, out: [] } : null
      }
      // Gastgeber: Zeit des Gastes selbst messen
      if (!s.clocks) {
        const next = withMove(s, msg.uci, null, now)
        return next ? { s: next, out: [] } : null
      }
      // Ungekappt messen, damit ein klar zu später Zug nicht durch den Ausgleich gerettet wird
      const raw = clockRunsAt(s.moves.length) ? s.clocks[mover] - Math.max(0, now - s.turnStartedAt) : s.clocks[mover]
      const measured = compensateLag(raw, msg.clocks?.[mover])
      if (measured <= 0) {
        // Zug kam zu spät – Zeit abgelaufen
        if (!replay([...s.moves, msg.uci])) return null
        const next = flag(s, mover, now)
        return { s: next, out: [{ t: 'sync', s: toSnapshot(next, now) }] }
      }
      const clocks = chargeMove(
        { ...s.clocks, [mover]: measured },
        mover,
        s.moves.length,
        0,
        s.tc.incrementMs,
      )
      const next = withMove(s, msg.uci, clocks, now)
      if (!next) return null
      return { s: next, out: [{ t: 'clock', g: s.gameNo, ply: next.moves.length, clocks }] }
    }
    case 'clock': {
      if (role !== 'guest' || msg.g !== s.gameNo || msg.ply !== s.moves.length || !s.clocks || !validClocks(msg.clocks))
        return null
      return { s: { ...s, clocks: msg.clocks, turnStartedAt: now }, out: [] }
    }
    case 'sync': {
      if (role !== 'guest') return null
      const next = fromSnapshot(msg.s, now)
      return replay(next.moves) ? { s: next, out: [] } : null
    }
    case 'resign': {
      if (msg.g !== s.gameNo || s.result) return null
      const next: Session = { ...s, result: { result: winFor(colorOf(s, role)), reason: 'Aufgabe' }, drawOffer: null }
      return { s: next, out: role === 'host' ? [{ t: 'sync', s: toSnapshot(next, now) }] : [] }
    }
    case 'draw': {
      if (msg.g !== s.gameNo || s.result) return null
      if (msg.a === 'offer') return s.drawOffer ? null : { s: { ...s, drawOffer: them }, out: [] }
      if (s.drawOffer !== role) return null
      if (msg.a === 'decline') return { s: { ...s, drawOffer: null }, out: [] }
      const next: Session = { ...s, drawOffer: null, result: { result: '1/2-1/2', reason: 'Remis vereinbart' } }
      return { s: next, out: role === 'host' ? [{ t: 'sync', s: toSnapshot(next, now) }] : [] }
    }
    case 'rematch': {
      if (msg.g !== s.gameNo || !s.result) return null
      if (msg.a === 'offer') return s.rematchOffer ? null : { s: { ...s, rematchOffer: them }, out: [] }
      if (s.rematchOffer !== role) return null
      if (msg.a === 'decline') return { s: { ...s, rematchOffer: null }, out: [] }
      if (role !== 'host') return null // Gast wartet auf `sync` des Gastgebers
      const next = rematchSession(s, now)
      return { s: next, out: [{ t: 'sync', s: toSnapshot(next, now) }] }
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------- Validierung

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0
const isColor = (x: unknown): x is Color => x === 'w' || x === 'b'
const isRole = (x: unknown): x is Role => x === 'host' || x === 'guest'
const isOffer = (x: unknown): x is Offer => x === 'offer' || x === 'accept' || x === 'decline'
const validClocks = (c: unknown): c is Clocks =>
  isObj(c) && typeof c.w === 'number' && typeof c.b === 'number' && Number.isFinite(c.w) && Number.isFinite(c.b) && c.w >= 0 && c.b >= 0
const RESULTS = ['1-0', '0-1', '1/2-1/2']

function validSnapshot(x: unknown): x is Snapshot {
  if (!isObj(x)) return false
  const names = x.names
  const result = x.result
  return (
    isInt(x.gameNo) &&
    isColor(x.hostColor) &&
    typeof x.tcId === 'string' &&
    Array.isArray(x.moves) &&
    x.moves.length < 1000 &&
    x.moves.every((m) => typeof m === 'string' && UCI_RE.test(m)) &&
    (x.clocks === null || validClocks(x.clocks)) &&
    (result === null || (isObj(result) && RESULTS.includes(result.result as string) && typeof result.reason === 'string')) &&
    isObj(names) &&
    typeof names.host === 'string' &&
    typeof names.guest === 'string' &&
    (x.drawOffer === null || isRole(x.drawOffer)) &&
    (x.rematchOffer === null || isRole(x.rematchOffer))
  )
}

/** Prüft eine empfangene Nachricht. Unbekanntes/Fehlerhaftes → null. */
export function parseMessage(data: unknown): Msg | null {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!isObj(data) || typeof data.t !== 'string') return null
  const d = data
  switch (d.t) {
    case 'ping':
    case 'full':
      return { t: d.t }
    case 'hello':
      return isInt(d.v) && typeof d.token === 'string' && d.token.length > 0 && d.token.length <= 64
        ? { t: 'hello', v: d.v, token: d.token, name: cleanName(d.name, 'Gast') }
        : null
    case 'sync':
      return validSnapshot(d.s) ? { t: 'sync', s: d.s } : null
    case 'move':
      return isInt(d.g) && isInt(d.ply) && typeof d.uci === 'string' && UCI_RE.test(d.uci) && (d.clocks === null || d.clocks === undefined || validClocks(d.clocks))
        ? { t: 'move', g: d.g, ply: d.ply, uci: d.uci, clocks: (d.clocks as Clocks | undefined) ?? null }
        : null
    case 'clock':
      return isInt(d.g) && isInt(d.ply) && validClocks(d.clocks) ? { t: 'clock', g: d.g, ply: d.ply, clocks: d.clocks } : null
    case 'resign':
      return isInt(d.g) ? { t: 'resign', g: d.g } : null
    case 'draw':
    case 'rematch':
      return isInt(d.g) && isOffer(d.a) ? { t: d.t, g: d.g, a: d.a } : null
    case 'chat':
      return typeof d.text === 'string' && d.text.trim() ? { t: 'chat', text: d.text.trim().slice(0, MAX_CHAT) } : null
    default:
      return null
  }
}

/** Peer-ID aus `?join=<id>` einer URL-Suche lesen (null, wenn fehlend/ungültig). */
export function joinIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('join')
  return id && /^[\w-]{1,64}$/.test(id) ? id : null
}

// ---------------------------------------------------------------- Ausgabe

/** PGN der Partie (für die Analyse). */
export function sessionPgn(s: Session, date = new Date()): string {
  const chess = replay(s.moves) ?? new Chess()
  const white = s.hostColor === 'w' ? s.names.host : s.names.guest
  const black = s.hostColor === 'w' ? s.names.guest : s.names.host
  chess.setHeader('Event', 'Online-Partie')
  chess.setHeader('Site', 'Schach-Trainer')
  chess.setHeader('Date', date.toISOString().slice(0, 10).replace(/-/g, '.'))
  chess.setHeader('White', white)
  chess.setHeader('Black', black)
  if (s.tc.initialMs > 0) chess.setHeader('TimeControl', `${s.tc.initialMs / 1000}+${s.tc.incrementMs / 1000}`)
  chess.setHeader('Result', s.result?.result ?? '*')
  if (s.result) chess.setHeader('Termination', s.result.reason)
  return chess.pgn()
}
