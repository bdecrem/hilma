// Ola asks the person something and waits (OLA-301): the card drawn from its description, made
// once for every client by server/cards.mjs questionCard (OLA-325). Its choices as buttons, room
// for the person's own words, and the line that says the box under it answers it too.
import { createSignal, For, Show } from 'solid-js'
import type { Question } from '../lib/types.ts'

/** Ola asks the person something and waits: its choices as buttons, and room for their own words. */
export function QuestionCard(props: { question: Question; onAnswer: (a: Record<string, string | string[]>) => Promise<boolean> }) {
  const [busy, setBusy] = createSignal(false)
  const [own, setOwn] = createSignal<Record<string, string>>({})
  const [picked, setPicked] = createSignal<Record<string, string[]>>({})
  const single = () => props.question.tapAnswers
  const send = async (a: Record<string, string | string[]>) => {
    setBusy(true)
    const ok = await props.onAnswer(a)
    if (!ok) setBusy(false)
  }
  const fromPicks = () => {
    const a: Record<string, string | string[]> = {}
    for (const f of props.question.fields) {
      const typed = (own()[f.key] ?? '').trim()
      const chosen = picked()[f.key] ?? []
      a[f.key] = f.multiple ? [...chosen, ...(typed ? [typed] : [])] : typed || chosen[0] || ''
    }
    return a
  }
  const complete = () => Object.values(fromPicks()).every((v) => (Array.isArray(v) ? v.length > 0 : v !== ''))
  return (
    <section class="question-card" role="group" aria-labelledby={`q-${props.question.id}`} aria-busy={busy()}>
      <p class="question-kicker" id={`q-${props.question.id}`}>
        <span class="mark-dot" aria-hidden="true" /> {props.question.kicker}
      </p>
      <For each={props.question.fields}>
        {(f) => (
          <div class="question-field">
            <p class="question-text">{f.text || f.title}</p>
            <Show when={f.options.length}>
              <ul class="question-options">
                <For each={f.options}>
                  {(o) => {
                    const on = () => (picked()[f.key] ?? []).includes(o.value)
                    return (
                      <li>
                        <button
                          type="button"
                          class="question-option"
                          classList={{ on: on() }}
                          aria-pressed={single() ? undefined : on()}
                          disabled={busy()}
                          onClick={() => {
                            if (single()) return void send({ [f.key]: o.value })
                            setPicked((p) => ({ ...p, [f.key]: f.multiple ? (on() ? (p[f.key] ?? []).filter((v) => v !== o.value) : [...(p[f.key] ?? []), o.value]) : [o.value] }))
                          }}
                        >
                          <span class="question-option-label">{o.label}</span>
                          <Show when={o.description}>
                            <span class="question-option-more">{o.description}</span>
                          </Show>
                        </button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </Show>
            <Show when={f.custom}>
              <form
                class="question-own"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (single()) {
                    const t = (own()[f.key] ?? '').trim()
                    if (t) void send({ [f.key]: t })
                  } else if (complete()) void send(fromPicks())
                }}
              >
                <label class="sr-only" for={`q-own-${f.key}`}>
                  Your own answer
                </label>
                <input id={`q-own-${f.key}`} type="text" autocomplete="off" placeholder={f.placeholder} disabled={busy()} value={own()[f.key] ?? ''} onInput={(e) => setOwn((o) => ({ ...o, [f.key]: e.currentTarget.value }))} />
                <Show when={single()}>
                  <button type="submit" class="ghost-button small on-paper" disabled={busy() || !(own()[f.key] ?? '').trim()}>
                    Answer
                  </button>
                </Show>
              </form>
            </Show>
          </div>
        )}
      </For>
      {/* The box under the card answers it too, whatever its shape (OLA-311): said here, in the words every client shows (server/cards.mjs, OLA-325). */}
      <p class="meta question-box-note">{props.question.boxNote}</p>
      <Show when={!single()}>
        <div class="question-actions">
          <button type="button" class="primary-button" disabled={busy() || !complete()} onClick={() => void send(fromPicks())}>
            {props.question.send}
          </button>
        </div>
      </Show>
      <Show when={busy()}>
        <p class="meta" role="status">
          {props.question.sent}
        </p>
      </Show>
    </section>
  )
}
