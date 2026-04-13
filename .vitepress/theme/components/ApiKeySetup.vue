<script setup lang="ts">
import { ref } from "vue";
import { useApiKey } from "../composables/useApiKey";

const { hasKey, maskedKey, setKey, clearKey, hydrated } = useApiKey();

const draft = ref("");
const showInput = ref(false);

const onSave = (): void => {
  const value = draft.value.trim();
  if (!value) return;
  setKey(value);
  draft.value = "";
  showInput.value = false;
};

const onClear = (): void => {
  if (typeof window === "undefined") return;
  const confirmed = window.confirm("¿Borrar la API key guardada en este navegador?");
  if (confirmed) clearKey();
};

const onToggle = (): void => {
  showInput.value = !showInput.value;
};
</script>

<template>
  <div class="apikey" v-if="hydrated">
    <div v-if="hasKey" class="apikey__status">
      <span class="apikey__dot apikey__dot--ok" aria-hidden="true" />
      <span class="apikey__label">
        API key configurada: <code>{{ maskedKey }}</code>
      </span>
      <button type="button" class="apikey__link" @click="onToggle">
        Reemplazar
      </button>
      <button type="button" class="apikey__link apikey__link--danger" @click="onClear">
        Borrar
      </button>
    </div>
    <div v-else class="apikey__status">
      <span class="apikey__dot apikey__dot--warn" aria-hidden="true" />
      <span class="apikey__label">
        Necesitás tu API key para correr este playground.
        <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">
          Obtenela en platform.claude.com
        </a>.
      </span>
      <button type="button" class="apikey__link" @click="onToggle" v-if="!showInput">
        Ingresar
      </button>
    </div>

    <div v-if="showInput" class="apikey__form">
      <label class="apikey__input-label">
        <span>API key (se guarda solo en tu navegador)</span>
        <input
          type="password"
          v-model="draft"
          placeholder="sk-ant-api03-..."
          autocomplete="off"
          @keydown.enter.prevent="onSave"
        />
      </label>
      <div class="apikey__actions">
        <button
          type="button"
          class="apikey__btn apikey__btn--primary"
          :disabled="!draft.trim()"
          @click="onSave"
        >
          Guardar
        </button>
        <button type="button" class="apikey__btn" @click="showInput = false">
          Cancelar
        </button>
      </div>
      <p class="apikey__disclaimer">
        La key se persiste en <code>localStorage</code> de este navegador y se envía
        directamente a <code>api.anthropic.com</code> con el header
        <code>anthropic-dangerous-direct-browser-access: true</code>. Los requests pagan
        a tu cuenta. No compartas esta pestaña con otros.
      </p>
    </div>
  </div>
</template>

<style scoped>
.apikey {
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}

.apikey__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.apikey__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.apikey__dot--ok {
  background: #22c55e;
}

.apikey__dot--warn {
  background: #f59e0b;
}

.apikey__label {
  color: var(--vp-c-text-2);
}

.apikey__label code {
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  background: var(--vp-c-bg);
}

.apikey__label a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.apikey__link {
  background: transparent;
  border: none;
  color: var(--vp-c-brand-1);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  text-decoration: underline;
}

.apikey__link:hover {
  color: var(--vp-c-brand-2);
}

.apikey__link--danger {
  color: var(--vp-c-text-3);
}

.apikey__link--danger:hover {
  color: #b91c1c;
}

.apikey__form {
  margin-top: 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
}

.apikey__input-label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}

.apikey__input-label input {
  padding: 0.4rem 0.55rem;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.apikey__actions {
  margin-top: 0.6rem;
  display: flex;
  gap: 0.5rem;
}

.apikey__btn {
  padding: 0.35rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.apikey__btn--primary {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
}

.apikey__btn--primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

.apikey__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.apikey__disclaimer {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  line-height: 1.5;
}

.apikey__disclaimer code {
  padding: 0.05rem 0.3rem;
  background: var(--vp-c-bg-soft);
  border-radius: 3px;
  font-size: 0.7rem;
}
</style>
