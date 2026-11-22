// When opencode asks permission, the question as a sheet over the page: what Ola wants to do,
// exactly, and three answers. A native modal <dialog>: focus stays inside, Escape does not answer
// for the person (it would be a silent "no"), the page behind is inert.
//
// Two kinds of question. Under "Ask before each step": a command or a change to files ("Yes, this once" /
// "Yes, for the rest of this conversation" / "No, don't"). Always, the first time in a project: a
// web search or a download ("Allow once" / "Always in this project" / "Not now"), with one line on
// what leaves the machine. "Always in this project" is kept by the front desk for the project,
// shown and reversible in Settings; the gateway enforces it.
import { createEffect, createSignal, For, Show } from 'solid-js'
import { DeskError, site, type SitePreview } from '../lib/api.ts'
import type { Approval, Problem, PublishCard } from '../lib/types.ts'
import type { Ola } from '../lib/ola.ts'
import { ProblemBox } from './Drawer.tsx'
import { publishWithPlan } from '../../server/cards.mjs'

export function ApprovalSheet(props: { ola: Ola; provider?: string }) {
  let dialog: HTMLDialogElement | undefined
  let first: HTMLButtonElement | undefined
  const a = () => props.ola.state.approval
  const [busy, setBusy] = createSignal(false)
  // Under "Lots of permissions" the front desk answers a web search itself (OLA-139): its question
  // is shown only if it is still waiting a moment later, so nothing flashes on the screen.
  let wait: ReturnType<typeof setTimeout> | undefined
  const show = () => {
    if (!dialog || dialog.open) return
    dialog.showModal()
    setBusy(false)
    queueMicrotask(() => first?.focus())
  }
  createEffect(() => {
    if (!dialog) return
    const ap = a()
    clearTimeout(wait)
    if (ap && !dialog.open) {
      if (ap.web && props.ola.state.autonomy === 'go') wait = setTimeout(() => a()?.id === ap.id && show(), 2500)
      else show()
    } else if (!ap && dialog.open) dialog.close()
  })
  const reply = async (d: 'once' | 'always' | 'reject') => {
    setBusy(true)
    await props.ola.answer(d)
    setBusy(false)
  }
  const host = (u: string | null) => {
    try {
      return u ? new URL(u).hostname : 'the site'
    } catch {
      return 'the site'
    }
  }
  return (
    <dialog ref={dialog} class="sheet approval" aria-labelledby="approval-title" aria-describedby="approval-why" onCancel={(e) => e.preventDefault()}>
      <Show when={a()}>
        {(ap) => (
          <div class="sheet-inner">
            <Show when={!ap().publish} fallback={<PublishAsk approval={ap()} />}>
            <Show when={ap().card?.kind !== 'unpublish'} fallback={<TakeDownAsk card={ap().card!} busy={busy()} reply={reply} first={(b) => (first = b)} />}>
            <Show
              when={ap().web}
              fallback={
                <>
                  <h2 id="approval-title" class="sheet-title">
                    {ap().title}
                  </h2>
                  <p id="approval-why" class="sheet-lede">
                    {ap().engine === 'claude'
                      ? 'You asked to be checked with first. Nothing happens until you answer; the work itself is done here, in your project.'
                      : 'You asked Ola to check with you first. Nothing happens until you answer; it all stays on Ola’s computer.'}
                  </p>
                  <ul class="approval-items">
                    <For each={ap().items}>{(item) => <ApprovalItem label={item.label} detail={item.detail} action={ap().action} />}</For>
                  </ul>
                  <div class="sheet-actions">
                    <button type="button" class="primary-button" ref={first} disabled={busy()} onClick={() => reply('once')}>
                      Yes, this once
                    </button>
                    <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => reply('always')}>
                      Yes, for the rest of this conversation
                    </button>
                    <button type="button" class="ghost-button on-paper danger" disabled={busy()} onClick={() => reply('reject')}>
                      No, don’t
                    </button>
                  </div>
                </>
              }
            >
              {(w) => (
                <>
                  <h2 id="approval-title" class="sheet-title web-title">
                    {w().kind === 'search' ? 'Ola wants to search the web for:' : w().kind === 'lookup' ? 'Ola wants to look up this paper:' : 'Ola wants to download:'}
                    <span class="web-item">{w().item ?? 'the command below'}</span>
                  </h2>
                  <p id="approval-why" class="sheet-lede">
                    Before anything leaves this machine, Ola needs your yes.
                  </p>
                  <p class="web-leaves">
                    {w().kind === 'search' ? `The words of the search go to ${props.provider ?? 'the search service'}. Nothing from your files is sent.` : w().kind === 'lookup' ? 'This reference goes to Crossref and Unpaywall, public catalogs of research papers. Nothing from your files is sent.' : `Ola asks ${host(w().item)} for this one address. Nothing from your files is sent.`}
                  </p>
                  <Show when={!w().item}>
                    <ul class="approval-items">
                      <For each={ap().items}>{(item) => <ApprovalItem label={item.label} detail={item.detail} action="shell" />}</For>
                    </ul>
                  </Show>
                  <div class="sheet-actions">
                    <button type="button" class="primary-button" ref={first} disabled={busy()} onClick={() => reply('once')}>
                      Allow once
                    </button>
                    <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => reply('always')}>
                      Always in this project
                    </button>
                    <button type="button" class="ghost-button on-paper danger" disabled={busy()} onClick={() => reply('reject')}>
                      Not now
                    </button>
                  </div>
                  <p class="meta web-note">“Always” lets Ola search and download in this project without asking again. You can turn it off in Settings.</p>
                </>
              )}
            </Show>
            </Show>
            </Show>
          </div>
        )}
      </Show>
    </dialog>
  )
}

