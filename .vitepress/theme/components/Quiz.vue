<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useData } from "vitepress";
import type { Quiz, QuizQuestion } from "../../quizzes";

type Props = {
  id: string;
};

const props = defineProps<Props>();
const { theme } = useData();

const quiz = computed<Quiz | null>(() => {
  const themeValue = theme.value as { quizzes?: Record<string, Quiz> };
  return themeValue.quizzes?.[props.id] ?? null;
});

type Selection = string[];

const answers = reactive<Record<string, Selection>>({});
const submitted = ref(false);

const ensureAnswer = (questionId: string): Selection => {
  if (!answers[questionId]) answers[questionId] = [];
  return answers[questionId]!;
};

const isSelected = (questionId: string, optionId: string): boolean =>
  ensureAnswer(questionId).includes(optionId);

const toggle = (question: QuizQuestion, optionId: string): void => {
  if (submitted.value) return;
  const selected = ensureAnswer(question.id);
  if (question.type === "multiple_select") {
    answers[question.id] = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    return;
  }
  answers[question.id] = [optionId];
};

const normalizeCorrect = (q: QuizQuestion): string[] =>
  Array.isArray(q.correct) ? [...q.correct].sort() : [q.correct];

const isQuestionCorrect = (q: QuizQuestion): boolean => {
  const selected = [...ensureAnswer(q.id)].sort();
  const correct = normalizeCorrect(q);
  if (selected.length !== correct.length) return false;
  return selected.every((id, i) => id === correct[i]);
};

const canSubmit = computed((): boolean => {
  if (!quiz.value) return false;
  return quiz.value.questions.every((q) => ensureAnswer(q.id).length > 0);
});

const score = computed((): { earned: number; total: number; pct: number } => {
  if (!quiz.value) return { earned: 0, total: 0, pct: 0 };
  let earned = 0;
  let total = 0;
  for (const q of quiz.value.questions) {
    total += q.points;
    if (isQuestionCorrect(q)) earned += q.points;
  }
  const pct = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { earned, total, pct };
});

const passed = computed<boolean>(() => {
  if (!quiz.value) return false;
  return score.value.pct >= quiz.value.passing_score;
});

const submit = (): void => {
  if (!canSubmit.value) return;
  submitted.value = true;
};

const reset = (): void => {
  submitted.value = false;
  for (const key of Object.keys(answers)) delete answers[key];
};

const inputType = (q: QuizQuestion): "checkbox" | "radio" =>
  q.type === "multiple_select" ? "checkbox" : "radio";

const optionStateClass = (
  q: QuizQuestion,
  optionId: string,
): string => {
  if (!submitted.value) return "";
  const correct = normalizeCorrect(q);
  const selected = isSelected(q.id, optionId);
  const isCorrectOption = correct.includes(optionId);
  if (selected && isCorrectOption) return "quiz-option--hit";
  if (selected && !isCorrectOption) return "quiz-option--miss";
  if (!selected && isCorrectOption) return "quiz-option--expected";
  return "";
};
</script>

