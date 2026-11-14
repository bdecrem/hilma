// Test-runs a piece of room code through the same fence as a saved room (room-check.ts), nothing saved.
// Usage: npx tsx scripts/semibart/room-try.ts <code.js>
import { readFileSync } from 'node:fs'
import { checkRoomCode } from '../../src/lib/semibart/room-check'
const r = checkRoomCode(readFileSync(process.argv[2], 'utf8'))
console.log(JSON.stringify(r).slice(0, 500))
process.exit(r.ok ? 0 : 1)
