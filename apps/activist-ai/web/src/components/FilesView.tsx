// "What Ola has of yours": every file in the workspace, who put it there, its size and date;
// upload (with the plain line on where it goes), download, delete with a confirmation.
import { createResource, createSignal, For, Show } from 'solid-js'
import { canOpen, desk, DeskError, goesInPieces, type UploadResult } from '../lib/api.ts'
import type { FileEntry, Problem } from '../lib/types.ts'
import { bytes, cap, count, when } from '../lib/format.ts'
import { Icon } from './Icon.tsx'
import { ProblemBox } from './Drawer.tsx'

export function FilesView(props: { onChanged: () => void; uploadRef?: (el: HTMLButtonElement) => void; canWrite?: boolean; deleteNotice?: string; claudeOn?: boolean; hostedOn?: boolean }) {
  const canWrite = () => props.canWrite !== false
  const [files, { refetch }] = createResource(() => desk.files())
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [status, setStatus] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [toDelete, setToDelete] = createSignal<FileEntry | null>(null)
  let picker: HTMLInputElement | undefined
  let confirm: HTMLDialogElement | undefined

  const uploaded = () => (files() ?? []).filter((f) => f.origin === 'uploaded')
  const made = () => (files() ?? []).filter((f) => f.origin === 'made')
  const total = () => uploaded().reduce((n, f) => n + f.size, 0)

  // A large file, a zip or a database goes in pieces (resumable, with progress); a zip is then
  // unpacked into a folder and a database added to Data, both inside the project's own computer.
  const [progress, setProgress] = createSignal<{ name: string; sent: number; total: number } | null>(null)
  const [notes, setNotes] = createSignal<string[]>([])
  const one = async (file: File, replace = false): Promise<UploadResult> => {
    if (!goesInPieces(file)) return desk.upload(file, { replace })
    setProgress({ name: file.name, sent: 0, total: file.size })
    try {
      return await desk.uploadLarge(file, { replace, onProgress: (sent, total) => setProgress({ name: file.name, sent, total }) })
    } finally {
      setProgress(null)
    }
  }
  const noteOf = (r: UploadResult) =>
    r.refused ??
    (r.unpacked
      ? `${r.path} was unpacked into the folder ${r.unpacked.folder}: ${count(r.unpacked.files, 'file')}${r.unpacked.renamed ? `, ${count(r.unpacked.renamed, 'name')} made plain` : ''}${r.unpacked.skipped ? `, ${r.unpacked.skipped} hidden ${r.unpacked.skipped === 1 ? 'file' : 'files'} left out` : ''}. Ola reads the documents in it now; scanned pages take longer.`
      : r.attached
        ? `${r.path} is now in Data as ${count(r.attached.tables, 'table')} named ${r.attached.alias}.…, read-only. It was checked and is whole.`
        : null)

  async function send(list: FileList | null) {
    if (!list?.length) return
    setProblem(null)
    setNotes([])
    setBusy(true)
    const done: string[] = []
    for (const file of Array.from(list)) {
      setStatus(`Sending ${file.name} to Ola’s computer…`)
      try {
        const r = await one(file)
        done.push(file.name)
        const n = noteOf(r)
        if (n) setNotes([...notes(), n])
      } catch (e) {
        if (e instanceof DeskError && e.status === 409 && window.confirm(`There is already a file called ${file.name} on Ola’s computer. Replace it with this one?`)) {
          try {
            const r = await one(file, true)
            done.push(file.name)
            const n = noteOf(r)
            if (n) setNotes([...notes(), n])
            continue
          } catch (e2) {
            setProblem(e2 instanceof DeskError ? e2.problem : { text: `${file.name} was not sent.`, detail: String(e2) })
          }
        } else if (e instanceof DeskError) setProblem({ ...e.problem, text: `${file.name} was not sent. ${e.problem.text}` })
        else setProblem({ text: `${file.name} was not sent.`, detail: String(e) })
      }
    }
    setBusy(false)
    setStatus(done.length ? `${done.join(', ')} ${done.length === 1 ? 'is' : 'are'} now on Ola’s computer.` : '')
    if (picker) picker.value = ''
    await refetch()
    props.onChanged()
  }

  function askDelete(f: FileEntry) {
    setToDelete(f)
    confirm?.showModal()
  }
  async function doDelete() {
    const f = toDelete()
    if (!f) return
    try {
      await desk.remove(f.path)
      setStatus(`${f.path} is deleted from Ola’s computer.`)
      setProblem(null)
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: `${f.path} was not deleted.`, detail: String(e) })
    }
    confirm?.close()
    setToDelete(null)
    await refetch()
    props.onChanged()
  }

  return (
    <section class="files-sheet" aria-labelledby="files-title">
      <div class="files-inner">
        <div class="files-top">
          <div>
            <h1 id="files-title" class="files-title">
              What Ola has of yours
            </h1>
            <p class="files-lede">
              <Show when={files()} fallback="Looking at what is on Ola’s computer…">
                <strong>
                  {cap(count(uploaded().length, 'file'))}, {bytes(total())},
                </strong>{' '}
                each one put there by you or someone in this project. Ola can read these and nothing else of yours: not your computer, not your email, not your drive.
              </Show>
            </p>
          </div>
          <Show when={canWrite()}>
          <div class="files-upload">
            <input ref={picker} id="file-picker" type="file" multiple class="sr-only" tabindex="-1" onChange={(e) => send(e.currentTarget.files)} />
            <button type="button" class="primary-button" ref={props.uploadRef} disabled={busy()} onClick={() => picker?.click()}>
              <Icon name="plus" size={18} /> Upload files
            </button>
            <p class="upload-line">A file you upload is copied to Ola’s computer, the Mac in Bart’s office. {props.claudeOn || props.hostedOn ? `It goes to no AI company, unless someone hands a request about it to ${props.claudeOn && props.hostedOn ? "Claude or the hosted open model" : props.claudeOn ? "Claude" : "the hosted open model"}.` : "It does not go to any AI company."}</p>
          </div>
          </Show>
        </div>

        <p class="files-status" role="status" aria-live="polite">
          {status()}
        </p>
        <Show when={progress()}>
          {(pr) => (
            <div class="upload-progress">
              <progress max={pr().total || 1} value={pr().sent} aria-label={`Sending ${pr().name}`} />
              <span class="meta">
                {bytes(pr().sent)} of {bytes(pr().total)} · {pr().total ? Math.floor((pr().sent / pr().total) * 100) : 100}%. If the connection drops, choose the file again and it carries on where it stopped.
              </span>
            </div>
          )}
        </Show>
        <For each={notes()}>{(n) => <p class="upload-note">{n}</p>}</For>
        <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
        <Show when={files.error}>
          <ProblemBox problem={files.error instanceof DeskError ? files.error.problem : { text: 'The list of files could not be loaded.', detail: String(files.error) }} role="alert" />
        </Show>

        <dl class="facts">
          <div>
            <dt>Who can open them</dt>
            <dd>The people in this project, and Bart, who runs the machine. No company can.</dd>
          </div>
          <div>
            <dt>What left the machine</dt>
            <dd>{props.claudeOn || props.hostedOn ? `Only what ${props.claudeOn && props.hostedOn ? "Claude or the hosted open model" : props.claudeOn ? "Claude" : "the hosted open model"} read for a request handed to it (${props.claudeOn && props.hostedOn ? "both fallbacks are" : props.claudeOn ? "Fallback to Claude is" : "Fallback to a hosted open model is"} on for this project). A web search or download sends only its words or its address, and asks you first unless your project said Always (Settings).` : "None of these files. A web search or download sends only its words or its address, and asks you first unless your project said Always (Settings)."}</dd>
          </div>
          <div>
            <dt>How long they stay</dt>
            <dd>Until you delete them. Deleting a file here removes it from Ola’s computer.</dd>
          </div>
        </dl>

        <FileTable title="You uploaded" files={uploaded()} empty="Nothing yet. Upload a file and Ola can work with it." onDelete={canWrite() ? askDelete : undefined} />
        <FileTable title="Ola made from them" files={made()} empty="Nothing yet. What Ola writes for you appears here." onDelete={canWrite() ? askDelete : undefined} />
      </div>

      <dialog ref={confirm} class="sheet confirm" aria-labelledby="confirm-title" onClose={() => setToDelete(null)}>
        <Show when={toDelete()}>
          {(f) => (
            <div class="sheet-inner">
              <h2 id="confirm-title" class="sheet-title">
                Delete {f().path}?
              </h2>
              <p class="sheet-lede">{props.deleteNotice ?? 'It is removed from Ola’s computer, and Ola can no longer read it. This cannot be undone. Your own copy, if you have one, is not touched.'}</p>
              <div class="sheet-actions">
                <button type="button" class="primary-button danger-fill" onClick={doDelete}>
                  Delete {f().path}
                </button>
                <button type="button" class="ghost-button on-paper" onClick={() => confirm?.close()}>
                  Keep it
                </button>
              </div>
            </div>
          )}
        </Show>
      </dialog>
    </section>
  )
}

