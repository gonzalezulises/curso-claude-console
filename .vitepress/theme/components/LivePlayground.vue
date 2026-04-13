<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useData } from "vitepress";
import { useApiKey } from "../composables/useApiKey";
import ApiKeySetup from "./ApiKeySetup.vue";
import type { PlaygroundSeed } from "../../playgrounds";

type Props = {
  id: string;
};

const props = defineProps<Props>();
const { theme } = useData();
const { apiKey, hasKey } = useApiKey();

const seed = computed<PlaygroundSeed | null>(() => {
  const themeValue = theme.value as {
    playgrounds?: Record<string, PlaygroundSeed>;
  };
  return themeValue.playgrounds?.[props.id] ?? null;
});

type EditableFields = {
  model: string;
  max_tokens: number;
  system: string;
  user: string;
};

const draft = reactive<EditableFields>({
  model: "",
  max_tokens: 0,
  system: "",
  user: "",
});

const hydrated = ref(false);

const initializeDraft = (): void => {
  const s = seed.value;
  if (!s || hydrated.value) return;
  draft.model = s.model;
  draft.max_tokens = s.max_tokens;
  draft.system = s.system ?? "";
  draft.user = s.user;
  hydrated.value = true;
};

initializeDraft();

type ContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
};

type MessagesResponse = {
  id: string;
  model: string;
  role: string;
  content: ContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

type ErrorResponse = {
  type: "error";
  error: { type: string; message: string };
};

const response = ref<MessagesResponse | null>(null);
const errorMessage = ref<string | null>(null);
const loading = ref(false);
const elapsed = ref<number | null>(null);

const resetDraft = (): void => {
  const s = seed.value;
  if (!s) return;
  draft.model = s.model;
  draft.max_tokens = s.max_tokens;
  draft.system = s.system ?? "";
  draft.user = s.user;
  response.value = null;
  errorMessage.value = null;
  elapsed.value = null;
};

const buildRequestBody = (): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model: draft.model.trim(),
    max_tokens: Number(draft.max_tokens) || 256,
    messages: [{ role: "user", content: draft.user }],
  };
  if (draft.system.trim()) body.system = draft.system.trim();
  return body;
};

const run = async (): Promise<void> => {
  const key = apiKey.value;
  if (!key) {
    errorMessage.value = "Configurá tu API key primero.";
    return;
  }
  if (!draft.user.trim()) {
    errorMessage.value = "El prompt del usuario no puede estar vacío.";
    return;
  }

  loading.value = true;
  errorMessage.value = null;
  response.value = null;
  const started = performance.now();

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "x-api-key": key,
      },
      body: JSON.stringify(buildRequestBody()),
    });

    const data = (await res.json()) as MessagesResponse | ErrorResponse;
    if (!res.ok || (data as ErrorResponse).type === "error") {
      const err = data as ErrorResponse;
      errorMessage.value = `${res.status} · ${err.error?.type ?? "error"} · ${
        err.error?.message ?? "request failed"
      }`;
    } else {
      response.value = data as MessagesResponse;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errorMessage.value = `Network error: ${message}`;
  } finally {
    loading.value = false;
    elapsed.value = Math.round(performance.now() - started);
  }
};

const extractText = (blocks: ContentBlock[]): string =>
  blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n\n");

const nonTextBlocks = computed((): ContentBlock[] => {
  if (!response.value) return [];
  return response.value.content.filter((b) => b.type !== "text");
});
</script>

