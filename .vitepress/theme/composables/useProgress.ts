import { ref, computed, watch, onMounted } from "vue";
import type { ComputedRef, Ref } from "vue";

type ProgressState = {
  visited: Record<string, number>;
  completed: Record<string, number>;
};

const STORAGE_KEY = "curso-claude:progress:v1";

const emptyState = (): ProgressState => ({ visited: {}, completed: {} });

const state: Ref<ProgressState> = ref(emptyState());
const hydrated = ref(false);

function hydrate(): void {
  if (typeof window === "undefined") return;
  if (hydrated.value) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      hydrated.value = true;
      return;
    }
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    state.value = {
      visited: parsed.visited ?? {},
      completed: parsed.completed ?? {},
    };
  } catch {
    state.value = emptyState();
  }
  hydrated.value = true;
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value));
  } catch {
    // localStorage disabled (incognito, quota). Swallow silently — UX still works in-memory.
  }
}

watch(
  state,
  () => {
    if (hydrated.value) persist();
  },
  { deep: true },
);

function normalizePath(path: string): string {
  if (!path) return path;
  const withoutQuery = path.split(/[?#]/)[0] ?? path;
  if (withoutQuery === "/") return "/";
  return withoutQuery.replace(/\/$/, "");
}

function isLessonPath(path: string): boolean {
  return /^\/module-\d{2}-[a-z0-9-]+\/lessons\/[\w-]+$/.test(
    normalizePath(path),
  );
}

export type UseProgressApi = {
  hydrated: Readonly<Ref<boolean>>;
  markVisited: (path: string) => void;
  toggleCompleted: (path: string) => void;
  isVisited: (path: string) => boolean;
  isCompleted: (path: string) => boolean;
  reset: () => void;
  moduleProgress: (
    moduleLessonPaths: readonly string[],
  ) => ComputedRef<{ visited: number; completed: number; total: number }>;
  totalLessonsVisited: ComputedRef<number>;
  totalLessonsCompleted: ComputedRef<number>;
};

export function useProgress(): UseProgressApi {
  onMounted(hydrate);

  const markVisited = (path: string): void => {
    if (!isLessonPath(path)) return;
    const key = normalizePath(path);
    if (state.value.visited[key]) return;
    state.value.visited = { ...state.value.visited, [key]: Date.now() };
  };

  const toggleCompleted = (path: string): void => {
    if (!isLessonPath(path)) return;
    const key = normalizePath(path);
    const next = { ...state.value.completed };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = Date.now();
    }
    state.value.completed = next;
  };

  const isVisited = (path: string): boolean =>
    Boolean(state.value.visited[normalizePath(path)]);

  const isCompleted = (path: string): boolean =>
    Boolean(state.value.completed[normalizePath(path)]);

  const reset = (): void => {
    state.value = emptyState();
  };

  const moduleProgress = (
    moduleLessonPaths: readonly string[],
  ): ComputedRef<{ visited: number; completed: number; total: number }> =>
    computed(() => {
      const total = moduleLessonPaths.length;
      if (total === 0) return { visited: 0, completed: 0, total };
      let visited = 0;
      let completed = 0;
      for (const rawPath of moduleLessonPaths) {
        const key = normalizePath(rawPath);
        if (state.value.visited[key]) visited += 1;
        if (state.value.completed[key]) completed += 1;
      }
      return { visited, completed, total };
    });

  const totalLessonsVisited = computed(
    () => Object.keys(state.value.visited).length,
  );

  const totalLessonsCompleted = computed(
    () => Object.keys(state.value.completed).length,
  );

  return {
    hydrated,
    markVisited,
    toggleCompleted,
    isVisited,
    isCompleted,
    reset,
    moduleProgress,
    totalLessonsVisited,
    totalLessonsCompleted,
  };
}

export { isLessonPath, normalizePath };
