// Checks the Peck or Perish board: pure helpers, then real writes on the two
// test accounts (rows removed at the end). Run: set -a; source .env.local;
// set +a; npx tsx scripts/f2-peck-game-check.ts
import assert from 'node:assert/strict'
import { f2Supabase } from '../src/lib/f2/supabase'
import { boardHandle, getPeckGameBoard, isRestStop, recordPeckGameRound } from '../src/lib/f2/peck-game'

async function main() {
  assert.deepEqual([5, 10, 15, 20, 25, 0, 7, 35].map(isRestStop), [true, false, true, false, true, false, false, true])
  assert.equal(boardHandle('kira@gmail.com', false), 'kira')
  assert.equal(boardHandle('guest-2414c963e3b7', true), 'guest 2414')
  assert.equal(boardHandle('demo', false), 'demo')

  const sb = f2Supabase()
  const { data: users } = await sb.from('f2_users').select('id, username')
    .in('username', ['newx-test-imac@example.com', 'newx-test@example.com'])
  assert.equal(users?.length, 2, 'both test accounts exist')
  const a = users!.find(u => u.username === 'newx-test-imac@example.com')!.id
  const b = users!.find(u => u.username === 'newx-test@example.com')!.id
  const LEVEL = 995 // a rest stop nobody real will reach
  const clean = () => sb.from('f2_peck_game_scores').delete().eq('level', LEVEL).in('user_id', [a, b])
  await clean()
  try {
    assert.equal(await recordPeckGameRound(a, LEVEL, 1670), true, 'first round is a best')
    assert.equal(await recordPeckGameRound(a, LEVEL, 1660), false, 'worse round is not')
    assert.equal(await recordPeckGameRound(b, LEVEL, 1680), true)
    let board = await getPeckGameBoard(a, LEVEL)
    assert.equal(board.best, 1670)
    assert.equal(board.plays, 2)
    assert.equal(board.players, 2)
    assert.deepEqual(board.board.map(r => [r.rank, r.handle, r.year, r.me]),
      [[1, 'newx-test', 1680, false], [2, 'newx-test-imac', 1670, true]])
    assert.equal(await recordPeckGameRound(a, LEVEL, 1680), true, 'tie with the leader is a new best')
    board = await getPeckGameBoard(b, LEVEL)
    assert.deepEqual(board.board.map(r => r.rank), [1, 1], 'equal years share a rank')
    assert.equal(board.board[0].handle, 'newx-test', 'earlier best sorts first on a tie')
    console.log('peck-game check: all passed')
  } finally {
    await clean()
  }
}
main().catch(e => { console.error(e); process.exit(1) })
