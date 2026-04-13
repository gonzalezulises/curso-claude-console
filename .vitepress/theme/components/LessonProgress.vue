<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vitepress";
import { useProgress } from "../composables/useProgress";
import { useCurrentLesson } from "../composables/useCourseStructure";

const route = useRoute();
const { toggleCompleted, isCompleted, isVisited, hydrated } = useProgress();
const current = useCurrentLesson();

const moduleInfo = computed(() => current.value?.module ?? null);

const position = computed(() => {
  const c = current.value;
  if (!c || !c.module) return { index: 0, total: 0 };
  return { index: c.index + 1, total: c.module.lessons.length };
});

const progressPct = computed(() => {
  const { index, total } = position.value;
  if (!total) return 0;
  return Math.round((index / total) * 100);
});

const completed = computed(() => isCompleted(route.path));
const visited = computed(() => isVisited(route.path));

const onToggle = (): void => {
  toggleCompleted(route.path);
};
</script>

<template>
  <aside v-if="moduleInfo" class="lesson-progress" aria-label="Progreso de lección">
    <div class="lesson-progress__meta">
      <span class="lesson-progress__module">{{ moduleInfo.title }}</span>
      <span class="lesson-progress__counter">
        Lección {{ position.index }} / {{ position.total }}
      </span>
    </div>

    <div class="lesson-progress__bar" role="progressbar"
      :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100">
      <div class="lesson-progress__fill" :style="{ width: progressPct + '%' }" />
    </div>

    <label class="lesson-progress__complete">
      <input
        type="checkbox"
        :checked="completed"
        :disabled="!hydrated"
        @change="onToggle"
      />
      <span v-if="completed">Lección marcada como completada</span>
      <span v-else-if="visited">Marcar lección como completada</span>
      <span v-else>Marcar lección como completada</span>
    </label>
  </aside>
</template>

<style scoped>
.lesson-progress {
  margin: 1.5rem 0 2rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.lesson-progress__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.6rem;
  font-size: 0.85rem;
}

.lesson-progress__module {
  color: var(--vp-c-text-2);
  font-weight: 500;
}

.lesson-progress__counter {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

.lesson-progress__bar {
  height: 6px;
  border-radius: 3px;
  background: var(--vp-c-gray-soft);
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.lesson-progress__fill {
  height: 100%;
  background: var(--vp-c-brand-1);
  transition: width 240ms ease;
}

.lesson-progress__complete {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
  color: var(--vp-c-text-2);
}

.lesson-progress__complete input {
  accent-color: var(--vp-c-brand-1);
  cursor: pointer;
}
</style>