<template>
  <section v-if="seed" class="playground" :aria-label="seed.title">
    <header class="playground__header">
      <span class="playground__eyebrow">Playground en vivo (BYOK)</span>
      <h4 class="playground__title">{{ seed.title }}</h4>
      <p class="playground__description">{{ seed.description }}</p>
    </header>

    <ApiKeySetup />

    <div class="playground__editor">
      <div class="playground__row">
        <label class="playground__field">
          <span>Model</span>
          <input
            v-model="draft.model"
            type="text"
            :disabled="loading"
            spellcheck="false"
          />
        </label>
        <label class="playground__field playground__field--small">
          <span>max_tokens</span>
          <input
            v-model.number="draft.max_tokens"
            type="number"
            min="1"
            max="16000"
            :disabled="loading"
          />
        </label>
      </div>

      <label class="playground__field playground__field--textarea">
        <span>System prompt (opcional)</span>
        <textarea
          v-model="draft.system"
          rows="2"
          :disabled="loading"
          placeholder="Dejalo vacío si no necesitás rol"
          spellcheck="false"
        />
      </label>

      <label class="playground__field playground__field--textarea">
        <span>User message</span>
        <textarea
          v-model="draft.user"
          rows="5"
          :disabled="loading"
          spellcheck="false"
        />
      </label>
    </div>

    <div class="playground__actions">
      <button
        type="button"
        class="playground__btn playground__btn--primary"
        :disabled="!hasKey || loading"
        @click="run"
      >
        <span v-if="loading">Corriendo…</span>
        <span v-else-if="!hasKey">Configurá tu API key arriba</span>
        <span v-else>▶ Ejecutar contra la API</span>
      </button>
      <button
        type="button"
        class="playground__btn"
        :disabled="loading"
        @click="resetDraft"
      >
        Resetear al seed
      </button>
    </div>

    <div v-if="errorMessage" class="playground__error">
      {{ errorMessage }}
    </div>

    <div v-if="response" class="playground__response">
      <header class="playground__response-head">
        <span class="playground__response-label">Response</span>
        <span class="playground__response-meta">
          {{ response.model }} · stop: {{ response.stop_reason ?? "n/a" }}
          <span v-if="elapsed !== null"> · {{ elapsed }} ms</span>
        </span>
      </header>

      <div class="playground__response-text">
        <p
          v-for="(line, idx) in extractText(response.content).split(/\n\n+/)"
          :key="idx"
        >
          {{ line }}
        </p>
      </div>

      <details v-if="nonTextBlocks.length" class="playground__extras">
        <summary>Otros content blocks ({{ nonTextBlocks.length }})</summary>
        <pre>{{ JSON.stringify(nonTextBlocks, null, 2) }}</pre>
      </details>

      <div class="playground__usage">
        <span>input: <strong>{{ response.usage.input_tokens }}</strong></span>
        <span>output: <strong>{{ response.usage.output_tokens }}</strong></span>
        <span v-if="response.usage.cache_read_input_tokens">
          cache_read: <strong>{{ response.usage.cache_read_input_tokens }}</strong>
        </span>
        <span v-if="response.usage.cache_creation_input_tokens">
          cache_creation: <strong>{{ response.usage.cache_creation_input_tokens }}</strong>
        </span>
      </div>
    </div>

    <p v-if="seed.learning_tip" class="playground__tip">
      💡 {{ seed.learning_tip }}
    </p>
  </section>
  <aside v-else class="playground playground--missing">
    <p>
      Playground seed <code>{{ props.id }}</code> no encontrada.
      Agregala en <code>.vitepress/playgrounds.yaml</code>.
    </p>
  </aside>
</template>

<style scoped>
.playground {
  margin: 1.75rem 0;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.playground--missing {
  background: var(--vp-c-yellow-soft, #fff7e6);
}

.playground__header {
  margin-bottom: 0.9rem;
}

.playground__eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 0.3rem;
}

.playground__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.playground__description {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.playground__editor {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.playground__row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.playground__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  flex: 1;
  min-width: 180px;
}

.playground__field--small {
  flex: 0 0 140px;
}

.playground__field input,
.playground__field textarea {
  padding: 0.45rem 0.6rem;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  resize: vertical;
}

.playground__field input:focus,
.playground__field textarea:focus {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
  border-color: var(--vp-c-brand-1);
}

.playground__field input:disabled,
.playground__field textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.playground__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.playground__btn {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  background: transparent;
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}

.playground__btn:hover:not(:disabled) {
  background: var(--vp-c-bg);
}

.playground__btn--primary {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
}

.playground__btn--primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

.playground__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.playground__error {
  margin-top: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  font-size: 0.85rem;
}

.playground__response {
  margin-top: 0.9rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

.playground__response-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.8rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.playground__response-label {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.playground__response-meta {
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.75rem;
}

.playground__response-text {
  padding: 0.8rem 1rem;
  font-size: 0.9rem;
  line-height: 1.6;
}

.playground__response-text p {
  margin: 0 0 0.6rem;
}

.playground__response-text p:last-child {
  margin-bottom: 0;
}

.playground__extras {
  margin: 0 0.8rem 0.6rem;
  padding: 0.5rem 0.8rem;
  background: var(--vp-c-bg-soft);
  border-radius: 6px;
  font-size: 0.8rem;
}

.playground__extras summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
  font-weight: 600;
}

.playground__extras pre {
  margin: 0.5rem 0 0;
  max-height: 300px;
  overflow: auto;
  font-size: 0.72rem;
  line-height: 1.45;
}

.playground__usage {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 1rem 0.8rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono, monospace);
  flex-wrap: wrap;
}

.playground__usage strong {
  color: var(--vp-c-brand-1);
  font-variant-numeric: tabular-nums;
}

.playground__tip {
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.75rem;
  background: rgba(217, 119, 87, 0.08);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}
</style>
