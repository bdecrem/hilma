'use client'

import DodoFrame, { FORMATS, frameCss, type Format, type Layer } from '../DodoFrame'
import { heroScenes, sceneById } from '../scenes'

// Renders one frame at exact pixel size for scripts/dodo-scenes/export.mjs
// to screenshot. `strip` ignores the id and lays out the hero set.
export default function SceneExport({ id, format, theme, layer = 'all' }: { id: string; format: Format; theme: 'light' | 'dark'; layer?: Layer }) {
  const spec = FORMATS[format]
  const scene = spec && spec.set === null ? heroScenes[0] : sceneById(id)
  if (!spec || !scene) {
    return <p style={{ fontFamily: 'system-ui', padding: 24 }}>Unknown scene or format.</p>
  }
  return (
    <div id="frame" style={{ width: spec.w, height: spec.h }}>
      <style>{frameCss}</style>
      {layer === 'bird' && <style>{'html, body { background: transparent !important; }'}</style>}
      <DodoFrame scene={scene} format={format} theme={theme} layer={layer} />
    </div>
  )
}
