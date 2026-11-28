// Local voice (OLA-529): the talk page's ears and mouth on Kit's voice server on the Mac Studio
// (apps/venture/voice-local/server.py), reached through its tunn3l address. It stands in for the
// Realtime data channel: Talk.tsx sends it the same three events it sends OpenAI
// (response.create with the text in <line> tags, response.cancel, output_audio_buffer.clear) and
// gets back the same events it reads from OpenAI (speech started/stopped, the transcript, the
// reply's audio started, done, stopped). So the turn-taking logic is one piece of code for both.
//
// Plain HTTP, because the tunnel carries only whole requests and answers: the microphone goes up
// as 16 kHz int16 PCM in ~250 ms posts, one after another, and each answer carries the events
// since the last (Silero and the 800 ms pause run on the server). Each sentence of a reply is one
// post that answers with its 24 kHz int16 PCM, played back to back through Web Audio. The token
// sits in the query string and bodies are text/plain, so no request needs a preflight.

export type VoiceEvent = { type: string; transcript?: string; response?: { id?: string; status?: string } }

// An AudioWorklet that turns the microphone into 16 kHz int16 frames of 512 samples.
const WORKLET = `
class Down extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / 16000; this.pos = 0; this.out = new Int16Array(512); this.n = 0; this.last = 0 }
  process(inputs) {
    const x = inputs[0] && inputs[0][0]
    if (!x) return true
    for (; this.pos < x.length; this.pos += this.step) {
      const i = Math.floor(this.pos), f = this.pos - i
      const a = i === 0 ? this.last : x[i - 1], b = x[i]
      const v = Math.max(-1, Math.min(1, a + (b - a) * f))
      this.out[this.n++] = v * 32767
      if (this.n === 512) { this.port.postMessage(this.out.buffer.slice(0)); this.n = 0 }
    }
    this.pos -= x.length
    this.last = x[x.length - 1]
    return true
  }
}
registerProcessor('kit-down', Down)
`

