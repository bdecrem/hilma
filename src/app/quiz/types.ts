export type MCQQuestion = {
  type: 'mcq';
  q: string;
  options: string[];
  answer_index: number;
  explanation?: string;
};

export type ShortQuestion = {
  type: 'short';
  q: string;
  accepted_answer: string;
  key_terms: string[];
  explanation?: string;
};

export type Question = MCQQuestion | ShortQuestion;

export type Quiz = {
  id: string;
  title: string;
  topic?: string;
  source_created_at?: string;
  summary: string;
  questions: Question[];
};
