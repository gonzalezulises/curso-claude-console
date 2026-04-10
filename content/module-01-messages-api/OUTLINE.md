# Módulo 1 — Messages API: Fundamentos

**Duración estimada:** 5 horas · **Lecciones:** 10 · **Ejercicios:** ~7 · **Modelo default del módulo:** `claude-haiku-4-5`

## Objetivo del módulo

Al terminar sabrás manejar la Messages API a nivel arquitecto: entenderás todos los parámetros relevantes del request, leerás cualquier respuesta (incluyendo thinking blocks), controlarás el modelo con `system`/`temperature`/`stop_sequences`, manejarás streaming SSE correctamente, implementarás retries con backoff, distinguirás los errores de la API, y usarás el endpoint `count_tokens` para presupuestar antes de llamar.

## Prerrequisitos

- Módulo 0 completo (cuenta, key, primer curl, setup local)
- Entender HTTP request/response y JSON

## Arco narrativo

El Módulo 0 te dio un hola mundo. Este módulo te da el **dominio completo del único endpoint** (`/v1/messages`) sobre el que se construye todo lo demás del curso. Salir de acá implica que no vas a tener misterios con la API cruda — cuando en módulos posteriores veas tool use, caching o MCP, todo va a ser "un campo más en el body".

## Lecciones

1. **Familia de modelos 4.x y cómo elegir** — Haiku 4.5 / Sonnet 4.6 / Opus 4.6: benchmarks, precios relativos, casos de uso. Aliases vs snapshots con fecha.
2. **Anatomía completa del request** — `model`, `max_tokens`, `messages[]`, `system`, `temperature`, `top_p`, `top_k`, `stop_sequences`, `metadata.user_id`. Qué hace cada uno, cuándo tocar qué.
3. **Anatomía completa de la respuesta** — `content` como array de bloques (text, thinking, tool_use, server_tool_use), `stop_reason`, `stop_sequence`, `usage` con sus 4 campos.
4. **System prompts** — rol del `system`, cómo escribir uno efectivo, diferencia con mensajes `user`. Tip de prompt cacheable (preview al Módulo 6).
5. **Conversaciones multi-turno** — cómo extender `messages[]` para mantener contexto. Cuándo resetear. Prefill del assistant.
6. **Streaming con SSE** — header `Accept: text/event-stream`, eventos (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`), cómo parsearlos manualmente con curl + `stream-to-line`, luego con el SDK.
7. **count_tokens antes de llamar** — endpoint `/v1/messages/count_tokens`, por qué es gratis y útil para presupuestar prompts largos.
8. **Errores: 400, 401, 403, 404, 429, 500, 529** — el formato `{type: "error", error: {type, message}}`. Cómo reconocer cada uno y qué hacer.
9. **Retries con exponential backoff** — cómo el SDK los maneja por defecto, cómo implementarlos a mano en un cliente custom, qué errores sí reintentar y cuáles no.
10. **Lab del módulo: Chat CLI persistente** — script TS que mantiene una conversación, guarda historial en JSON, muestra tokens/costo en vivo, y streamea la respuesta.

## Ejercicios planeados

- `ex-01-01-elegir-modelo.yaml` (quiz): escenarios de "¿qué modelo usás para X?"
- `ex-01-02-system-prompt.yaml` (code-typescript): escribir un system prompt que haga al modelo responder siempre como JSON válido
- `ex-01-03-parsear-content.yaml` (code-python): dado un payload, extraer solo los bloques de tipo `text`
- `ex-01-04-streaming-manual.yaml` (code-typescript): parsear SSE a mano sin SDK
- `ex-01-05-count-tokens.yaml` (code-typescript): calcular presupuesto de prompt antes de enviarlo
- `ex-01-06-error-matrix.yaml` (quiz): matriz de errores → acción (reintentar, fallar, degradar)
- `ex-01-07-chat-cli.yaml` (code-typescript): completar el chat CLI persistente del lab

## Lab del módulo

**Chat CLI persistente** (`exercises/ex-01-07-chat-cli.yaml`) — script TypeScript que:
- Lee el historial de `./chat-history.json` si existe
- Acepta input del usuario en loop
- Streamea la respuesta token por token
- Persiste el historial actualizado
- Imprime al final tokens usados y costo estimado basado en los precios del modelo

## Conceptos de arquitecto (que separan este módulo de un "API 101")

- Entender que `content` es **siempre** un array de bloques permite extender a tool use sin refactor
- Tratar los errores como una **máquina de estados** (reintentable vs fatal vs degradar) en vez de "try/catch genérico"
- Usar `metadata.user_id` desde el día 1 para que Analytics y Admin API te den tracking per-usuario-final sin trabajo extra
- `count_tokens` como guardia económica antes de enviar payloads grandes (evita sorpresas de $$)

## Material externo referenciado

- `platform.claude.com/docs/en/api/messages`
- `platform.claude.com/docs/en/api/messages-streaming`
- `platform.claude.com/docs/en/api/messages-count-tokens`
- `platform.claude.com/docs/en/api/errors`

## Notas para la sesión de producción

- Ejecutar cada snippet con una key del curso, pegar output real.
- Para el ejercicio de streaming manual, incluir un parser de línea por línea como starter — el alumno solo rellena el switch sobre `event.type`.
- Validar los precios del modelo contra `platform.claude.com` al momento de escribir para que el cálculo de costo del lab sea exacto.
