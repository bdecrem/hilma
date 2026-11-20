// Publish from the conversation (OLA-230): how the page and the front desk read `ola-publish`, and
// the session rules that make it always asked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPublishCommand, publishAskOf, publishRequestOf, publishRules, sameFiles } from '../server/publishask.mjs'
import { permissionsFor } from '../server/proxy.mjs'

test('a simple call: the folder or the page, and the list', () => {
  assert.deepEqual(publishRequestOf('ola-publish site --files index.html,style.css'), { sel: { folder: 'site' }, files: ['index.html', 'style.css'] })
  assert.deepEqual(publishRequestOf("/opt/ola/bin/ola-publish /work/site/ --files 'index.html, a b.png'"), { sel: { folder: 'site' }, files: ['index.html', 'a b.png'] })
  assert.deepEqual(publishRequestOf('ola-publish ./flyer.html --files index.html'), { sel: { page: 'flyer.html' }, files: ['index.html'] })
  assert.deepEqual(publishRequestOf('ola-publish status'), { status: true })
  assert.deepEqual(publishRequestOf('ola-publish unpublish'), { unpublish: true })
  assert.ok(publishRequestOf('ola-publish unpublish --name x').bad)
})

test('forms we do not act on say why; other commands are not ours', () => {
  for (const c of ['ola-publish site --files index.html | head', 'ola-publish site', 'ola-publish --files a', 'ola-publish a b --files c', 'ola-publish site --files a --files b', 'ola-publish site --name x --files a']) assert.ok(publishRequestOf(c)?.bad, c)
  assert.equal(publishRequestOf('ls ola-publish'), null)
  assert.equal(publishRequestOf('python3 publish.py check site'), null)
  assert.equal(isPublishCommand('cd site && ola-publish x'), false)
  assert.equal(publishAskOf('edit', ['ola-publish site --files a']), null)
  assert.ok(publishAskOf('shell', ['ls', 'ola-publish site --files a']).bad)
  assert.ok(sameFiles(['b', 'a'], ['a', 'b']))
  assert.ok(!sameFiles(['a'], ['a', 'b']))
})

test('the session rules: a publish is asked under "Lots of permissions" and "Ask before each step", its status never', () => {
  // opencode's last matching rule wins: the ask comes after the allow-everything rule.
  const win = (rules, action, cmd) => {
    let effect = null
    for (const r of rules) if (r.action === action || r.action === '*') if (r.resource === '*' || r.resource === cmd || (r.resource.endsWith(' *') && cmd.startsWith(r.resource.slice(0, -1)))) effect = r.effect
    return effect
  }
  for (const mode of ['go', 'ask'])
    for (const web of ['ask', 'always']) {
      const rules = permissionsFor(mode, web)
      assert.equal(win(rules, 'shell', 'ola-publish site --files index.html'), 'ask', `${mode} ${web}`)
      assert.equal(win(rules, 'bash', '/opt/ola/bin/ola-publish site --files index.html'), 'ask')
      assert.equal(win(rules, 'shell', 'ola-publish status'), 'allow')
    }
  assert.ok(publishRules().length >= 6)
})
