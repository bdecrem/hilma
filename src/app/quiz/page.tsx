import Link from 'next/link';
import quizzes from '../../../public/quiz-data/quizzes.json';
import type { Quiz } from './types';

export default function QuizIndexPage() {
  const list = quizzes as Quiz[];

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '4rem 1.5rem', color: '#1a1a1a' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 600, marginBottom: '0.25rem' }}>Quiz me</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Quizzes generated from the explainer conversations in your Claude history.
      </p>

      {list.length === 0 ? (
        <div style={{ padding: '1.5rem', background: '#fafafa', borderRadius: 8, color: '#666' }}>
          No quizzes yet. Run the pipeline:
          <pre style={{ marginTop: '1rem', fontSize: '0.8rem', overflow: 'auto' }}>{`CLAUDE_SESSION_KEY='sk-ant-sid01-...' node scripts/quiz-me/fetch-conversations.mjs
node scripts/quiz-me/classify-explainers.mjs
node scripts/quiz-me/generate-quizzes.mjs`}</pre>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {list.map(q => (
            <li key={q.id} style={{ marginBottom: '0.5rem' }}>
              <Link
                href={`/quiz/${q.id}`}
                style={{
                  display: 'block',
                  padding: '1rem 1.25rem',
                  borderRadius: 8,
                  border: '1px solid #eee',
                  background: '#fff',
                  textDecoration: 'none',
                  color: '#1a1a1a',
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{q.title}</div>
                {q.topic && q.topic !== q.title && (
                  <div style={{ fontSize: '0.85rem', color: '#888' }}>{q.topic}</div>
                )}
                <div style={{ fontSize: '0.8rem', color: '#999', marginTop: 4 }}>
                  {q.questions.length} questions
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
