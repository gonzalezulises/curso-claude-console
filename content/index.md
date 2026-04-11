# Claude Console: de Cero a Arquitecto de Claude Code

Megacurso técnico que lleva a un developer backend/fullstack desde el primer
`curl` contra `/v1/messages` hasta arquitectar sistemas multi-agente de
producción sobre el ecosistema completo de **platform.claude.com**.

> Curso en producción · v0.1.0 · Módulo 1 completo.

## ¿Qué vas a aprender?

- Dominar la **Messages API**: request, response, streaming SSE, `count_tokens`,
  errores, retries con exponential backoff.
- **Prompt engineering de arquitecto** con las técnicas Claude 4 (XML tags,
  long context, adaptive thinking).
- **Capacidades multimodales**: visión, PDFs, Files API, citations nativas.
- **Tool use** como primitiva para pasar de chat a agente real.
- **Optimización & producción**: prompt caching, batch API, extended cache TTL,
  context 1M, rate limits.
- **MCP** (Model Context Protocol): arquitectura, primitivas, MCP Connector y
  construcción de servers propios.
- **Skills** reutilizables — propias y del catálogo de Anthropic.
- **Managed Agents**: Agents, Sessions, Environments, Credential Vaults,
  sub-agents, monitoreo.
- **Claude Code** como arquitecto: CLI, `CLAUDE.md`, hooks, subagents, skills,
  MCP, IDE integrations, SDK y CI/CD con GitHub Actions.
- **Admin API** para gobernanza: workspaces, usage/cost reports, IAM, audit.
- Un **capstone** real que combina todo en un sistema multi-agente.

## Estructura

- **13 módulos** (del 0 al 12), ~67 horas estimadas.
- **~110 lecciones** con snippets verificados contra la API real.
- **~80 ejercicios** ejecutables: `code-typescript`, `code-python` y quizzes.
- Cada módulo cierra con un **lab práctico**. El módulo 12 es el capstone.

## Convenciones del curso

- **Idioma**: español. *Code identifiers* en inglés.
- **Stack primario**: TypeScript con `tsx`. Python 3.11+ como secundario.
- **Modelos referenciados**: siempre aliases estables (`claude-haiku-4-5`,
  `claude-sonnet-4-6`, `claude-opus-4-6`). Snapshots con fecha solo se usan en
  la lección que explica versioning.
- **Nada inventado**: cada endpoint, header y flag viene de documentación oficial
  verificada o de `curl` real. Outputs pegados son reales.
- Cada lección sigue la misma plantilla: **Objetivo / Concepto / Ejecución real
  / Anti-patterns / Recap**.

## Prerequisitos

- Node.js 20+ o Python 3.11+ instalado.
- Terminal `zsh`/`bash` básico y Git básico.
- Cuenta en [platform.claude.com](https://platform.claude.com) con una API key
  propia (se configura en el Módulo 0).
- JSON, HTTP y variables de entorno sin fricción.

## Por dónde empezar

- **[Módulo 0 — Setup & Primer Contacto](/module-00-setup/lessons/01-bienvenida-al-curso)**
  Cuenta, API keys, primer `curl`, tour del dashboard, entorno local listo.
- **[Módulo 1 — Messages API: Fundamentos](/module-01-messages-api/lessons/01-familia-de-modelos)**
  Diez lecciones + siete ejercicios sobre el único endpoint que sostiene todo
  lo demás del curso.

Los módulos 2-12 están en producción: cada uno ya tiene un `OUTLINE.md` que
podés previsualizar desde el sidebar.

---

Autor: **Ulises González** — arquitecto del curso.
Repo: [`gonzalezulises/curso-claude-console`](https://github.com/gonzalezulises/curso-claude-console).
