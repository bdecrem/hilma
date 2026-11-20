// "How Ola works": the architecture page at ola.cx/architecture (OLA-219). Every claim is true of the
// system as it runs (checked against apps/activist-ai/OVERVIEW.md and README.md, 2026-11-19; again 2026-11-20, OLA-297); what is
// not live yet is labeled Planned. Public page: no addresses, ports, paths on the machine, internal
// service names, account names or people's names. build.mjs wraps it in the site's head and styles.

// ---------- the diagram: one request's path, drawn inline (viewBox 420 × 824) ----------
// Layout math (y down): you 28–66 · arrow 112–168 · the machine 170–690 (application server 214–278,
// the sealed project 310–460 with two copies behind it, the gate 522–600, Ola's model 622–674)
// · what may leave 720–820, three boxes of 132 with gaps of 12 (3 × 132 + 2 × 12 = 420).
export const DIAGRAM_CSS = `
.dg{display:block;overflow:visible}
.dg text{fill:var(--text)}
.dg .t{font-family:var(--grot);font-weight:650;font-size:16.5px;letter-spacing:-.01em}
.dg .c{font-family:var(--grot);font-weight:650;font-size:14px;text-anchor:middle}
.dg .s{font-family:var(--book);font-size:13.5px;fill:var(--text2)}
.dg .y{fill:var(--link)}
.dg .box{fill:var(--ground);stroke:var(--text);stroke-width:1.6}
.dg .frame{fill:rgba(10,18,40,.28);stroke:var(--text);stroke-width:1.6}
.dg .ghost{fill:var(--ground);stroke:var(--text2);stroke-width:1.2;opacity:.55}
.dg .seal{fill:var(--ground);stroke:var(--comma);stroke-width:2.4}
.dg .gate{fill:var(--ground);stroke:var(--link);stroke-width:2.2}
.dg .chip{fill:rgba(247,240,227,.07);stroke:var(--text2);stroke-width:1}
.dg .ln{fill:none;stroke:var(--text);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.dg .dash{stroke-dasharray:5 6}
.dg .dot{fill:var(--comma)}`

