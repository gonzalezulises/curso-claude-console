# Módulo 10 — Claude Code: CLI & SDK

**Duración estimada:** 8 horas · **Lecciones:** 14 · **Ejercicios:** ~10 · **Modelo default del módulo:** `claude-sonnet-4-6` (haiku para hooks rápidos, opus para arquitectura)

## Objetivo del módulo

Al terminar vas a operar **Claude Code** como arquitecto: instalación CLI + IDE extensions, configuración jerárquica (`~/.claude/`, `.claude/` del proyecto, `.claude.local/`), `CLAUDE.md` a todos los niveles, **settings.json**, **hooks** (los 7 eventos), **slash commands**, **subagents especializados**, **skills de proyecto**, integración **MCP servers custom**, **permission modes**, integración con **GitHub Actions**, y el **Claude Agent SDK** para embeberlo en tu propio backend.

## Prerrequisitos

- Módulos 1-9 (todo lo anterior es prerrequisito duro — Claude Code usa todo)

## Arco narrativo

Este es **el módulo más grande del curso** porque Claude Code es un producto completo con superficie gigante. Es también donde todo lo anterior encaja: tool use, MCP, Skills, prompts, modelos, agentes — todo vive acá operativamente. Un arquitecto de Claude Code no es "alguien que usa Claude Code"; es alguien que **configura la experiencia del equipo** alrededor de Claude Code: settings compartidos, hooks de calidad, subagents del dominio, MCP servers internos, permission modes por repo. Eso es el outcome del módulo.

## Lecciones

1. **Instalación y primer contacto** — `npm install -g @anthropic-ai/claude-code`, `claude` en un proyecto, primer mensaje, comparación con "pegar código a chat.claude.ai".
2. **Jerarquía de configuración** — `~/.claude/CLAUDE.md`, `.claude/CLAUDE.md` del proyecto, `.claude.local/` para cosas privadas, orden de precedencia, cuándo qué.
3. **`CLAUDE.md` efectivo** — cómo escribir uno que guía bien sin ahogar con contexto innecesario. Patrón del usuario + del proyecto.
4. **`settings.json`** — modelo default, permissions (`allow`/`deny`/`ask`), hooks, MCP servers, subagents, skills.
5. **Permission modes** — `default`, `acceptEdits`, `plan`, `bypassPermissions`. Cuándo cada uno, cómo configurar permission rules finas.
6. **Slash commands built-in y custom** — los que trae (`/help`, `/clear`, `/model`, `/compact`, `/resume`, etc.) y cómo escribir los tuyos en `.claude/commands/`.
7. **Hooks: los 7 eventos** — `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`, `UserPromptSubmit`, `SessionStart`. Ejemplos: lint automático, notificaciones, block commits con secretos.
8. **Subagents: especialización por tarea** — architect, auditor, researcher, test-runner. Cómo definirlos en `.claude/agents/`, cuándo usar subagent vs main context.
9. **Skills de proyecto** — skills locales al repo en `.claude/skills/`, cuándo conviene vs tool use inline vs MCP server.
10. **MCP servers en Claude Code** — configurar servers remotos y locales en `settings.json`, lifecycle, troubleshooting.
11. **IDE extensions: VS Code y JetBrains** — qué cambia respecto al CLI, `/ide` command, integración con debugger y diff view.
12. **Claude Agent SDK: embeber Claude Code en tu backend** — el SDK que permite construir apps que usan Claude Code como motor. Setup, API básica, casos de uso.
13. **GitHub Actions integration** — correr Claude Code en CI/CD: auto-review de PRs, tests, migraciones. Setup del action, permisos, costos.
14. **Lab: config de equipo completa** — el alumno recibe un repo esqueleto y configura: CLAUDE.md con convenciones, settings.json con hooks de lint/test/secrets-check, 2 subagents especializados (auditor + researcher), 1 slash command custom, 1 skill local, y 1 MCP server custom conectado.

## Ejercicios planeados

- `ex-10-01-claude-md.yaml` (quiz): identificar qué va en CLAUDE.md global vs proyecto vs local
- `ex-10-02-settings-json.yaml` (code-typescript): escribir un settings.json que define permissions y 1 hook
- `ex-10-03-slash-command.yaml` (code-typescript): crear un slash command `/test` que corre el suite
- `ex-10-04-hook-pretooluse.yaml` (code-typescript): hook que previene escrituras a `.env`
- `ex-10-05-subagent-auditor.yaml` (code-typescript): definir un subagent auditor en `.claude/agents/`
- `ex-10-06-skill-local.yaml` (code-typescript): skill local para formato de commits conventional
- `ex-10-07-mcp-local.yaml` (code-typescript): conectar un MCP server local al proyecto
- `ex-10-08-permission-modes.yaml` (quiz): cuándo usar cada modo
- `ex-10-09-agent-sdk.yaml` (code-typescript): script que usa el Claude Agent SDK para ejecutar una tarea headless
- `ex-10-10-lab-config-equipo.yaml` (code-typescript): el lab

## Lab del módulo

**Config de equipo completa** — partiendo de un repo esqueleto, el alumno configura:
- `CLAUDE.md` con convenciones del stack, estilo de commits, no-go zones
- `settings.json` con permissions explícitos, hooks de `PreToolUse` (bloquear `.env`) y `PostToolUse` (correr lint)
- 2 subagents: `auditor` (revisa cambios antes de commit) y `researcher` (explora codebase)
- 1 slash command custom `/ship` que ejecuta tests + build + commit
- 1 skill local que enseña el formato de migration files del proyecto
- 1 MCP server local con 2 tools del dominio del proyecto

Al final, el alumno corre Claude Code en el repo y verifica que cada pieza funciona.

## Conceptos de arquitecto

- Claude Code es **una plataforma configurable**, no una app rígida. El trabajo del arquitecto es diseñar la experiencia del equipo: qué permisos, qué hooks, qué subagents, qué skills.
- **Hooks son código determinista** en la pipeline — úsalos para invariantes (seguridad, calidad), no para lógica que Claude podría hacer mejor
- **Subagents protegen el main context** — delegar exploración reduce ruido y permite paralelismo
- **CLAUDE.md jerárquico** separa lo personal (global) de lo colectivo (proyecto) de lo efímero (local)
- **Agent SDK** es lo que te permite convertir Claude Code en parte de tu producto — no solo de tu dev loop

## Material externo referenciado

- `platform.claude.com/docs/en/docs/claude-code`
- `platform.claude.com/docs/en/docs/claude-code/sdk`
- `platform.claude.com/docs/en/docs/claude-code/hooks`
- `platform.claude.com/docs/en/docs/claude-code/settings`
- `github.com/anthropics/claude-code-action`

## Notas para la sesión de producción

- Verificar que los nombres de los 7 eventos de hooks siguen iguales al escribir.
- El SDK API cambia relativamente rápido — pinear versión exacta.
- Dado el tamaño del módulo, considerar partirlo en 2 sesiones de producción (lecciones 1-7 y 8-14).
