import Link from 'next/link';
import { notFound } from 'next/navigation';
import quizzes from '../../../../public/quiz-data/quizzes.json';
import QuizRunner from './QuizRunner';
import type { Quiz } from '../types';

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quiz = (quizzes as Quiz[]).find(q => q.id === id);
  if (!quiz) notFound();

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 1.5rem', color: '#1a1a1a' }}>
      <Link href="/quiz" style={{ color: '#666', fontSize: '0.85rem', textDecoration: 'none' }}>
        ← all quizzes
      </Link>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.25rem' }}>
        {quiz.title}
      </h1>
      {quiz.topic && <div style={{ color: '#888', marginBottom: '1.25rem' }}>{quiz.topic}</div>}
      <div style={{ padding: '1rem 1.25rem', background: '#fafafa', borderRadius: 8, color: '#555', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: 1.5 }}>
        {quiz.summary}
      </div>
      <QuizRunner quiz={quiz} />
    </main>
  );
}
