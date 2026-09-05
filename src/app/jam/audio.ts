// Loop player for rendered Jambot buffers.
//
// Renders come back as AudioBuffers (with a 2s release tail). Playback loops
// the exact musical length (bars × 4 beats) so the loop is tight, and
// setBuffer() hot-swaps a new render at the same phase so slider tweaks
// don't restart the groove.

type AC = typeof AudioContext

function getAudioContextCtor(): AC {
  const w = window as unknown as { AudioContext?: AC; webkitAudioContext?: AC }
  const Ctor = w.AudioContext || w.webkitAudioContext
  if (!Ctor) throw new Error('Web Audio is not available in this browser')
  return Ctor
}

export class LoopPlayer {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private loopSeconds = 0
  private startedAt = 0
  playing = false
  onState: ((playing: boolean) => void) | null = null

  /** Must be called from a user gesture at least once (iOS). */
  unlock() {
    if (!this.ctx) {
      const Ctor = getAudioContextCtor()
      this.ctx = new Ctor()
      this.gain = this.ctx.createGain()
      this.gain.gain.value = 0.9
      this.gain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx.state !== 'suspended'
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  hasBuffer() {
    return !!this.buffer
  }

  /** Swap in a new render. Keeps the current phase if playing. */
  setBuffer(buffer: AudioBuffer, loopSeconds: number) {
    const pos = this.position()
    this.buffer = buffer
    this.loopSeconds = Math.max(0.05, Math.min(loopSeconds, buffer.duration))
    if (this.playing) this.start(pos * this.loopSeconds)
  }

  play() {
    if (!this.buffer) return
    this.unlock()
    this.start(0)
  }

  toggle() {
    if (this.playing) this.stop()
    else this.play()
  }

  private start(offset: number) {
    if (!this.ctx || !this.gain || !this.buffer) return
    if (this.source) {
      try { this.source.stop() } catch { /* already stopped */ }
      this.source.disconnect()
    }
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.loop = true
    src.loopStart = 0
    src.loopEnd = this.loopSeconds
    src.connect(this.gain)
    const off = ((offset % this.loopSeconds) + this.loopSeconds) % this.loopSeconds
    src.start(0, off)
    this.source = src
    this.startedAt = this.ctx.currentTime - off
    if (!this.playing) {
      this.playing = true
      this.onState?.(true)
    }
  }

  stop() {
    if (this.source) {
      try { this.source.stop() } catch { /* noop */ }
      this.source.disconnect()
      this.source = null
    }
    if (this.playing) {
      this.playing = false
      this.onState?.(false)
    }
  }

  /** 0..1 within the loop. */
  position() {
    if (!this.playing || !this.ctx || !this.loopSeconds) return 0
    const t = this.ctx.currentTime - this.startedAt
    return ((t % this.loopSeconds) + this.loopSeconds) % this.loopSeconds / this.loopSeconds
  }

  get loopLength() {
    return this.loopSeconds
  }
}

export function loopSecondsFor(bars: number, bpm: number) {
  return (bars * 4 * 60) / bpm
}
