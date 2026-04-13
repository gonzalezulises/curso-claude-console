import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Build-time loader: reads every exercises/*.yaml with `type: quiz`,
// normalizes it to a client-friendly shape, and exports a map keyed by quiz id.

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentRoot = resolve(__dirname, "..", "content");

export type QuestionType =
  | "multiple_choice"
  | "multiple_select"
  | "true_false";

export type QuizOption = {
  id: string;
  text: string;
};

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  options: QuizOption[];
  correct: string | string[];
  feedback_correct?: string;
  feedback_incorrect?: string;
  points: number;
};

export type Quiz = {
  id: string;
  title: string;
  description?: string;
  passing_score: number;
  questions: QuizQuestion[];
};

type RawQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  options: QuizOption[];
  correct: string | string[];
  feedback_correct?: string;
  feedback_incorrect?: string;
  points?: number;
};

type RawQuiz = {
  id: string;
  type?: string;
  title: string;
  description?: string;
  config?: { passing_score?: number };
  questions: RawQuestion[];
};

function listModuleDirs(): string[] {
  return readdirSync(contentRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("module-"))
    .map((d) => resolve(contentRoot, d.name));
}

function listQuizFiles(moduleDir: string): string[] {
  const exDir = resolve(moduleDir, "exercises");
  if (!existsSync(exDir)) return [];
  return readdirSync(exDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => resolve(exDir, f));
}

function parseQuiz(path: string): Quiz | null {
  const raw = parseYaml(readFileSync(path, "utf-8")) as RawQuiz;
  if (raw.type !== "quiz") return null;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;

  const questions: QuizQuestion[] = raw.questions.map((q) => ({
    id: q.id,
    type: q.type,
    question: q.question,
    options: q.options ?? [],
    correct: q.correct,
    feedback_correct: q.feedback_correct,
    feedback_incorrect: q.feedback_incorrect,
    points: typeof q.points === "number" ? q.points : 1,
  }));

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    passing_score: raw.config?.passing_score ?? 70,
    questions,
  };
}

export function buildQuizIndex(): Record<string, Quiz> {
  const index: Record<string, Quiz> = {};
  for (const moduleDir of listModuleDirs()) {
    for (const file of listQuizFiles(moduleDir)) {
      const quiz = parseQuiz(file);
      if (quiz) index[quiz.id] = quiz;
    }
  }
  return index;
}
