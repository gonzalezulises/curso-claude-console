# Módulo 3 — Prompt Engineering de Arquitecto

**Duración estimada:** 5 horas · **Lecciones:** 9 · **Ejercicios:** ~6 · **Modelo default del módulo:** `claude-sonnet-4-6` (por complejidad)

## Objetivo del módulo

Al terminar dominarás las técnicas de prompt engineering que Anthropic documenta específicamente para **modelos Claude 4.x**, entenderás por qué algunas técnicas "famosas" de GPT ya no aplican o aplican distinto, usarás XML tags para estructurar prompts densos, manejarás **extended thinking** y **adaptive thinking** con presupuestos, y sabrás diseñar prompts para **long context** (hasta 1M tokens con beta).

## Prerrequisitos

- Módulo 1 (Messages API)
- Módulo 2 (Workbench para iterar)

## Arco narrativo

Este módulo es **el corazón del "salto a arquitecto"**. Es la diferencia entre "uso la API" y "diseño prompts como código de producción". Las técnicas que vas a aprender acá están documentadas por Anthropic y probadas contra los modelos 4.x — no son folklore de Twitter.

## Lecciones

1. **Ser claro y directo** — técnica 1/8 del prompt engineering moderno para Claude 4. Qué significa "directo" en la práctica (verbos imperativos, outcomes explícitos, evitar "por favor").
2. **Ejemplos (few-shot) que realmente enseñan** — cuándo 2 ejemplos bastan y cuándo necesitás 5, cómo cubrir edge cases, cómo NO contaminar con sesgos.
3. **Dejá que Claude piense (chain of thought clásico)** — cuándo pedir razonamiento explícito vs. cuándo usar extended thinking (próxima lección).
4. **Extended thinking y adaptive thinking** — el parámetro `thinking: {type, budget_tokens}`, cómo leer los bloques `thinking` en la respuesta, cuándo activar y cuándo no, adaptive vs explicit budget.
5. **Usá XML tags para estructurar inputs complejos** — técnica específica de Claude. Ejemplos: `<context>`, `<task>`, `<examples>`, `<criteria>`. Por qué Anthropic lo recomienda y qué patrones funcionan.
6. **System prompts efectivos: roles, restricciones, tono** — diferencia con el mensaje user, qué poner en system y qué no.
7. **Prefill del assistant** — forzar a Claude a empezar con cierto texto para controlar formato (ej: `"{"` para forzar JSON).
8. **Long context (hasta 1M con beta context-1m-2025-08-07)** — cómo estructurar prompts de 500K tokens para que el modelo los use bien (documento al principio, pregunta al final, índice explícito).
9. **Lab: refactor de un prompt malo** — el alumno recibe un prompt largo y caótico, aplica las 8 técnicas, y compara resultados objetivos entre versión original y refactorizada.

## Ejercicios planeados

- `ex-03-01-directo-vs-vago.yaml` (code-typescript): reescribir 3 prompts vagos a directos
- `ex-03-02-xml-structure.yaml` (code-typescript): estructurar un prompt con tags XML apropiados y medir mejora
- `ex-03-03-thinking-budget.yaml` (code-typescript): correr el mismo problema con `thinking: {type: 'enabled', budget_tokens: 5000}` y sin, comparar respuestas y costos
- `ex-03-04-prefill-json.yaml` (code-typescript): forzar JSON válido via prefill
- `ex-03-05-long-context.yaml` (code-typescript): armar un prompt de ~100K tokens (varios docs concatenados), encontrar aguja en el pajar, medir precision con y sin reordenamiento
- `ex-03-06-lab-refactor.yaml` (code-typescript): el lab del módulo

## Lab del módulo

**Refactor de un prompt malo** — el alumno recibe un prompt real de ~300 palabras caótico, aplica sistemáticamente las 8 técnicas del módulo, documenta qué cambió en cada paso, y compara accuracy sobre un set de 20 casos de test.

## Conceptos de arquitecto

- Prompt engineering es **ingeniería**, no arte — hay técnicas documentadas, test cases, y métricas
- Extended thinking **cuesta tokens y latencia**; úsalo solo donde razonar de verdad cambia la calidad
- XML tags son la **lingua franca** de prompts complejos para Claude — los modelos están entrenados con ellos
- Long context no es "gratis" — ordenar bien y usar sumarios explícitos mejora la calidad marcadamente
- Prefill es una herramienta poderosa para controlar formato sin schema tools

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview`
- `platform.claude.com/docs/en/build-with-claude/extended-thinking`
- `platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips`

## Notas para la sesión de producción

- La activación de context 1M requiere beta header `context-1m-2025-08-07` — verificar que sigue siendo el alias al escribir.
- El ejercicio de long context puede ser caro en tokens — documentar explícitamente el costo estimado (~$0.30 por corrida con sonnet).
