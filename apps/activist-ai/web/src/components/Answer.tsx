// Ola's words, set in Literata. A small Markdown subset (paragraphs, lists, headings, tables, **bold**,
// `code`, links to the web) built as elements: model text never becomes HTML, so it can never inject
// markup.
import { For, Match, Switch, type JSX } from 'solid-js'
import { desk } from '../lib/api.ts'
import { citation, CITE_SPLIT } from '../lib/cite.ts'
import { blocks, projectPaths } from '../lib/blocks.ts'
import { webLink, WEB_BARE_SPLIT, WEB_MD_SPLIT } from '../lib/weblink.ts'

/** Inline **bold**, `code`, citations (lib/cite.ts) and web links (lib/weblink.ts); everything else is text. */
export function Inline(props: { text: string }): JSX.Element {
  const parts = () => props.text.split(new RegExp(`(${CITE_SPLIT.source}|${WEB_MD_SPLIT.source}|\\*\\*[^*]+\\*\\*|\`[^\`]+\`|${WEB_BARE_SPLIT.source})`, 'g')).filter(Boolean)
  return (
    <For each={parts()}>
      {(part) =>
        citation(part) ? (
          <a class="cite" href={desk.openUrl(citation(part)!.path, citation(part)!.page)} target="_blank" rel="noopener noreferrer">
            {citation(part)!.label}
            <span class="sr-only"> (opens {citation(part)!.path}{citation(part)!.page ? ` at page ${citation(part)!.page}` : ''} in a new tab)</span>
          </a>
        ) : webLink(part) ? (
          <a class="weblink" href={webLink(part)!.href} target="_blank" rel="noopener noreferrer nofollow">
            {webLink(part)!.label}
            {/* The space stays outside the inline-block: inside it, it is dropped and the site's name runs into the label (OLA-267). */}
            {webLink(part)!.titled ? ' ' : null}
            {webLink(part)!.titled ? <span class="weblink-host">{webLink(part)!.host}</span> : null}
          </a>
        ) : part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          // Bold may hold code or a citation (**`totals.xlsx`**): drawn too, never as raw backticks.
          <strong>
            <Inline text={part.slice(2, -2)} />
          </strong>
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
      <For each={blocks(projectPaths(props.text))}>
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
            <Match when={b.kind === 'table'}>
              <div class="answer-table" tabindex="0" role="region" aria-label="Table">
                <table>
                  <thead>
                    <tr>
                      <For each={(b as { head: string[] }).head}>
                        {(c) => (
                          <th scope="col">
                            <Inline text={c} />
                          </th>
                        )}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={(b as { rows: string[][] }).rows}>
                      {(r) => (
                        <tr>
                          <For each={r}>
                            {(c) => (
                              <td>
                                <Inline text={c} />
                              </td>
                            )}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
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
