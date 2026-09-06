'use client'

// Per-instrument M / S keys (mute, solo) shared by the Faders groups and the
// Panels accordion headers. State comes from describeSession().tracks; the
// keys call back with the new value and Studio runs mute_track / solo_track.

export type MixState = Record<string, { mute: boolean; solo: boolean; volume: number }>
export type OnMix = (id: string, what: 'mute' | 'solo', on: boolean) => void

type Props = {
  id: string
  tracks?: MixState
  anySolo?: boolean
  onMix: OnMix
  /** 'panel' = dark synth-header variant */
  tone?: 'default' | 'panel'
}

/** True when this instrument is silent right now (muted, or another track is soloed). */
export function isSilenced(id: string, tracks?: MixState, anySolo?: boolean): boolean {
  const t = tracks?.[id]
  return !!t?.mute || (!!anySolo && !t?.solo)
}

export default function MuteSolo({ id, tracks, anySolo, onMix, tone = 'default' }: Props) {
  const t = tracks?.[id]
  const mute = !!t?.mute
  const solo = !!t?.solo
  return (
    <span className={`jb-ms${tone === 'panel' ? ' jb-ms--panel' : ''}`} role="group" aria-label={`${id} mute and solo`}>
      <button
        type="button"
        className={`jb-ms-key m${mute ? ' on' : ''}`}
        aria-pressed={mute}
        aria-label={`${mute ? 'Unmute' : 'Mute'} ${id}`}
        title={mute ? 'Unmute' : 'Mute'}
        onClick={(e) => { e.stopPropagation(); onMix(id, 'mute', !mute) }}
      >
        M
      </button>
      <button
        type="button"
        className={`jb-ms-key s${solo ? ' on' : ''}`}
        aria-pressed={solo}
        aria-label={`${solo ? 'Unsolo' : 'Solo'} ${id}`}
        title={solo ? 'Unsolo' : 'Solo'}
        onClick={(e) => { e.stopPropagation(); onMix(id, 'solo', !solo) }}
      >
        S
      </button>
    </span>
  )
}
