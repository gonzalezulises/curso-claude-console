# Módulo 12 — Arquitectura: Proyecto Capstone

**Duración estimada:** 10 horas · **Lecciones:** 8 · **Ejercicios:** 1 (el capstone) · **Modelo default del módulo:** mezcla (haiku/sonnet/opus según componente)

## Objetivo del módulo

Al terminar habrás **diseñado y construido un sistema multi-agente completo end-to-end**, con seguridad, observabilidad y deploy. Este es el capstone: demuestra que podés tomar decisiones arquitecturales informadas sobre **todo el ecosistema Claude** (Messages API, MCP, Skills, Managed Agents, Claude Code, Admin API) y entregás algo que funcionaría en producción.

## Prerrequisitos

- **Módulos 0-11 completos.** Sin esto, el capstone es imposible.

## Arco narrativo

Los 11 módulos anteriores te dieron piezas. Este módulo te obliga a **componerlas** en un sistema real. No hay más teoría nueva — solo ensamble, trade-offs y justificaciones. El capstone no es "un ejercicio grande": es el **primer sistema que un futuro empleador / cliente podría ver**.

## Lecciones

1. **¿Cómo pensar un sistema multi-agente?** — decomposición por responsabilidad, límites de contexto, cuándo un sub-agent y cuándo un tool plano.
2. **Decidir entre Messages API, Managed Agents y Claude Code SDK** — rubric concreto: control vs velocidad, costo, ops, audit, escala, usuarios finales vs operadores.
3. **Seguridad por diseño** — threat model del sistema (prompt injection, data exfiltration, key leakage, tool abuse), mitigaciones concretas, principio de menor privilegio aplicado a cada agent/tool/vault.
4. **Observabilidad: logs, traces, costs, eval** — qué logeás de cada llamada, cómo trazás un request cross-agent, cómo integrás Analytics y cost_report con tu propio stack, cómo evaluás calidad con prompts de test.
5. **Deploy: local dev, staging, prod** — entornos reproducibles, separación de keys, promoción de prompts, rollback de skills, blue/green de agents.
6. **Especificación del capstone: arquitectura de referencia** — el sistema que vas a construir. Tres componentes (ver abajo) con contratos explícitos.
7. **Implementación guiada: día 1 (backbone + agent principal)** — setup del repo, elección de stack, implementación del componente central.
8. **Implementación guiada: día 2 (integraciones + deploy + documentación)** — sub-agents, MCP server custom, observabilidad, deploy, README del proyecto final.

## Ejercicio

- `ex-12-01-capstone-project.yaml` (code-typescript + deliverables) — **el único ejercicio del módulo**, evaluado contra una rubric explícita

## Capstone: Asistente de research técnico multi-agente

**Qué construís:** un asistente de research que, dada una pregunta técnica abierta (ej: "¿cuál es el estado del arte en RAG para documentos legales?"), produce un **reporte markdown con citas** ejecutando este pipeline:

- **Agent principal (orchestrator)**: recibe la pregunta, decide qué sub-agents invocar, ensambla el reporte final. Implementado con **Managed Agents** por la persistencia de session.
- **Sub-agent 1 (web-researcher)**: busca en la web usando el server-side web_search tool, devuelve snippets con citations.
- **Sub-agent 2 (paper-researcher)**: consulta Semantic Scholar via un **MCP server custom** que vos construís, devuelve papers con abstracts y DOIs.
- **Sub-agent 3 (synthesizer)**: recibe todo el material recolectado y produce el reporte en markdown con estructura fija, aprovechando **prompt caching** sobre el system prompt del formato.
- **Credential vault**: contiene la API key de Semantic Scholar y se monta solo en el sub-agent que la necesita.
- **Logging y costs**: cada llamada se loggea con id + tokens + tiempo, al final el sistema imprime un resumen de costo total del request.

**Requisitos duros del capstone:**

1. Usa al menos 3 productos del ecosistema (Messages API + Managed Agents + MCP custom — Skills bonus).
2. Implementa **seguridad**: key rotation documentada, vault para el secret de Semantic Scholar, prompt injection mitigation básica en el agent principal (no ejecutar instrucciones provenientes del contenido de papers).
3. Implementa **observabilidad**: log de cada llamada a `messages.create`, trace id propagado entre sub-agents, cost summary al final.
4. Incluye **eval**: 5 prompts de test con respuestas esperadas y un script que corre el eval y reporta métricas (accuracy, cost, latency promedio).
5. Incluye **README** que explica arquitectura, setup, run, costs, decisiones y trade-offs tomadas.

**Evaluación (rubric):**

| Dimensión | Peso |
|---|---|
| Correctitud técnica (funciona end-to-end) | 30% |
| Arquitectura (decisiones justificadas) | 25% |
| Seguridad (threat model + mitigaciones) | 15% |
| Observabilidad (logs + traces + costs) | 15% |
| Calidad del código y documentación | 15% |

## Conceptos de arquitecto

- Un sistema real no usa **una** abstracción — compone varias según cuál resuelve cada problema mejor
- **Las decisiones se documentan**: por qué Managed Agents para orquestación y Messages API directa para el sub-agent synthesizer, por ejemplo
- **Eval es parte del producto**, no un afterthought
- **Observabilidad desde el día 1** — agregarla después es ~10x más caro
- El **README** es la primera (y a veces única) impresión del proyecto

## Material externo referenciado

- Todo lo de módulos 1-11
- `platform.claude.com/docs/en/build-with-claude/prompt-engineering/reducing-hallucinations` (para eval)
- Guías públicas de prompt injection mitigation

## Notas para la sesión de producción

- Este módulo probablemente requiere 2-3 sesiones de producción para escribirse correctamente.
- El capstone debe ser replicable: el starter code tiene que correr "out of the box" y guiar al alumno sin hacerle el trabajo.
- La rubric debe ser objetiva donde sea posible (tests automatizados) y cualitativa solo donde es inevitable (decisiones arquitecturales documentadas).
