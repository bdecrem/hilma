// Publish (OLA-209): a page Ola made, put on the public web at sites.ola.cx/<project>/. The sheet
// lists exactly the files that would become public and the address they get, and publishes only on
// the owner's yes, every time, whatever "Lots of permissions" says: it leaves the machine and is
// public. The front desk checks the files for secrets and private data first, and publishes only
// the list that was shown (frontdesk/sites.mjs).
import { createEffect, createSignal, For, Show } from 'solid-js'
import { DeskError, site, type SiteChoice, type SitePreview, type SiteStatus } from '../lib/api.ts'
import { bytes, count } from '../lib/format.ts'
import type { Problem } from '../lib/types.ts'
import { ProblemBox } from './Drawer.tsx'

const short = (u: string) => u.replace(/^https?:\/\//, '')

export function PublishSheet(props: { page: string | null; status: SiteStatus | undefined; onClose: () => void; onChanged: () => void }) {
  let dialog: HTMLDialogElement | undefined
  const [whole, setWhole] = createSignal(false)
  const [plan, setPlan] = createSignal<SitePreview | null>(null)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [busy, setBusy] = createSignal<'' | 'looking' | 'publishing' | 'unpublishing'>('')
  const [done, setDone] = createSignal<{ url: string; live: boolean; again: boolean } | null>(null)
  const [gone, setGone] = createSignal(false)
  const [sure, setSure] = createSignal(false)
  const folder = () => (props.page && props.page.includes('/') ? props.page.slice(0, props.page.lastIndexOf('/')) : null)
  const choice = (): SiteChoice | null => (!props.page ? null : whole() && folder() ? { folder: folder()! } : { page: props.page })
  const published = () => (gone() ? null : plan()?.published ?? props.status?.published ?? null)
  const fail = (e: unknown) => setProblem(e instanceof DeskError ? e.problem : { text: 'That did not work. Nothing was published.', detail: String(e) })

  const look = async () => {
    const c = choice()
    if (!c) return
    setBusy('looking')
    setProblem(null)
    setPlan(null)
    try {
      setPlan(await site.preview(c))
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }
  createEffect(() => {
    if (!dialog) return
    if (props.page) {
      if (!dialog.open) {
        setWhole(false)
        setDone(null)
        setGone(false)
        setSure(false)
        dialog.showModal()
      }
      void look()
    } else if (dialog.open) dialog.close()
  })
  const publish = async () => {
    const c = choice()
    const p = plan()
    if (!c || !p) return
    setBusy('publishing')
    setProblem(null)
    try {
      const r = await site.publish(c, p.fingerprint)
      setDone({ url: r.url, live: r.live, again: r.again })
      setGone(false)
      props.onChanged()
    } catch (e) {
      fail(e)
      // The files changed since the list was shown: show the new list.
      if (e instanceof DeskError && e.status === 409) void look()
    } finally {
      setBusy('')
    }
  }
  const unpublish = async () => {
    if (!sure()) return setSure(true)
    setBusy('unpublishing')
    setProblem(null)
    try {
      await site.unpublish()
      setGone(true)
      setDone(null)
      setSure(false)
      props.onChanged()
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  return (
    <dialog ref={dialog} class="sheet publish-sheet" aria-labelledby="publish-title" aria-describedby="publish-why" onClose={props.onClose}>
      <div class="sheet-inner">
        <h2 id="publish-title" class="sheet-title">
          {published() ? 'Publish again' : 'Publish to the web'}
        </h2>
        <p id="publish-why" class="sheet-lede">
          These files will be public: anyone with the address can open them, and search engines may find them. Nothing else in the project leaves Ola’s computer.
        </p>
        <Show when={folder()}>
          <fieldset class="publish-choice">
            <legend class="sr-only">What to publish</legend>
            <label>
              <input type="radio" name="publish-what" checked={!whole()} disabled={!!busy()} onChange={() => (setWhole(false), void look())} /> This page and what it uses
            </label>
            <label>
              <input type="radio" name="publish-what" checked={whole()} disabled={!!busy()} onChange={() => (setWhole(true), void look())} /> Everything in {folder()}/
            </label>
          </fieldset>
        </Show>
        <Show when={busy() === 'looking'}>
          <p class="publish-status" role="status">
            Looking at the files and checking them for passwords and private data…
          </p>
        </Show>
        <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
        <Show when={done()}>
          {(d) => (
            <p class="publish-done" role="status">
              {d().again ? 'Published again. ' : 'Published. '}It is at{' '}
              <a href={d().url} target="_blank" rel="noopener noreferrer">
                {short(d().url)}
              </a>
              {d().live ? '' : '. The host is still putting it up; it shows within a minute or two.'}
            </p>
          )}
        </Show>
        <Show when={gone()}>
          <p class="publish-done" role="status">
            Taken down. The address now says nothing is published there.
          </p>
        </Show>
        <Show when={plan() && !done()}>
          {(_) => {
            const p = () => plan()!
            return (
              <>
                <p class="publish-address">
                  The address: <strong>{short(p().url)}</strong>
                </p>
                <h3 class="publish-heading">{count(p().items.length, 'file')} will be public, {bytes(p().total)}</h3>
                <ul class="publish-files">
                  <For each={p().items}>
                    {(i) => (
                      <li>
                        <span class="publish-name">{i.as}</span>
                        <span class="publish-meta">
                          {bytes(i.size)}
                          {i.as === 'index.html' && !i.path.endsWith('index.html') ? ` · from ${i.path.split('/').pop()}` : ''}
                          {i.uploaded ? ' · added by your group' : ''}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={p().leftOut.length}>
                  <p class="meta">Left out: {count(p().leftOut.length, 'hidden or working file')}.</p>
                </Show>
                <For each={p().warnings}>{(w) => <p class="publish-warning">{w}</p>}</For>
              </>
            )
          }}
        </Show>
        <p class="meta publish-aup">{props.status?.acceptableUse ?? plan()?.acceptableUse}</p>
        <div class="sheet-actions">
          <Show when={plan() && !done()}>
            <button type="button" class="primary-button" disabled={!!busy()} onClick={publish}>
              {busy() === 'publishing' ? 'Publishing…' : published() ? `Publish these ${count(plan()!.items.length, 'file')} again` : `Publish these ${count(plan()!.items.length, 'file')}`}
            </button>
          </Show>
          <Show when={published() || done()}>
            <button type="button" class="ghost-button on-paper danger" disabled={!!busy()} onClick={unpublish}>
              {busy() === 'unpublishing' ? 'Taking it down…' : sure() ? 'Yes, take it down now' : 'Unpublish'}
            </button>
          </Show>
          <button type="button" class="ghost-button on-paper" disabled={busy() === 'publishing' || busy() === 'unpublishing'} onClick={() => dialog?.close()}>
            {done() || gone() ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
