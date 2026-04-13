import { ref, computed, onMounted } from "vue";
import type { ComputedRef, Ref } from "vue";

const STORAGE_KEY = "curso-claude:api-key:v1";

const apiKey: Ref<string | null> = ref(null);
const hydrated = ref(false);

function hydrate(): void {
  if (typeof window === "undefined") return;
  if (hydrated.value) return;
  try {
    apiKey.value = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    apiKey.value = null;
  }
  hydrated.value = true;
}

function persist(value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable — fall back to in-memory only.
  }
}

export type UseApiKeyApi = {
  apiKey: Readonly<Ref<string | null>>;
  hydrated: Readonly<Ref<boolean>>;
  hasKey: ComputedRef<boolean>;
  maskedKey: ComputedRef<string>;
  setKey: (value: string) => void;
  clearKey: () => void;
};

function maskKey(key: string | null): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function useApiKey(): UseApiKeyApi {
  onMounted(hydrate);

  const setKey = (value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    apiKey.value = trimmed;
    persist(trimmed);
  };

  const clearKey = (): void => {
    apiKey.value = null;
    persist(null);
  };

  const hasKey = computed((): boolean => Boolean(apiKey.value));
  const maskedKey = computed((): string => maskKey(apiKey.value));

  return { apiKey, hydrated, hasKey, maskedKey, setKey, clearKey };
}