export function diagram({ cls = 'dg', id = 'a' } = {}) {
  const ar = `marker-end="url(#ah-${id})"`
  const box = (c, x, y, w, h) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>`
  return `<svg class="${cls}" viewBox="0 0 420 824" role="img" aria-labelledby="dg-${id}-t">
<title id="dg-${id}-t">The request path. A browser, the Mac app or the iPhone app connects over an encrypted connection to the Ola machine: first the application server (sign-in, teams, files, access log), the only path to each project's VM, then the project's dedicated Linux VM, which holds the agent, the files and the project database and has no internet connection. The VM's only outbound route is the model gateway, which checks every request and logs metadata only. The gateway sends model requests to Ola's own model. Three paths leave the machine, each only after approval: public pages (when the owner publishes), the web (approved searches and downloads), and an outside model (when the owner has enabled it).</title>
<defs><marker id="ah-${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.2 9 5 1 8.8" fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<text class="s" x="0" y="16">You, on</text>
${box('chip', 0, 28, 128, 38)}${box('chip', 146, 28, 128, 38)}${box('chip', 292, 28, 128, 38)}
<text class="c" x="64" y="52">Browser</text><text class="c" x="210" y="52">Mac app</text><text class="c" x="356" y="52">iPhone app</text>
<path class="ln" d="M64 66 210 112M210 66V112M356 66 210 112"/>
<path class="ln" d="M210 112V166" ${ar}/>
<text class="s" x="224" y="134" style="fill:var(--text)">encrypted (TLS)</text>
<text class="s" x="224" y="152">relayed without decryption</text>
<rect class="frame" x="24" y="170" width="372" height="520" rx="20"/>
<text class="t" x="44" y="198">The Ola machine</text>
<text class="s" x="376" y="198" text-anchor="end">one physical machine</text>
${box('box', 44, 214, 332, 64)}
<text class="t" x="60" y="240">Application server</text>
<text class="s" x="60" y="262">sign-in · teams · files · access log</text>
<path class="ln" d="M210 278V308" ${ar}/>
${box('ghost', 56, 322, 332, 150)}${box('ghost', 50, 316, 332, 150)}${box('seal', 44, 310, 332, 150)}
<text class="t" x="60" y="336">Dedicated Linux VM</text>
${box('chip', 60, 352, 96, 44)}${box('chip', 162, 352, 96, 44)}${box('chip', 264, 352, 96, 44)}
<text class="c" x="108" y="379">the agent</text><text class="c" x="210" y="379">files</text><text class="c" x="312" y="379">database</text>
<text class="s" x="60" y="424" style="fill:var(--text)">No internet connection. Own disk.</text>
<text class="s" x="60" y="444">Nothing from other projects.</text>
<text class="s" x="384" y="490" text-anchor="end">one per project</text>
<path class="ln" d="M210 472V520" ${ar}/>
<text class="s y" x="198" y="500" text-anchor="end">only outbound route</text>
${box('gate', 44, 522, 332, 78)}
<text class="t" x="60" y="548">Model gateway</text>
<text class="s" x="60" y="569">holds the API keys, checks every request,</text>
<text class="s" x="60" y="587">logs metadata, never content</text>
<path class="ln" d="M122 600V620" ${ar}/>
${box('box', 44, 622, 170, 52)}
<text class="t" x="58" y="644" style="font-size:15.5px">Ola’s own model</text>
<text class="s" x="58" y="664">local from December</text>
<path class="ln dash" d="M44 246H12V704H66V718" ${ar}/>
<path class="ln dash" d="M250 600V704H210V718" ${ar}/>
<path class="ln dash" d="M354 600V718" ${ar}/>
<circle class="dot" cx="24" cy="246" r="4.5"/><circle class="dot" cx="250" cy="690" r="4.5"/><circle class="dot" cx="354" cy="690" r="4.5"/>
${box('box', 0, 720, 132, 100)}${box('box', 144, 720, 132, 100)}${box('box', 288, 720, 132, 100)}
<text class="t" x="12" y="746" style="font-size:15.5px">Public pages</text>
<text class="s" x="12" y="768" style="fill:var(--text)">sites.ola.cx</text>
<text class="s" x="12" y="787">only when the</text><text class="s" x="12" y="805">owner publishes</text>
<text class="t" x="156" y="746" style="font-size:15.5px">The web</text>
<text class="s" x="156" y="768" style="fill:var(--text)">via the gateway</text>
<text class="s" x="156" y="787">only approved</text><text class="s" x="156" y="805">requests</text>
<text class="t" x="300" y="746" style="font-size:15.5px">Outside model</text>
<text class="s" x="300" y="768" style="fill:var(--text)">hosted, or Claude</text>
<text class="s" x="300" y="787">only if the owner</text><text class="s" x="300" y="805">enabled it</text>
</svg>`
}

// ---------- the page ----------
export const ARCH_CSS = `
.page{max-width:1360px;margin:0 auto;padding:26px 56px 64px;display:grid;grid-template-columns:minmax(0,620px) minmax(0,1fr);column-gap:64px;align-items:start}
.top{grid-column:1;margin-bottom:6px}
.top a{display:inline-block}
.hello{display:block;width:150px;height:auto;margin:0 0 0 -5px;overflow:visible}
.text{grid-column:1;min-width:0}
.fig{grid-column:2;grid-row:1/span 3;position:sticky;top:0;margin:0;padding:18px 0 12px;display:flex;flex-direction:column;align-items:center}
/* the diagram is 420 × 824: its width follows the window's height, so the whole path and its caption stay in view */
.fig svg{width:min(100%,440px,calc((100dvh - 128px) * 420 / 824));height:auto}
.fig figcaption{font-style:italic;font-size:14.5px;line-height:1.45;color:var(--text2);margin-top:12px;width:min(100%,440px);text-wrap:pretty}
h1{margin:18px 0 16px;font-weight:400}
h1 .h{display:block;font-family:var(--grot);font-weight:720;font-size:44px;line-height:1.04;letter-spacing:-.03em;font-variation-settings:'opsz' 72}
h1 .k{display:block;font-family:var(--book);font-size:20.5px;line-height:1.45;margin-top:12px;max-width:28em;text-wrap:pretty}
h2{font-family:var(--grot);font-weight:700;font-size:25px;line-height:1.15;letter-spacing:-.02em;margin:44px 0 12px;font-variation-settings:'opsz' 48;text-wrap:balance}
h2 .n{color:var(--comma);margin-right:.35em}
p{margin:0 0 12px;max-width:36em;text-wrap:pretty}
ul{margin:0 0 14px;padding:0;list-style:none;max-width:36em}
li{position:relative;padding-left:22px;margin:0 0 8px;text-wrap:pretty}
li::before{content:"";position:absolute;left:3px;top:.62em;width:7px;height:7px;border-radius:50%;background:var(--comma)}
b{font-weight:600;color:var(--text)}
code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:rgba(247,240,227,.08);padding:1px 5px;border-radius:4px}
a{color:var(--text);text-underline-offset:3px;text-decoration-color:var(--comma);text-decoration-thickness:1.5px}
a:hover{color:var(--link);text-decoration-color:var(--link)}
.status{margin:18px 0 8px;color:var(--text2)}
.tag{display:inline-block;font-family:var(--grot);font-weight:650;font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;line-height:1;padding:4px 7px 3px;border-radius:5px;margin-right:8px;vertical-align:2px;white-space:nowrap}
.tag.live{color:var(--btn-text);background:var(--link)}
.tag.plan{color:var(--text2);border:1.3px dashed var(--text2);padding:3px 6px 2px}
.end{margin-top:48px;padding-top:18px;border-top:1px solid rgba(201,210,234,.3);font-size:15.5px;color:var(--text2)}
.end p{margin:0 0 6px}
@media (max-width:1040px){
  .page{display:block;padding:18px 20px 48px;max-width:680px}
  .hello{width:128px}
  .fig{position:static;margin:26px 0 8px;padding:0}
  .fig svg{width:100%;max-width:460px}
  .fig figcaption{width:auto;max-width:460px;font-size:14px}
  h1 .h{font-size:34px}
  h1 .k{font-size:19px}
  h2{font-size:22px;margin-top:38px}
}
@media (max-width:600px){
  body{font-size:17px}
  .fig{margin-left:-4px;margin-right:-4px}
}`

const live = (t = 'Live') => `<span class="tag live">${t}</span>`
const plan = (t = 'Planned') => `<span class="tag plan">${t}</span>`

export function archBody({ wordmark }) {
  const fig = `<figure class="fig">${diagram()}<figcaption>The request path. Dashed lines carry data only after explicit approval. Red dots mark where data leaves the machine.</figcaption></figure>`
  return `<body>