const CHUNK = 4096 // samples per microphone post: 256 ms
// A sentence ends at . ! or ? followed by a space, so "3.5" stays whole.
const sentences = (text: string) => text.split(/(?<=[.!?]["')\]]?)\s+/).filter((s) => s.trim())

type ServerEvent = { type: string; text?: string }

export class LocalVoice {
  private call = ''
  private node: AudioWorkletNode | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private outbox: ArrayBuffer[] = []
  private queued = 0
  private wake: (() => void) | null = null
  private open_ = false
  private playing = new Set<AudioBufferSourceNode>()
  private playhead = 0
  private nextId = 0
  private reading = 0 // readings in progress
  private dead = 0 // ids up to this one were cancelled: their audio is dropped
  private sounding = false
  private stoppedAt: number | null = null
  private endSilenceMs = 800
  // End of his speech to the first sound of the reply, per turn (read by talk-local-check.mjs).
  delays: number[] = []

  constructor(
    private url: string,
    private token: string,
    private ctx: AudioContext,
    private stream: MediaStream,
    private onEvent: (ev: VoiceEvent) => void,
    private onLost: () => void,
  ) {}

  private at(path: string) {
    return `${this.url}${path}?t=${encodeURIComponent(this.token)}`
  }

  private emit(ev: VoiceEvent) {
    queueMicrotask(() => this.onEvent(ev))
  }

  // Resolves when the Studio has opened a call; rejects if it cannot be reached in 8 s.
  async open(): Promise<void> {
    const res = await fetch(this.at('/call'), { method: 'POST', signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`voice server ${res.status}`)
    const info = (await res.json()) as { call: string; end_silence_ms?: number }
    this.call = info.call
    if (info.end_silence_ms) this.endSilenceMs = info.end_silence_ms
    const blob = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await this.ctx.audioWorklet.addModule(blob)
    URL.revokeObjectURL(blob)
    this.src = this.ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.ctx, 'kit-down')
    this.node.port.onmessage = (m) => {
      this.outbox.push(m.data as ArrayBuffer)
      this.queued += 512
      if (this.queued >= CHUNK) this.wake?.()
    }
    this.src.connect(this.node)
    // A silent path to the speakers, so every browser keeps pulling the worklet.
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.node.connect(mute).connect(this.ctx.destination)
    this.open_ = true
    void this.micLoop()
  }

  // One microphone post at a time, in order: the server's VAD reads them as one stream.
  private async micLoop() {
    let fails = 0
    while (this.open_) {
      if (this.queued < CHUNK) await new Promise<void>((r) => (this.wake = r))
      this.wake = null
      if (!this.open_) return
      const body = new Uint8Array(this.queued * 2)
      let o = 0
      for (const b of this.outbox) {
        body.set(new Uint8Array(b), o)
        o += b.byteLength
      }
      this.outbox = []
      this.queued = 0
      try {
        const res = await fetch(this.at(`/call/${this.call}/audio`), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body,
          signal: AbortSignal.timeout(5000),
        })
        if (res.status === 404 || res.status === 401) throw new Error('call gone')
        if (!res.ok) throw new Error(`audio ${res.status}`)
        fails = 0
        for (const ev of ((await res.json()) as { events: ServerEvent[] }).events) this.onServer(ev)
      } catch (e) {
        if (!this.open_) return
        if (++fails >= 3 || (e instanceof Error && e.message === 'call gone')) {
          this.open_ = false
          this.onLost()
          return
        }
      }
    }
  }

  private onServer(ev: ServerEvent) {
    if (ev.type === 'speech_started') this.emit({ type: 'input_audio_buffer.speech_started' })
    else if (ev.type === 'speech_stopped') {
      this.stoppedAt = performance.now()
      this.emit({ type: 'input_audio_buffer.speech_stopped' })
    } else if (ev.type === 'transcript')
      this.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: ev.text ?? '' })
  }

  // Read `text` aloud one sentence per request, each played as soon as it arrives.
  private async read(id: number, text: string) {
    this.reading++
    try {
      for (const s of sentences(text)) {
        if (id <= this.dead || !this.open_) return
        const res = await fetch(this.at(`/call/${this.call}/speak`), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: s.trim(),
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) throw new Error(`speak ${res.status}`)
        const pcm = await res.arrayBuffer()
        if (id <= this.dead) return
        this.play(pcm)
      }
    } catch (e) {
      console.error('[talk] local voice could not read a sentence', e)
    } finally {
      this.reading--
    }
    if (id <= this.dead) return
    this.emit({ type: 'response.output_audio_transcript.done', transcript: text })
    this.emit({ type: 'response.done', response: { id: String(id), status: 'completed' } })
    if (!this.playing.size) this.quiet()
  }

  private play(data: ArrayBuffer) {
    if (data.byteLength < 2) return
    const pcm = new Int16Array(data, 0, data.byteLength >> 1)
    const buf = this.ctx.createBuffer(1, pcm.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768
    const node = this.ctx.createBufferSource()
    node.buffer = buf
    node.connect(this.ctx.destination)
    const start = Math.max(this.ctx.currentTime + 0.02, this.playhead)
    node.start(start)
    this.playhead = start + buf.duration
    this.playing.add(node)
    node.onended = () => {
      this.playing.delete(node)
      if (!this.playing.size && !this.reading) this.quiet()
    }
    if (!this.sounding) {
      this.sounding = true
      if (this.stoppedAt !== null) {
        this.delays.push(Math.round(performance.now() - this.stoppedAt + this.endSilenceMs))
        this.stoppedAt = null
      }
      this.emit({ type: 'output_audio_buffer.started' })
    }
  }

  private quiet() {
    if (!this.sounding) return
    this.sounding = false
    this.emit({ type: 'output_audio_buffer.stopped' })
  }

  // The events Talk.tsx sends to OpenAI's data channel.
  send(event: object) {
    const ev = event as { type: string; response?: { input?: { content?: { text?: string }[] }[] } }
    if (ev.type === 'response.create') {
      const raw = ev.response?.input?.[0]?.content?.[0]?.text ?? ''
      const id = ++this.nextId
      this.emit({ type: 'response.created', response: { id: String(id) } })
      void this.read(id, raw.replace(/^<line>|<\/line>$/g, ''))
    } else if (ev.type === 'response.cancel') {
      this.dead = this.nextId
    } else if (ev.type === 'output_audio_buffer.clear') {
      this.dead = this.nextId
      for (const n of this.playing) {
        n.onended = null
        try {
          n.stop()
        } catch {}
      }
      this.playing.clear()
      this.playhead = 0
      if (this.sounding) {
        this.sounding = false
        this.emit({ type: 'output_audio_buffer.cleared' })
      }
    }
  }

  close() {
    this.send({ type: 'output_audio_buffer.clear' })
    const was = this.open_
    this.open_ = false
    this.wake?.()
    this.node?.disconnect()
    this.src?.disconnect()
    if (was && this.call) void fetch(this.at(`/call/${this.call}/end`), { method: 'POST', keepalive: true }).catch(() => {})
  }
}
