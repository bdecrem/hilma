// Ola's words, set in Literata. A small Markdown subset (paragraphs, lists, headings, **bold**,
// `code`) built as elements: model text never becomes HTML, so it can never inject markup.
import { For, Match, Switch, type JSX } from 'solid-js'

type Block = { kind: 'p' | 'h'; text: string } | { kind: 'ul' | 'ol'; items: string[] }

export function blocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (!line) flush()
    else if (heading) {
      flush()
      out.push({ kind: 'h', text: heading[1] })
    } else if (bullet || numbered) {
      flush()
      const kind = bullet ? 'ul' : 'ol'
      const last = out[out.length - 1]
      const item = (bullet ?? numbered)![1]
      if (last && last.kind === kind) last.items.push(item)
      else out.push({ kind, items: [item] })
    } else para.push(line)
  }
  flush()
  return out
}

/** Inline **bold** and `code`; everything else is text. */
export function Inline(props: { text: string }): JSX.Element {
  const parts = () => props.text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return (
    <For each={parts()}>
      {(part) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong>{part.slice(2, -2)}</strong>
        ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code>{part.slice(1, -1)}</code>
        ) : (
          part
        )
      }
    </For>
  )
}

export function Answer(props: { text: string; class?: string }) {
  return (
    <div class={`answer ${props.class ?? ''}`}>
      <For each={blocks(props.text)}>
        {(b) => (
          <Switch>
            <Match when={b.kind === 'p'}>
              <p>
                <Inline text={(b as { text: string }).text} />
              </p>
            </Match>
            <Match when={b.kind === 'h'}>
              <p class="answer-heading">
                <Inline text={(b as { text: string }).text} />
              </p>
            </Match>
            <Match when={b.kind === 'ul'}>
              <ul>
                <For each={(b as { items: string[] }).items}>
                  {(i) => (
                    <li>
                      <Inline text={i} />
                    </li>
                  )}
                </For>
              </ul>
            </Match>
            <Match when={b.kind === 'ol'}>
              <ol>
                <For each={(b as { items: string[] }).items}>
                  {(i) => (
                    <li>
                      <Inline text={i} />
                    </li>
                  )}
                </For>
              </ol>
            </Match>
          </Switch>
        )}
      </For>
    </div>
  )
}
