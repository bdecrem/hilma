'use client';

import { useMemo, useState } from 'react';
import type { Quiz, Question } from '../types';

type Answer = { index: number; value: string | number };
type Grade = { correct: boolean; detail: string };

function gradeMCQ(q: Extract<Question, { type: 'mcq' }>, picked: number): Grade {
  const correct = picked === q.answer_index;
  return {
    correct,
    detail: correct
      ? 'Correct.'
      : `Correct answer: ${q.options[q.answer_index]}${q.explanation ? ` — ${q.explanation}` : ''}`,
  };
}

function gradeShort(q: Extract<Question, { type: 'short' }>, text: string): Grade {
  const normalized = text.toLowerCase();
  const hits = q.key_terms.filter(t => normalized.includes(t.toLowerCase()));
  const threshold = Math.max(1, Math.ceil(q.key_terms.length * 0.5));
  const correct = hits.length >= threshold;
  return {
    correct,
    detail: correct
      ? `Credit — you hit: ${hits.join(', ')}.`
      : `Expected terms: ${q.key_terms.join(', ')}. Sample answer: ${q.accepted_answer}`,
  };
}

export default function QuizRunner({ quiz }: { quiz: Quiz }) {
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [submitted, setSubmitted] = useState(false);

  const grades = useMemo(() => {
    if (!submitted) return null;
    return quiz.questions.map((q, i) => {
      const a = answers[i];
      if (a == null) return { correct: false, detail: 'No answer given.' } as Grade;
      if (q.type === 'mcq') return gradeMCQ(q, a.value as number);
      return gradeShort(q, String(a.value ?? ''));
    });
  }, [submitted, quiz, answers]);

  const score = grades ? grades.filter(g => g.correct).length : 0;

  return (
    <div>
      {quiz.questions.map((q, i) => {
        const grade = grades?.[i];
        return (
          <div
            key={i}
            style={{
              padding: '1.25rem 1.5rem',
              border: '1px solid #eee',
              borderRadius: 8,
              marginBottom: '1rem',
              background: '#fff',
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: '0.75rem' }}>
              {i + 1}. {q.q}
            </div>

            {q.type === 'mcq' ? (
              <div>
                {q.options.map((opt, oi) => {
                  const picked = answers[i]?.value === oi;
                  const isCorrectOpt = submitted && oi === q.answer_index;
                  const isWrongPick = submitted && picked && oi !== q.answer_index;
                  return (
                    <label
                      key={oi}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.4rem 0.5rem',
                        borderRadius: 6,
                        cursor: submitted ? 'default' : 'pointer',
                        background: isCorrectOpt ? '#e7f7ec' : isWrongPick ? '#fbecec' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name={`q-${i}`}
                        checked={picked}
                        disabled={submitted}
                        onChange={() => setAnswers(a => ({ ...a, [i]: { index: i, value: oi } }))}
                        style={{ marginTop: 4 }}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea
                rows={3}
                disabled={submitted}
                value={(answers[i]?.value as string) ?? ''}
                onChange={e => setAnswers(a => ({ ...a, [i]: { index: i, value: e.target.value } }))}
                placeholder="Type your answer…"
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  resize: 'vertical',
                }}
              />
            )}

            {grade && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 6,
                  background: grade.correct ? '#e7f7ec' : '#fbecec',
                  color: grade.correct ? '#1e6b39' : '#8a2929',
                  fontSize: '0.9rem',
                }}
              >
                {grade.detail}
              </div>
            )}
          </div>
        );
      })}

      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
          style={{
            padding: '0.7rem 1.5rem',
            background: '#1a1a1a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          Submit
        </button>
      ) : (
        <div style={{ padding: '1rem 1.25rem', background: '#f4f4f4', borderRadius: 8 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            Score: {score} / {quiz.questions.length}
          </div>
        </div>
      )}
    </div>
  );
}
