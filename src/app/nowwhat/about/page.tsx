import fs from 'fs'
import path from 'path'
import Markdown from 'react-markdown'

const LOCAL_PATH = path.join(process.cwd(), '..', 'docsrepo', 'wiki', 'nowwhat', 'overview.md')
const GITHUB_URL = 'https://api.github.com/repos/bdecrem/docsrepo/contents/wiki/nowwhat/overview.md'

async function getMarkdown(): Promise<string> {
  // Local filesystem (dev)
  try {
    return fs.readFileSync(LOCAL_PATH, 'utf-8')
  } catch {
    // Fall through to GitHub
  }

  // GitHub API (production)
  const token = process.env.GITHUB_TOKEN
  if (!token) return '*Content unavailable*'

  const res = await fetch(GITHUB_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
    },
    next: { revalidate: 60 },
  })
  if (!res.ok) return '*Content unavailable*'
  return res.text()
}

export default async function NowWhatAbout() {
  const md = await getMarkdown()

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-neutral-300 overflow-x-hidden">
      {/* Subtle grain */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
          backgroundSize: '128px 128px',
        }}
      />

      <div className="relative max-w-xl mx-auto px-6 py-20 sm:py-32">
        <article className="prose-nowwhat">
          <Markdown>{md}</Markdown>
        </article>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-neutral-800 text-xs text-neutral-600">
          <a
            href="/nowwhat"
            className="hover:text-neutral-400 transition-colors underline underline-offset-2 decoration-neutral-700"
          >
            nowwhat.ac
          </a>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');
        .prose-nowwhat {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-weight: 400;
        }
        .prose-nowwhat h1,
        .prose-nowwhat h2,
        .prose-nowwhat h3 {
          color: #fff;
          font-weight: 300;
          letter-spacing: -0.01em;
        }
        .prose-nowwhat h1 { font-size: 2.25rem; margin-bottom: 1.5rem; }
        .prose-nowwhat h2 { font-size: 1.5rem; margin-top: 2.5rem; margin-bottom: 1rem; }
        .prose-nowwhat h3 { font-size: 1.25rem; margin-top: 2rem; margin-bottom: 0.75rem; }
        .prose-nowwhat p {
          margin-bottom: 1.5rem;
          line-height: 1.75;
          font-size: 1.0625rem;
        }
        .prose-nowwhat strong { color: #fff; font-weight: 500; }
        .prose-nowwhat em { color: #fff; }
        .prose-nowwhat a {
          color: #a3a3a3;
          text-decoration: underline;
          text-underline-offset: 2px;
          text-decoration-color: #525252;
          transition: color 0.2s;
        }
        .prose-nowwhat a:hover { color: #fff; }
        .prose-nowwhat ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-top: -1rem;
          margin-bottom: 1.5rem;
        }
        .prose-nowwhat li {
          line-height: 1.75;
          font-size: 1.0625rem;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  )
}
