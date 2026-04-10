# Módulo 2 — Workbench: El Laboratorio

**Duración estimada:** 3 horas · **Lecciones:** 6 · **Ejercicios:** ~4 · **Modelo default del módulo:** `claude-haiku-4-5`

## Objetivo del módulo

Al terminar sabrás usar el **Workbench de `platform.claude.com`** como laboratorio de iteración de prompts antes de mover nada a código: crear prompts, versionarlos, adjuntar archivos, configurar parámetros, probar tools desde la UI, y exportar el resultado como snippet TypeScript/Python/curl listo para copiar.

## Prerrequisitos

- Módulo 0 (cuenta + setup)
- Módulo 1 (entender request/response/parameters)

## Arco narrativo

El Workbench es donde un arquitecto de Claude Code **prototipa más rápido** que escribiendo código. No es un juguete — es el flujo real que Anthropic recomienda para iterar prompts complejos antes de comprometerlos al repositorio. Salir de acá implica que tu workflow cotidiano de "probar un prompt" deja de ser "editar un archivo .ts y correrlo" y pasa a ser "pegar en Workbench → iterar rápido → exportar a código cuando está estable".

## Lecciones

1. **Tour del Workbench** — el layout, panel de sistema, panel de mensajes, panel de parámetros, panel de preview. Ubicar cada cosa.
2. **Iterar un prompt efectivamente** — ciclo de edit-run-compare, cuándo bajar temperatura para reproducibilidad, cuándo subirla para explorar.
3. **Parámetros en vivo: temperature, top_p, top_k, stop_sequences** — qué hace cada uno, intuiciones visuales jugando en el Workbench.
4. **Adjuntar archivos (Files API) desde el Workbench** — cómo subir un PDF o imagen una sola vez y usarla en múltiples iteraciones del prompt.
5. **Probar tools desde el Workbench** — definir un tool schema en la UI, ver el flujo `tool_use` → `tool_result` sin escribir código (preview del Módulo 5).
6. **Exportar a código: Get code** — cómo el Workbench te genera el snippet exacto (curl / TS / Python) listo para pegar en tu repo, y qué tiene que cambiar al llevarlo a producción (keys, retries, logging).

## Ejercicios planeados

- `ex-02-01-iteracion-prompt.yaml` (quiz): interpretar diferencias entre dos respuestas variando temperature
- `ex-02-02-parametros-efecto.yaml` (code-typescript): reproducir en código TS un prompt exacto del Workbench y verificar output equivalente
- `ex-02-03-upload-file.yaml` (code-typescript): usar Files API desde SDK para subir un PDF y pasarlo como referencia a un mensaje
- `ex-02-04-export-workbench.yaml` (quiz): identificar qué partes del snippet exportado son "boilerplate" y cuáles son tu prompt real

## Lab del módulo

**Iterar un clasificador en Workbench hasta estabilizarlo y exportarlo como script** — el alumno diseña un clasificador de sentimiento con 5 ejemplos few-shot en el Workbench, lo itera hasta lograr >90% precisión sobre un set de 10 frases test, exporta el snippet y lo corre localmente verificando que el resultado es idéntico.

## Conceptos de arquitecto

- El Workbench es para **iteración** (ciclos de 30 segundos), el editor es para **commits** (código estable)
- Versionar prompts en git una vez que están estables — no antes
- Files API y `file_id` desacoplan el contenido del payload (preview del Módulo 4)
- El snippet exportado es punto de partida, no de llegada — siempre agregarle retries, logging y env vars

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview` (Workbench section)
- `platform.claude.com/docs/en/api/files`

## Notas para la sesión de producción

- Incluir screenshots SOLO de secciones del Workbench que Ulises pueda confirmar existen en su cuenta antes de escribir la lección.
- Verificar el botón "Get code" hoy sigue con ese label; si cambió, actualizar al momento de escribir.
