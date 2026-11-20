import { parseBestmove, parseInfo, type PvLine } from './uci'

export type SearchOptions = {
  depth?: number
  movetime?: number
  multipv?: number
}

export type SearchResult = {
  bestmove: string | null
  /** Varianten sortiert nach multipv (1 = beste). */
  lines: PvLine[]
}

type OptionValue = string | number | boolean

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`

/**
 * Dünner Wrapper um Stockfish im Web Worker.
 * Alle Befehle laufen nacheinander über eine Warteschlange, damit sich
 * gleichzeitige Anfragen nicht in die Quere kommen.
 */
export class StockfishEngine {
  private worker: Worker
  private listeners = new Set<(line: string) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>
  private options = new Map<string, string>()

  constructor(url: string = ENGINE_URL) {
    this.worker = new Worker(url)
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data)
      for (const fn of [...this.listeners]) fn(line)
    }
    this.ready = this.handshake()
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private waitFor(done: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const fn = (line: string) => {
        onLine?.(line)
        if (done(line)) {
          this.listeners.delete(fn)
          resolve(line)
        }
      }
      this.listeners.add(fn)
    })
  }

  private async handshake() {
    const ok = this.waitFor((l) => l === 'uciok')
    this.send('uci')
    await ok
    await this.isReady()
  }

  private async isReady() {
    const ok = this.waitFor((l) => l === 'readyok')
    this.send('isready')
    await ok
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job)
    this.queue = run.catch(() => undefined)
    return run
  }

  private applyOption(name: string, value: OptionValue) {
    const v = String(value)
    if (this.options.get(name) === v) return false
    this.options.set(name, v)
    this.send(`setoption name ${name} value ${v}`)
    return true
  }

  setOptions(opts: Record<string, OptionValue>): Promise<void> {
    return this.enqueue(async () => {
      await this.ready
      let changed = false
      for (const [k, v] of Object.entries(opts)) changed = this.applyOption(k, v) || changed
      if (changed) await this.isReady()
    })
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.ready
      this.send('ucinewgame')
      await this.isReady()
    })
  }

  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    return this.enqueue(async () => {
      await this.ready
      if (this.applyOption('MultiPV', opts.multipv ?? 1)) await this.isReady()

      const lines = new Map<number, PvLine>()
      const done = this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const info = parseInfo(l)
          if (info) lines.set(info.multipv, info)
        },
      )

      this.send(`position fen ${fen}`)
      let go = 'go'
      if (opts.depth) go += ` depth ${opts.depth}`
      if (opts.movetime) go += ` movetime ${opts.movetime}`
      if (!opts.depth && !opts.movetime) go += ' depth 12'
      this.send(go)

      const bestLine = await done
      return {
        bestmove: parseBestmove(bestLine),
        lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
      }
    })
  }

  /** Bricht die laufende Suche ab (die Engine meldet dann sofort ihren besten Zug). */
  stop() {
    this.send('stop')
  }

  terminate() {
    this.listeners.clear()
    this.worker.terminate()
  }
}