<template>
  <section v-if="quiz" class="quiz" :aria-label="quiz.title">
    <header class="quiz__header">
      <span class="quiz__eyebrow">Quiz interactivo</span>
      <h3 class="quiz__title">{{ quiz.title }}</h3>
      <p v-if="quiz.description" class="quiz__description">{{ quiz.description }}</p>
    </header>

    <ol class="quiz__questions">
      <li
        v-for="(q, qIdx) in quiz.questions"
        :key="q.id"
        class="quiz-question"
      >
        <div class="quiz-question__prompt">
          <span class="quiz-question__num">{{ qIdx + 1 }}.</span>
          <span class="quiz-question__text" v-html="q.question.replace(/\n/g, '<br/>')" />
        </div>

        <div class="quiz-question__hint" v-if="q.type === 'multiple_select'">
          <em>Seleccioná todas las que apliquen.</em>
        </div>

        <ul class="quiz-options">
          <li
            v-for="opt in q.options"
            :key="opt.id"
            class="quiz-option"
            :class="optionStateClass(q, opt.id)"
          >
            <label>
              <input
                :type="inputType(q)"
                :name="`${quiz.id}-${q.id}`"
                :value="opt.id"
                :checked="isSelected(q.id, opt.id)"
                :disabled="submitted"
                @change="toggle(q, opt.id)"
              />
              <span class="quiz-option__id">{{ opt.id }}.</span>
              <span class="quiz-option__text">{{ opt.text }}</span>
            </label>
          </li>
        </ul>

        <div v-if="submitted" class="quiz-question__feedback">
          <p
            class="quiz-question__verdict"
            :class="{
              'quiz-question__verdict--ok': isQuestionCorrect(q),
              'quiz-question__verdict--no': !isQuestionCorrect(q),
            }"
          >
            <span v-if="isQuestionCorrect(q)">✓ Correcto</span>
            <span v-else>✗ Incorrecto</span>
          </p>
          <p
            v-if="isQuestionCorrect(q) && q.feedback_correct"
            class="quiz-question__explain"
          >
            {{ q.feedback_correct }}
          </p>
          <p
            v-else-if="!isQuestionCorrect(q) && q.feedback_incorrect"
            class="quiz-question__explain"
          >
            {{ q.feedback_incorrect }}
          </p>
        </div>
      </li>
    </ol>

    <footer class="quiz__footer">
      <div v-if="submitted" class="quiz__result">
        <span
          class="quiz__score"
          :class="{
            'quiz__score--pass': passed,
            'quiz__score--fail': !passed,
          }"
        >
          {{ score.earned }} / {{ score.total }} puntos ({{ score.pct }}%)
          — {{ passed ? "Aprobado" : "No aprobado" }} · umbral {{ quiz.passing_score }}%
        </span>
        <button type="button" class="quiz__btn quiz__btn--secondary" @click="reset">
          Reintentar
        </button>
      </div>
      <button
        v-else
        type="button"
        class="quiz__btn quiz__btn--primary"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ canSubmit ? "Corregir" : "Respondé todas las preguntas" }}
      </button>
    </footer>
  </section>
  <aside v-else class="quiz quiz--missing">
    <p>Quiz <code>{{ props.id }}</code> no encontrado. Verificá el id en el YAML.</p>
  </aside>
</template>

<style scoped>
.quiz {
  margin: 2rem 0;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.quiz--missing {
  background: var(--vp-c-yellow-soft, #fff7e6);
  color: var(--vp-c-text-1);
}

.quiz__header {
  margin-bottom: 1rem;
}

.quiz__eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 0.4rem;
}

.quiz__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
}

.quiz__description {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.quiz__questions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1.25rem;
}

.quiz-question {
  padding: 0.9rem 1rem;
  border-radius: 8px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
}

.quiz-question__prompt {
  display: flex;
  gap: 0.5rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
  line-height: 1.5;
}

.quiz-question__num {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.quiz-question__hint {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  margin-bottom: 0.6rem;
}

.quiz-options {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: grid;
  gap: 0.4rem;
}

.quiz-option {
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  transition: background 160ms ease, border-color 160ms ease;
}

.quiz-option label {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1.45;
}

.quiz-option input {
  margin-top: 0.2rem;
  accent-color: var(--vp-c-brand-1);
}

.quiz-option__id {
  font-weight: 600;
  color: var(--vp-c-text-2);
  min-width: 1.25rem;
}

.quiz-option--hit {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.08);
}

.quiz-option--miss {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.quiz-option--expected {
  border-color: #22c55e;
  border-style: dashed;
  background: rgba(34, 197, 94, 0.04);
}

.quiz-question__feedback {
  margin-top: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.quiz-question__verdict {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 0.35rem;
}

.quiz-question__verdict--ok {
  color: #15803d;
}

.quiz-question__verdict--no {
  color: #b91c1c;
}

.quiz-question__explain {
  margin: 0;
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  line-height: 1.55;
}

.quiz__footer {
  margin-top: 1.25rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
}

.quiz__result {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  justify-content: space-between;
  flex-wrap: wrap;
}

.quiz__score {
  font-size: 0.9rem;
  font-weight: 600;
}

.quiz__score--pass {
  color: #15803d;
}

.quiz__score--fail {
  color: #b91c1c;
}

.quiz__btn {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.quiz__btn--primary {
  background: var(--vp-c-brand-1);
  color: #fff;
}

.quiz__btn--primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.quiz__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quiz__btn--secondary {
  background: transparent;
  border-color: var(--vp-c-divider);
  color: var(--vp-c-text-2);
}

.quiz__btn--secondary:hover {
  background: var(--vp-c-bg);
  border-color: var(--vp-c-text-3);
}
</style>