function FileTable(props: { title: string; files: FileEntry[]; empty: string; onDelete?: (f: FileEntry) => void }) {
  const headingId = `files-${props.title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section class="file-group" aria-labelledby={headingId}>
      <h2 id={headingId} class="file-group-title">
        {props.title}
      </h2>
      <Show when={props.files.length} fallback={<p class="meta empty-files">{props.empty}</p>}>
        <table class="files">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">{props.files[0]?.origin === 'uploaded' ? 'Uploaded' : 'Changed'}</th>
              <th scope="col">
                <span class="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={props.files}>
              {(f) => (
                <tr>
                  <td>
                    <span class="file-name">
                      <Icon name={/\.(csv|xlsx?|tsv)$/i.test(f.path) ? 'table' : 'file'} size={18} />
                      <span>{f.path}</span>
                    </span>
                    <span class="file-meta">{bytes(f.size)}</span>
                  </td>
                  <td class="file-when">{when(f.uploaded ?? f.modified)}</td>
                  <td class="file-actions">
                    <Show when={canOpen(f.path)}>
                      <a href={desk.openUrl(f.path)} target="_blank" rel="noopener noreferrer">
                        Open<span class="sr-only"> {f.path} in a new tab</span>
                      </a>
                    </Show>
                    <a href={desk.downloadUrl(f.path)} download={f.path.split('/').pop()}>
                      Download<span class="sr-only"> {f.path}</span>
                    </a>
                    <Show when={props.onDelete}>
                      <button type="button" class="link-button danger" onClick={() => props.onDelete!(f)}>
                        Delete<span class="sr-only"> {f.path}</span>
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  )
}
