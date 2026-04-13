<script setup lang="ts">
import { computed, ref } from "vue";
import { useData } from "vitepress";
import type { CurlSample } from "../../curl-samples";

type Props = {
  id: string;
};

const props = defineProps<Props>();
const { theme } = useData();

const sample = computed<CurlSample | null>(() => {
  const themeValue = theme.value as { curlSamples?: Record<string, CurlSample> };
  return themeValue.curlSamples?.[props.id] ?? null;
});

const showResponse = ref(false);
const copied = ref(false);

const toggleResponse = (): void => {
  showResponse.value = !showResponse.value;
};

const copyCurl = async (): Promise<void> => {
  if (!sample.value || typeof navigator === "undefined") return;
  try {
    await navigator.clipboard.writeText(sample.value.curl);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    // Clipboard API may be blocked. No-op.
  }
};

const statusClass = computed((): string => {
  if (!sample.value) return "";
  const s = sample.value.status;
  if (s >= 200 && s < 300) return "livecurl__status--ok";
  if (s >= 400) return "livecurl__status--err";
  return "";
});
</script>

<template>
  <section v-if="sample" class="livecurl" :aria-label="sample.title">
    <header class="livecurl__header">
      <span class="livecurl__eyebrow">Curl ejecutable</span>
      <h4 class="livecurl__title">{{ sample.title }}</h4>
      <p v-if="sample.description" class="livecurl__description">
        {{ sample.description }}
      </p>
    </header>

    <div class="livecurl__pane">
      <div class="livecurl__pane-head">
        <span class="livecurl__label">Request</span>
        <button type="button" class="livecurl__icon-btn" @click="copyCurl">
          {{ copied ? "¡Copiado!" : "Copiar" }}
        </button>
      </div>
      <pre class="livecurl__code"><code>{{ sample.curl }}</code></pre>
    </div>

    <div class="livecurl__actions">
      <button
        type="button"
        class="livecurl__btn"
        :class="{ 'livecurl__btn--active': showResponse }"
        @click="toggleResponse"
      >
        <span v-if="!showResponse">▶ Ejecutar (ver respuesta real)</span>
        <span v-else>⏴ Ocultar respuesta</span>
      </button>
      <span v-if="sample.captured_at" class="livecurl__meta">
        Capturada el {{ sample.captured_at }}
      </span>
    </div>

    <div v-if="showResponse" class="livecurl__pane livecurl__pane--response">
      <div class="livecurl__pane-head">
        <span class="livecurl__label">Response</span>
        <span class="livecurl__status" :class="statusClass">
          HTTP {{ sample.status }}
        </span>
      </div>
      <pre class="livecurl__code"><code>{{ sample.response }}</code></pre>
      <p v-if="sample.notes" class="livecurl__notes">{{ sample.notes }}</p>
    </div>
  </section>
  <aside v-else class="livecurl livecurl--missing">
    <p>
      Curl sample <code>{{ props.id }}</code> no encontrada. Agregala a
      <code>.vitepress/curl-samples.yaml</code>.
    </p>
  </aside>
</template>

<style scoped>
.livecurl {
  margin: 1.75rem 0;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.livecurl--missing {
  background: var(--vp-c-yellow-soft, #fff7e6);
}

.livecurl__header {
  margin-bottom: 0.85rem;
}

.livecurl__eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 0.3rem;
}

.livecurl__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.livecurl__description {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.livecurl__pane {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  overflow: hidden;
  margin-top: 0.75rem;
}

.livecurl__pane--response {
  margin-top: 0.75rem;
  animation: livecurl-slide 180ms ease-out;
}

@keyframes livecurl-slide {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.livecurl__pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.livecurl__label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.livecurl__status {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--vp-c-gray-soft);
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.livecurl__status--ok {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
}

.livecurl__status--err {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}

.livecurl__icon-btn {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  color: var(--vp-c-text-2);
  transition: background 140ms ease, border-color 140ms ease;
}

.livecurl__icon-btn:hover {
  background: var(--vp-c-bg);
  border-color: var(--vp-c-text-3);
}

.livecurl__code {
  margin: 0;
  padding: 0.8rem 0.95rem;
  font-size: 0.78rem;
  line-height: 1.5;
  overflow-x: auto;
  background: transparent;
}

.livecurl__code code {
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
  background: transparent !important;
  color: inherit;
  white-space: pre;
}

.livecurl__actions {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.livecurl__btn {
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
  background: var(--vp-c-brand-1);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 140ms ease;
}

.livecurl__btn:hover {
  background: var(--vp-c-brand-2);
}

.livecurl__btn--active {
  background: var(--vp-c-gray-soft);
  color: var(--vp-c-text-1);
}

.livecurl__btn--active:hover {
  background: var(--vp-c-divider);
}

.livecurl__meta {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}

.livecurl__notes {
  margin: 0.5rem 0.95rem 0.75rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  font-style: italic;
}
</style>
