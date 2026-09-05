// Save a rendered buffer as MP3 or WAV.
//
// MP3 encoding runs in the page (lamejs, ~1s per minute of stereo audio at
// 192 kbps). Delivery prefers the share sheet on phones (lands in Files /
// Voice Memos / AirDrop) and falls back to a download link.

export type ExportFormat = 'mp3' | 'wav'

function interleaveToInt16(buffer: AudioBuffer) {
  const n = buffer.length
  const left = new Int16Array(n)
  const right = new Int16Array(n)
  const l = buffer.getChannelData(0)
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l
  for (let i = 0; i < n; i++) {
    const a = Math.max(-1, Math.min(1, l[i]))
    const b = Math.max(-1, Math.min(1, r[i]))
    left[i] = a < 0 ? a * 0x8000 : a * 0x7fff
    right[i] = b < 0 ? b * 0x8000 : b * 0x7fff
  }
  return { left, right }
}

export async function encodeMp3(buffer: AudioBuffer, onProgress?: (p: number) => void): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(2, buffer.sampleRate, 192)
  const { left, right } = interleaveToInt16(buffer)
  const BLOCK = 1152 * 8
  const parts: Uint8Array[] = []
  for (let i = 0; i < left.length; i += BLOCK) {
    const out = enc.encodeBuffer(left.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK))
    if (out.length) parts.push(out)
    if (onProgress && (i / BLOCK) % 20 === 0) {
      onProgress(i / left.length)
      await new Promise((r) => setTimeout(r, 0)) // let the UI breathe
    }
  }
  const tail = enc.flush()
  if (tail.length) parts.push(tail)
  onProgress?.(1)
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

export function wavBlob(buffer: AudioBuffer, audioBufferToWav: (b: AudioBuffer) => ArrayBuffer): Blob {
  return new Blob([audioBufferToWav(buffer)], { type: 'audio/wav' })
}

/** Share sheet when available (iOS/Android), otherwise a download. */
export async function deliver(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      // User cancelled the sheet — nothing else to do.
      if ((err as { name?: string }).name === 'AbortError') return 'shared'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export function trackFilename(bpm: number, format: ExportFormat) {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `jam-${Math.round(bpm)}bpm-${stamp}.${format}`
}