<main class="page">
  <div class="top"><a href="/" aria-label="Ola, back to ola.cx">${wordmark}</a></div>
  <div class="text">
    <h1><span class="h">How Ola works</span><span class="k">A technical overview: where the work runs, what can leave the machine, and what is logged.</span></h1>
    <p class="status">Ola runs on a staging machine for now, with made-up data only.</p>
  </div>
  ${fig}
  <div class="text">
    <h2><span class="n">1</span>Two runtimes</h2>
    <p>${live()}<b>Cloud runtime.</b> The agent and the project’s files are on the Ola machine. The clients are the web app at app.ola.cx, the Mac app and the iPhone app. The apps reach the same cloud projects by signing in with the same name and password as the web app, and all three show the same projects and conversations.</p>
    <p>${live()}<b>Local runtime.</b> The Mac app or the <code>ola</code> command runs the agent on your Mac, in a folder you choose. The files stay on the Mac. Model requests and web searches go to the Ola machine’s gateway. The iPhone app can connect to the Mac over a private network.</p>

    <h2><span class="n">2</span>The application server</h2>
    <p>${live()}Every request from a client goes first to the application server, a process on the Ola machine. It handles sign-in, team membership, file uploads and downloads, and the access log. It is the only path to a project’s virtual machine: a client never connects to a VM directly.</p>
    <p>It checks the person’s session and role on every request before passing it on. When a page is published, the application server reads the files out of the VM and publishes them (section 9).</p>

    <h2><span class="n">3</span>A dedicated Linux system for each project</h2>
    <p>${live()}Each project gets its own secure, dedicated Linux system: a virtual machine with its own disk and no internet connection. It holds that project’s files and database, and nothing from any other project.</p>
    <ul>
      <li>No network access. The VM cannot open a connection to the internet.</li>
      <li>Read-only root file system. Processes run without root privileges or Linux capabilities.</li>
      <li>The agent runs inside the VM. It reads documents, runs code, and writes tables, charts and pages there.</li>
      <li>An idle VM stops after 30 minutes and restarts within seconds on the next request. At most four run at once.</li>
    </ul>
    <p>Documents can contain instructions aimed at the agent (prompt injection). The VM’s only outbound route is the model gateway, which carries model requests and the web requests that were allowed. Two more things run in every project:</p>
    <ul>
      <li><b>Text addressed to an AI.</b> When a file or the result of a tool contains text that speaks to an AI and tells it what to do, a plugin in the VM adds a note to that result: the text is data, it is not to be followed, and the person is to be told about it. Nothing is blocked or changed. The Mac’s local runtime has the same plugin.</li>
      <li><b>Which engine made each file.</b> The project keeps a record of which engine last made or changed each file: Ola’s own model, the hosted open model or Claude. Ola reads this record before saying who made something, and says it does not know when there is no record.</li>
    </ul>

    <h2><span class="n">4</span>The model gateway</h2>
    <p>${live()}The gateway is a separate process on the Ola machine. It holds the model providers’ API keys; the VMs never see them. Each VM has its own access token, bound to its own connection, so a token copied out of one VM is refused through any other.</p>
    <ul>
      <li><b>Carries:</b> model requests (the prompt, including any file content the agent puts in it) and approved web searches and downloads.</li>
      <li><b>Enforces:</b> caller identity, request size, timeouts, concurrency, and a weekly token allowance per project.</li>
      <li><b>Logs:</b> one line per request: project, model, tokens in and out, duration, status. Never the content of a prompt or a response.</li>
      <li>Rebuilds each model response from a fixed allowlist of fields before returning it to the VM.</li>
    </ul>

    <h2><span class="n">5</span>Storage</h2>
    <p>${live()}<b>Cloud runtime.</b> Each project’s data is on its VM’s disk: uploads, web downloads, the agent’s output and the conversation history. Each project has its own SQLite database, with a full-text index of its documents by page and every table the agent creates. Deleting a project deletes its disk and its database.</p>
    <p>The web app shows all of it. <b>Files</b> lists every file. <b>Data</b> lists every table with its source and row count. The database can be downloaded as one file, and any table as an Excel file.</p>
    <p>A separate platform database, kept by the application server, holds accounts, teams, projects and the access log. It stores no file names, file contents or message text. Files are recorded as keyed hashes.</p>
    <p>${live()}<b>Local runtime.</b> Files stay in the chosen folder on the Mac.</p>

    <h2><span class="n">6</span>Accounts and access</h2>
    <p>${live()}Sign-in is a name and a password, by invitation only. Passkeys are optional. Sessions are stored on the server, without IP addresses or browser details. The Mac app keeps its sign-in in the macOS Keychain.</p>
    <p>Each project has a team with three roles:</p>
    <ul>
      <li><b>Owner:</b> full access, including project settings and publishing.</li>
      <li><b>Member:</b> read, upload, delete, and run the agent.</li>
      <li><b>Viewer:</b> read only.</li>
    </ul>
    <p>A non-member gets the same “not found” response as for a project that does not exist. Removing a member takes effect on their next request and closes their open connections.</p>
    <p>The <b>access log</b> records sign-ins, file uploads, downloads and deletions, files the agent read, publishing, and every request sent to an outside model. Members can read their own project’s log.</p>
    <p>The machine has one operator, with administrative access to everything on it. The admin tools report table names, row counts and sizes, not file contents.</p>

    <h2><span class="n">7</span>Models</h2>
    <p>Ola uses open-weight models first.</p>
    <p>${live('Live, staging')}On staging, the open models are rented from Together AI. Staging holds only test data.</p>
    <p>${plan('Planned, December')}The everyday models run on the Ola machine itself. Their prompts do not leave it.</p>
    <p>${plan('Decided, not built')}<b>Design work.</b> Requests to design a page or an app screen are to go to a separate design model, Inkling-2-Small, an open model by Thinking Machines, hosted on Together AI. Once the everyday models run on the Ola machine, a design request will leave it only in a project whose owner has switched on the hosted model. In any other project, Ola’s own model does the design work.</p>
    <p>${live()}<b>Two fallbacks, off by default:</b> a hosted open-weight model and Claude (Anthropic). When one is used, the request and the file content the agent includes in it go to that provider.</p>
    <ul>
      <li>Only the project owner can enable them, after a consent screen that states what is sent and where. They can be disabled at any time. Members cannot enable them.</li>
      <li>The owner sets when a fallback is used: on request, when the agent is stuck, or always. The owner can also approve a single request. The agent can suggest a fallback; nothing is sent without one of these.</li>
      <li>Each use is marked in the conversation and recorded in the access log. Each project has a monthly spending cap.</li>
      <li>Claude Code runs inside the same VM, and its requests go through the same gateway.</li>
    </ul>
    <p>The order is fixed: the local open model, then a hosted open model, then Claude.</p>

    <h2><span class="n">8</span>Web search and downloads</h2>
    <p>${live()}The VM cannot reach the web. The gateway performs searches and downloads for the agent.</p>
    <ul>
      <li>Search queries go to Brave Search. The query is the only thing sent. The agent writes it, so it can contain words from the project.</li>
      <li>With “Lots of permissions” on (the default), searches and downloads run without a prompt. With it off, Ola asks before each one.</li>
      <li>Standing approvals for a project are listed in its Settings, with who granted them and when, and can be revoked there.</li>
      <li>Downloads are stored in the project with their source URL.</li>
    </ul>

    <h2><span class="n">9</span>Publishing</h2>
    <p>${live('Being finished')}A page Ola made in a cloud project can be published at sites.ola.cx/&lt;project&gt;. Nothing is public until the project owner says yes. The agent cannot publish: the VM has no network, so the application server reads the files out and publishes them.</p>
    <ul>
      <li>There are two ways to start: the Publish button on a page in the web app, or asking Ola in the conversation. Either way, the owner is shown the exact files and the address, and nothing leaves until the owner confirms.</li>
      <li>Every file is checked first. Publishing is refused for files that contain keys or passwords, for database files, and for secret files such as <code>.env</code>.</li>
      <li>Published files are static and served by Vercel, not by the Ola machine. Each page runs sandboxed: it has no cookies or storage, and forms on it send nothing.</li>
      <li>Unpublish, or asking Ola to take the page down, removes it. The operator can also take any page down.</li>
    </ul>
    <p><b>Status.</b> Publishing with the button on the website has passed a test. Asked in the conversation, it failed about one time in five in the last test: Ola said the new page was live while the address still showed the previous version. A fix is written and is not yet on the staging machine. Publishing from the Mac and iPhone apps has not been tested.</p>

    <h2><span class="n">10</span>Encryption, backups and deletion</h2>
    <p>${live()}<b>In transit.</b> Connections to app.ola.cx use TLS, terminated on the Ola machine. The relay that carries traffic in from the internet forwards it without decrypting it.</p>
    <p>${live('Today')}<b>At rest.</b> The staging machine holds only test data. Its disk is not encrypted.</p>
    <p>${plan('Planned, December')}Full-disk encryption on the production machine before any real data, with projects run under a dedicated system account. Staging never holds real data.</p>
    <p>${live()}<b>Backups.</b> Every night, every project, the platform database and the gateway’s usage records are copied, encrypted with age, and stored on the staging machine. Copies are kept for 14 days, and one a week for 8 weeks. Once a week a restore test decrypts copies, checks every file against its checksum, and loads one project into a new VM.</p>
    <p>${plan()}On the production machine: a backup drive that stays attached, and a second drive kept off site and swapped weekly, so one copy is always outside the building. There is no off-site copy yet.</p>
    <p>${live()}<b>Deletion.</b> Deleting a file removes it from the project immediately. Deleting a project removes its disk and its database. A deleted file can remain in the encrypted backups for up to 8 weeks.</p>

    <h2><span class="n">11</span>Changes and checks</h2>
    <p>${live()}Every change to Ola’s code is checked automatically, and the result is recorded with the change.</p>
    <ul>
      <li>The staging machine is updated with one command. It unpacks the new version beside the running one, runs all of its test suites, and switches over only if every suite passes. A failed suite changes nothing that runs.</li>
      <li>Requests that once failed for a person are kept as tests, and are sent again in the conversation after every update.</li>
    </ul>

    <h2><span class="n">12</span>What Ola does not do</h2>
    <ul>
      <li>Send project data to an outside AI provider unless the project owner has enabled it. Every such request is marked and logged. (On staging, the open models themselves are rented from Together AI, with test data only.)</li>
      <li>Train models on project data.</li>
      <li>Log the content of prompts or responses.</li>
      <li>Give a project’s VM a network connection.</li>
      <li>Publish without the owner’s yes.</li>
      <li>Load third-party resources on ola.cx. No ads, trackers or analytics.</li>
    </ul>
    <p><b>Limits.</b> Ola is one machine with one operator. It does not protect data from that operator, or from someone who compromises the machine.</p>

    <div class="end">
      <p>Checked against the running system on November 20, 2026. This page is updated when the system changes.</p>
      <p><a href="/">ola.cx</a></p>
    </div>
  </div>
</main>
</body>
</html>
`
}
