// The tidy engineer, with a tour: point at a thing on the desk (or tap it, or tab to it) and the
// caption under the drawing says what it does for the datacenter. No script: the caption swaps by
// CSS (:has on the figure), and the drawing itself is unchanged. build.mjs draws `spots` as
// transparent targets over the scene, in this order (later ones win where they overlap).
import ENGINEER from './datacenter-engineer.mjs'

export default {
  ...ENGINEER,
  title: 'The tidy engineer, with a tour',
  name: 'the tidy engineer, with a tour',
  // [id, the thing's name for a screen reader, the line, the target as x y w h in the drawing's units]
  spots: [
    ['window', 'The window', 'The cloud. We keep it outside.', [336, 34, 232, 236]],
    ['books', 'The books on the shelf', 'Cold storage. Never been breached.', [40, 88, 138, 102]],
    ['fountain', 'The fountain', 'Water cooling. Nothing here overheats, including me.', [66, 294, 94, 138]],
    ['computer', 'The computer', 'The whole cluster. It’s one computer.', [232, 328, 168, 104]],
    ['turbine', 'The wind turbine', 'Power: our own wind farm. “Farm” is a strong word.', [188, 324, 52, 116]],
    ['mug', 'The mug', 'Fuel for the one person on call. That’s me.', [512, 332, 60, 98]],
    ['drawer', 'The desk drawer', 'Permits and community feedback. It barely closes.', [52, 443, 184, 24]],
    ['basket', 'The wastepaper basket', 'Our data retention policy.', [314, 514, 100, 92]],
  ],
}