function ApprovalItem(props: { label: string; detail: string | null; action: string }) {
  const isCommand = () => props.action === 'shell' || props.action === 'bash'
  const [open, setOpen] = createSignal(false)
  return (
    <li class="approval-item">
      <p class="approval-label">{props.label}</p>
      <Show when={props.detail}>
        <Show
          when={isCommand()}
          fallback={
            <>
              <button type="button" class="link-button on-paper details-toggle" aria-expanded={open()} onClick={() => setOpen(!open())}>
                {open() ? 'Hide the change' : 'Show the change'}
              </button>
              <Show when={open()}>
                <pre>{props.detail}</pre>
              </Show>
            </>
          }
        >
          <p class="details-label">The exact command</p>
          <pre>{props.detail}</pre>
        </Show>
      </Show>
    </li>
  )
}

/** Ola asks to take the project's pages down (OLA-230): the card's words from server/cards.mjs (OLA-325), never the command. */
function TakeDownAsk(props: { card: PublishCard; busy: boolean; reply: (d: 'once' | 'reject') => void; first: (b: HTMLButtonElement) => void }) {
  return (
    <>
      <h2 id="approval-title" class="sheet-title">
        {props.card.title}
      </h2>
      <p id="approval-why" class="sheet-lede">
        {props.card.lede}
      </p>
      <div class="sheet-actions">
        <button type="button" class="primary-button" ref={props.first} disabled={props.busy} onClick={() => props.reply('once')}>
          {props.card.yes}
        </button>
        <button type="button" class="ghost-button on-paper danger" disabled={props.busy} onClick={() => props.reply('reject')}>
          {props.card.no}
        </button>
      </div>
    </>
  )
}

/**
 * Ola asks to publish (OLA-230): the Publish sheet's list in the conversation. The files that would
 * go public and their address, from the front desk's own check; "Publish these N files" sends the
 * fingerprint of exactly this list, and the front desk publishes it and tells Ola how it went.
 */
function PublishAsk(props: { approval: Approval }) {
  const [plan, setPlan] = createSignal<SitePreview | null>(null)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [busy, setBusy] = createSignal(false)
  let first: HTMLButtonElement | undefined
  // The card once the front desk has looked at the files: every line from server/cards.mjs (OLA-325).
  const card = () => (plan() && props.approval.card ? publishWithPlan(props.approval.card, plan()) : null)
  createEffect(() => {
    const p = props.approval.publish
    if (!p) return
    setPlan(null)
    setProblem(null)
    site
      .preview(p.sel)
      .then((x) => (setPlan(x), queueMicrotask(() => first?.focus())))
      .catch((e) => setProblem(e instanceof DeskError ? e.problem : { text: 'The files could not be checked just now. Nothing was published.', detail: String(e) }))
  })
  const send = async (a: { decision: 'once'; fingerprint: string } | { decision: 'reject'; message?: string }) => {
    setBusy(true)
    try {
      await site.answer(props.approval.sessionID, props.approval.id, a)
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'Your answer did not reach Ola. Try again.', detail: String(e) })
      setBusy(false)
    }
  }
  return (
    <>
      <h2 id="approval-title" class="sheet-title">
        {props.approval.card?.title ?? 'Ola wants to publish this on the web'}
      </h2>
      <p id="approval-why" class="sheet-lede">
        {props.approval.card?.lede}
      </p>
      <Show when={!plan() && !problem()}>
        <p class="publish-status" role="status">
          {props.approval.card?.checking}
        </p>
      </Show>
      <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
      <Show when={card()}>
        {(c) => (
          <>
            <p class="publish-address">
              The address: <strong>{c().address}</strong>
            </p>
            <h3 class="publish-heading">{c().heading}</h3>
            <ul class="publish-files">
              <For each={c().files}>
                {(f, i) => (
                  <li>
                    <span class="publish-name">{f}</span>
                    <span class="publish-meta">{c().fileNotes?.[i()]}</span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={c().leftOut}>
              <p class="meta">{c().leftOut}</p>
            </Show>
            <For each={c().warnings ?? []}>{(w) => <p class="publish-warning">{w}</p>}</For>
            <Show when={c().aup}>
              <p class="meta publish-aup">{c().aup}</p>
            </Show>
          </>
        )}
      </Show>
      <div class="sheet-actions">
        <Show when={card()}>
          <button type="button" class="primary-button" ref={first} disabled={busy()} onClick={() => send({ decision: 'once', fingerprint: plan()!.fingerprint })}>
            {busy() ? 'Publishing…' : card()!.yes}
          </button>
        </Show>
        <button type="button" class="ghost-button on-paper danger" disabled={busy()} onClick={() => send({ decision: 'reject', ...(problem() ? { message: `Not published: ${problem()!.text}` } : { message: 'The person said not now. Nothing was published.' }) })}>
          {props.approval.card?.no ?? 'Not now'}
        </button>
      </div>
    </>
  )
}
