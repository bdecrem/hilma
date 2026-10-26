export interface BoardProps<D, S, M> {
  /** Index of the room, for the seeded woodgrain. */
  room: number
  data: D
  state: S
  /** The next move on a shortest path, while the Hint button is showing it. */
  hint: M | null
  won: boolean
  /** Try a move. False when the room refuses it (the board bumps). */
  move(m: M): boolean
}
