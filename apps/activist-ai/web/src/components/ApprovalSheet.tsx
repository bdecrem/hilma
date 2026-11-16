// When opencode asks permission (under "Ask me first"), the question as a sheet over the page:
// what Ola wants to do, exactly, and three answers. A native modal <dialog>: focus stays inside,
// Escape does not answer for the person (it would be a silent "no"), the page behind is inert.
import { createEffect, createSignal, For, Show } from 'solid-js'
import type { Ola } from '../lib/ola.ts'

export function ApprovalSheet(props: { ola: Ola }) {
  let dialog: HTMLDialogElement | undefined
  let first: HTMLButtonElement | undefined
  const a = () => props.ola.state.approval
  const [busy, setBusy] = createSignal(false)
  createEffect(() => {
    if (!dialog) return
    if (a() && !dialog.open) {
      dialog.showModal()
      setBusy(false)
      queueMicrotask(() => first?.focus())
    } else if (!a() && dialog.open) dialog.close()
  })
  const reply = async (d: 'once' | 'always' | 'reject') => {
    setBusy(true)
    await props.ola.answer(d)
    setBusy(false)
  }
  return (
    <dialog ref={dialog} class="sheet approval" aria-labelledby="approval-title" aria-describedby="approval-why" onCancel={(e) => e.preventDefault()}>
      <Show when={a()}>
        {(ap) => (
          <div class="sheet-inner">
            <h2 id="approval-title" class="sheet-title">
              {ap().title}
            </h2>
            <p id="approval-why" class="sheet-lede">
              You asked Ola to check with you first. Nothing happens until you answer; it all stays on Ola’s computer.
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
