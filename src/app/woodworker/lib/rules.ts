import type { Rules } from './engine'
import type { Level } from './levels'
import { slideRules } from './slide'
import { swingRules } from './swing'
import { tiltRules } from './tilt'
import { linkedRules } from './linked'
import { boxRules } from './box'

/** The rules of a room, typed loosely: the shell only stores states and passes moves through. */
export function rulesFor(L: Level): Rules<unknown, unknown> {
  switch (L.mech) {
    case 'slide': return slideRules(L.data) as Rules<unknown, unknown>
    case 'swing': return swingRules(L.data) as Rules<unknown, unknown>
    case 'tilt': return tiltRules(L.data) as Rules<unknown, unknown>
    case 'linked': return linkedRules(L.data) as Rules<unknown, unknown>
    case 'box': return boxRules(L.data) as Rules<unknown, unknown>
  }
}
