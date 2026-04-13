<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";
import { useProgress } from "../composables/useProgress";
import { useCourseStructure } from "../composables/useCourseStructure";
import type { ModuleRef } from "../../course-structure";

const { theme } = useData();
const course = useCourseStructure();
const { hydrated, moduleProgress, isCompleted } = useProgress();

type Card = {
  module: ModuleRef;
  stats: { visited: number; completed: number; total: number };
  pct: number;
  firstLessonHref: string;
};

const cards = computed<Card[]>(() => {
  return course.value.modules.map((mod) => {
    const paths = mod.lessons.map((l) => l.path);
    const stats = moduleProgress(paths).value;
    const pct =
      stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
    const firstLesson = mod.lessons[0];
    const firstLessonHref = firstLesson ? withBase(firstLesson.path) : "#";
    return { module: mod, stats, pct, firstLessonHref };
  });
});

const overall = computed(() => {
  let completed = 0;
  let total = 0;
  for (const c of cards.value) {
    completed += c.stats.completed;
    total += c.stats.total;
  }
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, pct };
});

// Keep theme reactive to avoid unused-variable warnings when themeConfig expands later.
void theme;
</script>

<template>
  <section class="course-progress" aria-label="Tu progreso en el curso">
    <header class="course-progress__header">
      <h3 class="course-progress__title">Tu progreso</h3>
      <p class="course-progress__subtitle" v-if="hydrated">
        {{ overall.completed }} de {{ overall.total }} lecciones completadas
        ({{ overall.pct }}%)
      </p>
      <p class="course-progress__subtitle" v-else>
        Cargando progreso guardado…
      </p>
    </header>

    <div class="course-progress__grid">
      <a
        v-for="card in cards"
        :key="card.module.id"
        :href="card.firstLessonHref"
        class="module-card"
        :class="{
          'module-card--empty': card.stats.total === 0,
          'module-card--done': card.stats.total > 0 && card.pct === 100,
        }"
      >
        <div class="module-card__head">
          <span class="module-card__code">
            M{{ String(card.module.order).padStart(2, "0") }}
          </span>
          <span class="module-card__status">{{ card.module.status }}</span>
        </div>
        <h4 class="module-card__title">{{ card.module.title }}</h4>
        <div class="module-card__meta">
          <span v-if="card.stats.total > 0">
            {{ card.stats.completed }} / {{ card.stats.total }} lecciones
          </span>
          <span v-else>En producción</span>
        </div>
        <div
          v-if="card.stats.total > 0"
          class="module-card__bar"
          role="progressbar"
          :aria-valuenow="card.pct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="module-card__fill" :style="{ width: card.pct + '%' }" />
        </div>
      </a>
    </div>
  </section>
</template>

<style scoped>
.course-progress {
  margin: 2rem 0 2.5rem;
}

.course-progress__header {
  margin-bottom: 1.25rem;
}

.course-progress__title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.course-progress__subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.course-progress__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.module-card {
  display: block;
  padding: 0.9rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  text-decoration: none;
  color: inherit;
  transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
}

.module-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
  background: var(--vp-c-bg-elv);
}

.module-card--empty {
  opacity: 0.65;
  cursor: default;
  pointer-events: none;
}

.module-card--done {
  border-color: var(--vp-c-brand-1);
}

.module-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.module-card__code {
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.module-card__title {
  margin: 0.4rem 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
}

.module-card__meta {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.module-card__bar {
  height: 4px;
  border-radius: 2px;
  background: var(--vp-c-gray-soft);
  overflow: hidden;
}

.module-card__fill {
  height: 100%;
  background: var(--vp-c-brand-1);
  transition: width 240ms ease;
}
</style>
