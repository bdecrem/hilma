// "How Ola works": the architecture page at ola.cx/architecture (OLA-219). Every claim is true of the
// system as it runs (checked against apps/activist-ai/OVERVIEW.md and README.md, 2026-11-19); what is
// not live yet is labeled Planned. Public page: no addresses, ports, paths on the machine, internal
// service names, account names or people's names. build.mjs wraps it in the site's head and styles.

// ---------- the diagram: one request's path, drawn inline (viewBox 420 × 824) ----------
// Layout math (y down): you 28–66 · arrow 112–168 · the machine 170–690 (front desk 214–278,
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
<title id="dg-${id}-t">How a request travels. You use Ola from a browser, the Mac app or the iPhone app. Your request goes encrypted to the Ola machine, first to the front desk (sign-in, teams, files, activity log), then into your project's sealed computer, where the agent, your files and the project's database are. The sealed computer has no internet; its one way out is the model gateway, which checks every request and logs numbers, never words. From the gateway the request goes to Ola's own model. Only three things can leave the machine, each only with a yes: public pages (only when the owner presses Publish), the web (searches and downloads you allowed), and an outside model (only with the project owner's yes).</title>
<defs><marker id="ah-${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.2 9 5 1 8.8" fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<text class="s" x="0" y="16">You, on</text>
${box('chip', 0, 28, 128, 38)}${box('chip', 146, 28, 128, 38)}${box('chip', 292, 28, 128, 38)}
<text class="c" x="64" y="52">Browser</text><text class="c" x="210" y="52">Mac app</text><text class="c" x="356" y="52">iPhone app</text>
<path class="ln" d="M64 66 210 112M210 66V112M356 66 210 112"/>
<path class="ln" d="M210 112V166" ${ar}/>
<text class="s" x="224" y="134" style="fill:var(--text)">encrypted all the way</text>
<text class="s" x="224" y="152">a relay passes it on, unread</text>
<rect class="frame" x="24" y="170" width="372" height="520" rx="20"/>
<text class="t" x="44" y="198">The Ola machine</text>
<text class="s" x="376" y="198" text-anchor="end">one computer</text>
${box('box', 44, 214, 332, 64)}
<text class="t" x="60" y="240">Front desk</text>
<text class="s" x="60" y="262">sign-in · teams · files · activity log</text>
<path class="ln" d="M210 278V308" ${ar}/>
${box('ghost', 56, 322, 332, 150)}${box('ghost', 50, 316, 332, 150)}${box('seal', 44, 310, 332, 150)}
<text class="t" x="60" y="336">Your project’s sealed computer</text>
${box('chip', 60, 352, 96, 44)}${box('chip', 162, 352, 96, 44)}${box('chip', 264, 352, 96, 44)}
<text class="c" x="108" y="379">the agent</text><text class="c" x="210" y="379">your files</text><text class="c" x="312" y="379">its database</text>
<text class="s" x="60" y="424" style="fill:var(--text)">No internet connection.</text>
<text class="s" x="60" y="444">Nothing from any other project.</text>
<text class="s" x="384" y="490" text-anchor="end">one per project</text>
<path class="ln" d="M210 472V520" ${ar}/>
<text class="s y" x="198" y="500" text-anchor="end">the one way out</text>
${box('gate', 44, 522, 332, 78)}
<text class="t" x="60" y="548">Model gateway</text>
<text class="s" x="60" y="569">holds the keys, checks every request,</text>
<text class="s" x="60" y="587">logs numbers, never words</text>
<path class="ln" d="M122 600V620" ${ar}/>
${box('box', 44, 622, 170, 52)}
<text class="t" x="58" y="644" style="font-size:15.5px">Ola’s own model</text>
<text class="s" x="58" y="664">here from December</text>
<path class="ln dash" d="M44 246H12V704H66V718" ${ar}/>
<path class="ln dash" d="M250 600V704H210V718" ${ar}/>
<path class="ln dash" d="M354 600V718" ${ar}/>
<circle class="dot" cx="24" cy="246" r="4.5"/><circle class="dot" cx="250" cy="690" r="4.5"/><circle class="dot" cx="354" cy="690" r="4.5"/>
${box('box', 0, 720, 132, 100)}${box('box', 144, 720, 132, 100)}${box('box', 288, 720, 132, 100)}
<text class="t" x="12" y="746" style="font-size:15.5px">Public pages</text>
<text class="s" x="12" y="768" style="fill:var(--text)">sites.ola.cx</text>
<text class="s" x="12" y="787">only when the</text><text class="s" x="12" y="805">owner publishes</text>
<text class="t" x="156" y="746" style="font-size:15.5px">The web</text>
<text class="s" x="156" y="768" style="fill:var(--text)">searches and</text>
<text class="s" x="156" y="787">downloads</text><text class="s" x="156" y="805">you allowed</text>
<text class="t" x="300" y="746" style="font-size:15.5px">Outside model</text>
<text class="s" x="300" y="768" style="fill:var(--text)">hosted, or Claude</text>
<text class="s" x="300" y="787">only with the</text><text class="s" x="300" y="805">owner’s yes</text>
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
.status{border:1.5px solid var(--link);border-radius:14px;padding:14px 18px;margin:18px 0 8px;max-width:36em}
.status p{margin:0}
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
  const fig = `<figure class="fig">${diagram()}<figcaption>How a request travels. Dashed lines carry something only after a yes; the red dots are where it leaves the machine.</figcaption></figure>`
  return `<body>
<main class="page">
  <div class="top"><a href="/" aria-label="Ola, back to the letter">${wordmark}</a></div>
  <div class="text">
    <h1><span class="h">How Ola works</span><span class="k">Where your work runs, what can leave the machine, and what gets written down. For you, and for the friend you ask whether this is safe.</span></h1>
    <div class="status"><p><b>Where things stand, November 19, 2026.</b> Ola runs on a test machine today, with made-up data only. The Ola machine itself arrives about December 1, and real projects start on it in December. Each part below says whether it is live now or planned.</p></div>
  </div>
  ${fig}
  <div class="text">
    <h2><span class="n">1</span>Two places your work can run</h2>
    <p>${live()}<b>On the Ola machine.</b> You sign in at app.ola.cx, in a browser, the Mac app or the iPhone app. Your project’s files and the agent that works on them live on the Ola machine, one computer in an office. You see the same project and the same conversations from every device.</p>
    <p>${live()}<b>On your Mac.</b> In the Mac app, or with the <code>ola</code> command in a terminal, the agent runs on your own Mac, in a folder you choose. Your files stay on your Mac. Only the requests to the model, and web searches, go to the Ola machine. The iPhone app can also connect to your Mac, over a private network.</p>

    <h2><span class="n">2</span>One sealed computer for each project</h2>
    <p>${live('Live, test machine')}On the Ola machine, each project gets its own virtual machine: a separate computer made in software. It holds that project’s files and its database, and nothing from any other project.</p>
    <ul>
      <li>It has <b>no internet connection</b> at all.</li>
      <li>Its system files can’t be changed, and the programs in it run without administrator rights.</li>
      <li>The agent works inside it. It reads your documents, runs code, and makes tables, charts and pages there.</li>
      <li>A project left alone for 30 minutes is stopped. It starts again in a few seconds when someone opens it.</li>
    </ul>
    <p>This matters because documents can carry hidden instructions. A web page or a PDF can tell an AI agent to “send this file somewhere.” In a sealed computer there is nowhere to send it, except through the one gate below.</p>

    <h2><span class="n">3</span>The one way out: the model gateway</h2>
    <p>${live()}Each project’s computer has exactly one way out. It leads to the model gateway, a small program on the Ola machine. The gateway holds the keys to the models, so a project never sees them. A pass taken from one project doesn’t work through another project’s gate.</p>
    <ul>
      <li><b>What passes through:</b> the agent’s requests to the model (your question, and the parts of your files it is reading), and the web searches and downloads that were allowed.</li>
      <li><b>What it checks:</b> which project is asking, the size of each request, how long it runs, and a weekly allowance for each project.</li>
      <li><b>What it writes down:</b> one line per request, with numbers only. Which project, which model, how many words in and out (counted in tokens), how long it took, whether it worked. Never the words of a request or a reply.</li>
      <li>It rebuilds every answer from a short, fixed list of fields, so nothing extra from a model company reaches your project.</li>
    </ul>

    <h2><span class="n">4</span>Where your files and data live</h2>
    <p>${live()}<b>On the Ola machine,</b> everything about a project is on that project’s own disk, inside its sealed computer: the files you upload, what Ola downloads from the web, what Ola makes, and the conversations. Each project has its own database, one file, with your documents searchable page by page and every table Ola builds. Delete a project and its database goes with it.</p>
    <p>You can see all of it. <b>Files</b> lists every file. <b>Data</b> shows every table, where it came from and how many rows it has. You can download the whole database as one file, or any table as a spreadsheet.</p>
    <p>A separate, small sign-in database holds who may sign in, the teams, the projects and the activity log. It holds no file names, no file contents and nothing you wrote. A file appears there only as a scrambled fingerprint.</p>
    <p>${live()}<b>On your Mac,</b> your files stay in the folder you chose.</p>

    <h2><span class="n">5</span>Signing in, and who can see a project</h2>
    <p>${live()}You sign in with a name and a password. Accounts are by invitation only. A passkey is optional. Sign-in sessions are kept without your IP address or browser details.</p>
    <p>Each project belongs to a team, with three roles:</p>
    <ul>
      <li><b>Owner:</b> everything, including the project’s settings and publishing.</li>
      <li><b>Member:</b> reads, uploads, deletes, and asks Ola to work.</li>
      <li><b>Viewer:</b> reads only.</li>
    </ul>
    <p>To anyone outside the team, the project doesn’t exist: they get the same answer as for a project that was never made. Removing someone takes effect on their next click, and cuts any connection they still have open.</p>
    <p>The <b>activity log</b> records sign-ins, files uploaded, downloaded and deleted, files Ola read during its work, and every time work was shown to an outside model. The team can read its own project’s log.</p>
    <p>One person runs the machine, and that person can, in principle, reach anything on it. That is what the letter means by “one machine and one person.” The tools for running the machine show counts, such as how many tables and documents a project has, not what is in them.</p>

    <h2><span class="n">6</span>Which model answers</h2>
    <p><b>Ola’s own open model comes first.</b> An open model is an AI model anyone can download and run on their own computer.</p>
    <p>${live('Live, made-up data')}Today, while the test machine holds only made-up data, the open models are rented from Together AI, an outside company.</p>
    <p>${plan('Planned, December')}From December they run on the Ola machine itself, so your words don’t leave it.</p>
    <p>${live()}<b>Two fallbacks, both off until the project’s owner turns them on:</b> a larger open model at an outside company (Together AI today), and Claude, from Anthropic. When one is used, your request and the parts of your files Ola reads to answer it go to that company.</p>
    <ul>
      <li>The owner turns each one on after reading what it sends and where. They can turn it off at any time. A member can’t turn them on.</li>
      <li>Ola may suggest a fallback when a job looks too big for its own model. Nothing goes unless the owner has said yes, either for that one request or in the project’s settings (only when asked, when Ola gets stuck, or always).</li>
      <li>Every use is marked in the conversation and written in the activity log. Each project has a monthly spending limit for them.</li>
      <li>Claude works inside the same sealed computer, and its requests pass through the same gateway.</li>
    </ul>
    <p>The order is always the same: Ola’s own model, then a hosted open model, then Claude, each only when the one before isn’t good enough.</p>

    <h2><span class="n">7</span>Web search and downloads</h2>
    <p>${live()}A project’s computer can’t reach the web. When Ola needs to search or download, it asks the gateway, which does it and hands back the result.</p>
    <ul>
      <li>The words of a search go to Brave Search. Nothing from your files goes with them.</li>
      <li>With “Lots of permissions” on (the default), Ola searches and downloads without asking each time. With it off, Ola asks first: Allow once, Always in this project, or Not now.</li>
      <li>“Always” shows in the project’s Settings, with who chose it and when, and can be taken back there.</li>
      <li>Everything downloaded stays in the project, with the address it came from.</li>
    </ul>

    <h2><span class="n">8</span>Publishing</h2>
    <p>${live()}Nothing Ola makes is public until the project’s owner presses Publish. The agent itself has no way to publish.</p>
    <ul>
      <li>The Publish sheet lists exactly which files will be public, and the address: sites.ola.cx, in a folder for the project.</li>
      <li>Before anything leaves, every file is checked. A publish is refused if a file holds a password or a key, is a database, or is a file of secrets.</li>
      <li>Published pages are plain files, served by Vercel, a hosting company, not from the Ola machine.</li>
      <li>Unpublish takes them down.</li>
    </ul>

    <h2><span class="n">9</span>Encryption and backups, as they are today</h2>
    <p>${live()}<b>On the way.</b> Everything between your device and app.ola.cx is encrypted (HTTPS). The encryption ends on the Ola machine itself. The relay that carries traffic in from the internet passes it on still encrypted, and can’t read it.</p>
    <p>${live('Today')}<b>On the disk.</b> The test machine holds only made-up data, and its disk is not encrypted.</p>
    <p>${plan('Planned, December')}The Ola machine will have full-disk encryption turned on before any real project arrives. It will also run under a separate account that only owns the projects. The test machine never holds real data.</p>
    <p>${live('Today')}<b>Backups.</b> There are no automatic backups yet. A project can be copied and restored by hand, and that is tested.</p>
    <p>${plan()}Encrypted backups. Once they run, a file you delete leaves the project at once and stays in the encrypted backups for up to 14 days.</p>
    <p>${live()}<b>Deleting.</b> A deleted file leaves the project at once. Deleting a project removes its disk and its database.</p>

    <h2><span class="n">10</span>What Ola does not do</h2>
    <ul>
      <li>It doesn’t send your files to an AI company unless your project’s owner says yes. Every time it does, it says so.</li>
      <li>It doesn’t train AI models on your work.</li>
      <li>It doesn’t put the words of your requests or its replies in any log.</li>
      <li>It doesn’t give a project’s computer an internet connection.</li>
      <li>It doesn’t publish anything the owner didn’t choose to publish.</li>
      <li>Its pages on ola.cx load nothing from any other website: no ads, no trackers, no analytics.</li>
      <li>It isn’t bulletproof. It is one machine, run by one person. It can’t protect your work from that person, or from someone who breaks into the machine. What it can do is keep your work in one place you can see, and let you delete it.</li>
    </ul>

    <div class="end">
      <p>Written from Ola’s own design notes and checked against the system on November 19, 2026. When something here changes, this page changes with it.</p>
      <p><a href="/">Back to the letter</a></p>
    </div>
  </div>
</main>
</body>
</html>
`
}
