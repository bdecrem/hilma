// Local voice (OLA-529): the talk page's ears and mouth on Kit's voice server on the Mac Studio
// (apps/venture/voice-local/server.py), reached over Tailscale. It stands in for the Realtime
// data channel: Talk.tsx sends it the same three events it sends OpenAI (response.create with the
// text in <line> tags, response.cancel, output_audio_buffer.clear) and gets back the same events
// it reads from OpenAI (speech started/stopped, the transcript, the reply's audio started,
// done, stopped). So the turn-taking logic is one piece of code for both voices.
//
// Up: the microphone as 16 kHz mono int16 PCM. Down: JSON events, and binary frames of 24 kHz
// int16 PCM (one sentence each) behind a 4-byte id, played back to back through Web Audio.

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

export class LocalVoice {
  private ws: WebSocket | null = null
  private node: AudioWorkletNode | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private playing = new Set<AudioBufferSourceNode>()
  private playhead = 0
  private nextId = 0
  private live = new Map<number, string>() // readings asked for and not yet done: id -> text
  private dead = 0 // ids up to this one were cancelled: their late audio is dropped
  private sounding = false
  private stoppedAt: number | null = null
  private endSilenceMs = 800
  closedByUs = false
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

  private emit(ev: VoiceEvent) {
    queueMicrotask(() => this.onEvent(ev))
  }

  // Resolves when the Studio says it is ready; rejects if it cannot be reached in 8 s.
  async open(): Promise<void> {
    const blob = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await this.ctx.audioWorklet.addModule(blob)
    URL.revokeObjectURL(blob)
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${this.url}/ws?t=${encodeURIComponent(this.token)}`)
      ws.binaryType = 'arraybuffer'
      this.ws = ws
      let ready = false
      const timer = setTimeout(() => {
        if (!ready) {
          ws.close()
          reject(new Error('unreachable'))
        }
      }, 8000)
      ws.onmessage = (m) => {
        if (typeof m.data !== 'string') return this.onAudio(m.data as ArrayBuffer)
        const ev = JSON.parse(m.data) as { type: string; text?: string; id?: number; end_silence_ms?: number }
        if (ev.type === 'ready') {
          ready = true
          clearTimeout(timer)
          if (ev.end_silence_ms) this.endSilenceMs = ev.end_silence_ms
          resolve()
        } else this.onServer(ev)
      }
      ws.onerror = () => {
        if (!ready) {
          clearTimeout(timer)
          reject(new Error('unreachable'))
        }
      }
      ws.onclose = () => {
        if (ready && !this.closedByUs) this.onLost()
      }
    })
    this.src = this.ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.ctx, 'kit-down')
    this.node.port.onmessage = (m) => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(m.data as ArrayBuffer)
    }
    this.src.connect(this.node)
    // A silent path to the speakers, so every browser keeps pulling the worklet.
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.node.connect(mute).connect(this.ctx.destination)
  }

  private onServer(ev: { type: string; text?: string; id?: number }) {
    switch (ev.type) {
      case 'speech_started':
        return this.emit({ type: 'input_audio_buffer.speech_started' })
      case 'speech_stopped':
        this.stoppedAt = performance.now()
        return this.emit({ type: 'input_audio_buffer.speech_stopped' })
      case 'transcript':
        return this.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: ev.text ?? '' })
      case 'speak_done': {
        const id = ev.id ?? 0
        const text = this.live.get(id)
        this.live.delete(id)
        if (id <= this.dead || text === undefined) return
        this.emit({ type: 'response.output_audio_transcript.done', transcript: text })
        this.emit({ type: 'response.done', response: { id: String(id), status: 'completed' } })
        if (!this.playing.size) this.quiet()
        return
      }
    }
  }

  private onAudio(data: ArrayBuffer) {
    const id = new DataView(data).getUint32(0, true)
    if (id <= this.dead || data.byteLength <= 4) return
    const pcm = new Int16Array(data, 4)
    const buf = this.ctx.createBuffer(1, pcm.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768
    const node = this.ctx.createBufferSource()
    node.buffer = buf
    node.connect(this.ctx.destination)
    const at = Math.max(this.ctx.currentTime + 0.02, this.playhead)
    node.start(at)
    this.playhead = at + buf.duration
    this.playing.add(node)
    node.onended = () => {
      this.playing.delete(node)
      if (!this.playing.size && ![...this.live.keys()].some((k) => k > this.dead)) this.quiet()
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
      const text = raw.replace(/^<line>|<\/line>$/g, '')
      const id = ++this.nextId
      this.live.set(id, text)
      this.ws?.send(JSON.stringify({ type: 'speak', id, text }))
      this.emit({ type: 'response.created', response: { id: String(id) } })
    } else if (ev.type === 'response.cancel') {
      this.dead = this.nextId
      this.ws?.send(JSON.stringify({ type: 'cancel' }))
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
    this.closedByUs = true
    this.send({ type: 'output_audio_buffer.clear' })
    this.node?.disconnect()
    this.src?.disconnect()
    this.ws?.close()
    this.ws = null
  }
}
