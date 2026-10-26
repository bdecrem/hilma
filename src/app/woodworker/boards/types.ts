import type { Level } from '../lib/levels'

export interface BoardProps<D, S, M> {
  /** Index of the room, for the seeded woodgrain. */
  room: number
  /** The art for the item and where it goes; unset is the first chapter's. */
  skin?: Level['skin']
  /** What you are after, for labels. */
  item: string
  data: D
  state: S
  /** The next move on a shortest path, while the Hint button is showing it. */
  hint: M | null
  won: boolean
  /** Try a move. False when the room refuses it (the board bumps). */
  move(m: M): boolean
}
