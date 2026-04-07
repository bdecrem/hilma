import fs from 'fs'
import path from 'path'
import Markdown from 'react-markdown'

const CONTENT_PATH = path.join(process.cwd(), 'src', 'app', 'nowwhat', 'about', 'content.md')

function getMarkdown(): string {
  return fs.readFileSync(CONTENT_PATH, 'utf-8')
}

export default function NowWhatAbout() {
  const md = getMarkdown()

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
          <Markdown components={{
            h2: ({ children, ...props }) => {
              const text = String(children).toLowerCase()
              if (text.includes('about me')) {
                return (
                  <>
                    <a
                      href="/nowwhat/gen2"
                      className="block my-8 px-4 py-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-800/50 transition-all no-underline"
                    >
                      <span className="text-neutral-400 text-sm">How the homepage art works</span>
                      <span className="text-neutral-600 text-xs block mt-0.5">AI-generated pixel shapes, curated by humans &rarr;</span>
                    </a>
                    <h2 {...props}>{children}</h2>
                  </>
                )
              }
              return <h2 {...props}>{children}</h2>
            }
          }}>{md}</Markdown>
        </article>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-neutral-800 text-xs text-neutral-600">
          <a
            href="/nowwhat/nw"
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
