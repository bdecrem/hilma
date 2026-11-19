// The looks of the board (OLA-170): "plain" is board.css as it stands, the others are looks.css.
// A plain module, so the server (Shell.tsx) and the client (LookSwitch.tsx) both read the list.
export const LOOKS = ['plain', 'lamp', 'desk'] as const
export type Look = (typeof LOOKS)[number]
