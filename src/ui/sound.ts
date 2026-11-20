// Kleine Synthesizer-Sounds über WebAudio – keine Audiodateien nötig.

let ctx: AudioContext | null = null
const audio = () => {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + delay
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur)
}

export type SoundKind = 'move' | 'capture' | 'check' | 'win' | 'lose' | 'correct' | 'wrong'

export function playSound(kind: SoundKind) {
  switch (kind) {
    case 'move':
      return tone(520, 0.08, 'triangle', 0.12)
    case 'capture':
      tone(300, 0.1, 'square', 0.08)
      return tone(180, 0.12, 'triangle', 0.12, 0.03)
    case 'check':
      tone(880, 0.09, 'square', 0.07)
      return tone(660, 0.12, 'square', 0.07, 0.09)
    case 'win':
    case 'correct':
      tone(523, 0.12, 'triangle', 0.12)
      tone(659, 0.12, 'triangle', 0.12, 0.1)
      return tone(784, 0.25, 'triangle', 0.12, 0.2)
    case 'lose':
    case 'wrong':
      tone(392, 0.15, 'triangle', 0.12)
      return tone(262, 0.3, 'triangle', 0.12, 0.14)
  }
}
