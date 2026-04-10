# Módulo 5 — Tool Use: De Chat a Agente

**Duración estimada:** 6 horas · **Lecciones:** 10 · **Ejercicios:** ~7 · **Modelo default del módulo:** `claude-sonnet-4-6`

## Objetivo del módulo

Al terminar sabrás diseñar **herramientas (tools)** con JSON Schema, entender el flujo completo `user → assistant(tool_use) → tool_result → assistant(final)`, usar **server-side tools** de Anthropic (bash, code execution, web search, text editor), manejar **múltiples tools en paralelo**, y aplicar las optimizaciones beta (`strict`, `defer_loading`, `eager_input_streaming`).

## Prerrequisitos

- Módulos 1-3 (API cruda, prompting)

## Arco narrativo

Tool use es **el pivote** del curso: acá Claude deja de ser un "chatbot que genera texto" y pasa a ser un **actor** que puede invocar funciones de tu programa. Entender bien este flujo es prerrequisito para MCP (Módulo 7), Skills (Módulo 8), Managed Agents (Módulo 9) y Claude Code (Módulo 10) — todos son abstracciones sobre tool use.

## Lecciones

1. **Qué es tool use y por qué cambia todo** — el modelo mental: el modelo no ejecuta, propone. Tu código ejecuta y devuelve resultados.
2. **Definir un tool: name, description, input_schema** — JSON Schema drafts, buenas descriptions (son parte del prompt).
3. **Flujo completo mínimo** — request con `tools[]` → respuesta con `stop_reason: tool_use` → request con `tool_result` → respuesta final.
4. **Parámetros avanzados: `tool_choice`** — `auto`, `any`, `{type: 'tool', name: '...'}`, forzar un tool específico.
5. **Múltiples tools y paralelismo** — el modelo puede emitir varios `tool_use` en un solo turno. Ejecutar en paralelo y devolver los `tool_result` en el mismo mensaje.
6. **Server-side tools de Anthropic: web_search** — activar con beta, modelo hace la búsqueda por vos, recibís citations.
7. **Server-side tools: bash & text editor** — herramientas hospedadas que Anthropic ejecuta en un sandbox. Cuándo conviene vs tu propio bash.
8. **Server-side tools: code execution** — Python en sandbox Anthropic, limitaciones, casos de uso (data analysis).
9. **Optimizaciones beta** — `strict: true` para schema enforcement, `defer_loading` para tools caros, `eager_input_streaming` para latencia.
10. **Lab: mini-agente con 3 tools** — get_weather, calculate, send_email (mock). El alumno implementa el runtime loop.

## Ejercicios planeados

- `ex-05-01-primer-tool.yaml` (code-typescript): definir `get_weather`, ejecutar flujo completo
- `ex-05-02-schema-strict.yaml` (code-typescript): probar que `strict: true` rechaza inputs mal tipados
- `ex-05-03-multiple-tools.yaml` (code-typescript): ejecutar 3 tool_use en paralelo en un solo turno
- `ex-05-04-tool-choice.yaml` (code-typescript): forzar un tool específico con tool_choice
- `ex-05-05-web-search.yaml` (code-typescript): usar web_search server-side y extraer citations
- `ex-05-06-code-execution.yaml` (code-typescript): pedir a Claude que analice un CSV via code execution
- `ex-05-07-lab-mini-agente.yaml` (code-typescript): el lab del módulo

## Lab del módulo

**Mini-agente con 3 tools cliente** — script TS que expone `get_weather(city)`, `calculate(expression)`, `get_user_preference(key)`. El alumno implementa el runtime loop (while `stop_reason === 'tool_use'`: ejecutar tools, appendear results, re-llamar). El usuario puede hacer preguntas como "¿cómo está el clima donde prefiero vacacionar?" y el agente encadena las tools.

## Conceptos de arquitecto

- Tool use es **estructurado** (JSON Schema) — aprovéchalo para validar en la frontera
- El loop `tool_use → tool_result` es tu responsabilidad — el SDK no lo orquesta por vos en vanilla (eso es lo que Managed Agents hace por vos en el Módulo 9)
- Server-side tools reducen latencia y complejidad a costa de flexibilidad
- `strict: true` previene drift de schema que te rompe en producción
- El `description` de cada tool es **parte del prompt** — escribilo con el mismo cuidado que un system prompt

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/tool-use`
- `platform.claude.com/docs/en/build-with-claude/tool-use/implementation`
- `platform.claude.com/docs/en/build-with-claude/tool-use/web-search-tool`
- `platform.claude.com/docs/en/build-with-claude/tool-use/bash-tool`
- `platform.claude.com/docs/en/build-with-claude/tool-use/code-execution-tool`

## Notas para la sesión de producción

- Verificar que los betas (`code-execution-2025-05-22`, `interleaved-thinking-2025-05-14`, etc.) siguen con los mismos aliases al momento de escribir.
- El ejercicio de code execution puede tener costo no trivial — presupuestar en ~$0.10 por corrida.
