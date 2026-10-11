// The learner's face on the map: one of Dodo's jelly critters (the app's
// `Jelly/<kind>` sprites, apps/dolly/Dolly/JellyAvatar.swift). Nobody is
// faceless: a user who never picked one gets a stable critter from their
// id, and can change it from the You sheet.

export const AVATAR_KINDS = [
  'dodo', 'dodo-pink', 'dodo-peach', 'dodo-mint', 'dodo-lemon', 'dodo-grape', 'dodo-cherry', 'dodo-lime',
  'bunny', 'peach', 'cat', 'dragon', 'penguin', 'octo', 'panda', 'blob', 'hamster', 'bat', 'bee', 'cloud', 'mushroom', 'sprite',
] as const

export type AvatarKind = (typeof AVATAR_KINDS)[number]

export function isAvatarKind(x: unknown): x is AvatarKind {
  return typeof x === 'string' && (AVATAR_KINDS as readonly string[]).includes(x)
}

/** The critter a user without a pick gets: stable per id, never Gummy
 *  (Gummy is Dolly's own face). */
export function defaultAvatar(userId: string): AvatarKind {
  let h = 0
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_KINDS[h % AVATAR_KINDS.length]
}

export function avatarFor(user: { id: string; avatar: string | null }): AvatarKind {
  return isAvatarKind(user.avatar) ? user.avatar : defaultAvatar(user.id)
}
