<script setup lang="ts">
import { useProgress } from "../composables/useProgress";

const { reset } = useProgress();

const onClick = (): void => {
  if (typeof window === "undefined") return;
  const confirmed = window.confirm(
    "¿Borrar todo el progreso guardado en este navegador? No se puede deshacer.",
  );
  if (confirmed) reset();
};
</script>

<template>
  <button type="button" class="reset-progress" @click="onClick">
    Borrar progreso
  </button>
</template>

<style scoped>
.reset-progress {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.reset-progress:hover {
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-text-3);
}
</style>
