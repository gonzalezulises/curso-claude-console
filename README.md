# Curso Claude Console: de Cero a Arquitecto de Claude Code

Megacurso técnico que lleva a un developer desde "nunca toqué Claude" hasta **arquitectar sistemas de producción** sobre todo el ecosistema Anthropic — Messages API, Workbench, Files, Skills, Tool use, MCP, Managed Agents, Credential Vaults, Claude Code CLI/SDK y Admin API.

> **Estado actual:** en producción activa. Módulo 0 completo. Módulos 1–12 con outline detallado. Ver [`COURSE_STATE.yaml`](./COURSE_STATE.yaml) para el estado vivo.

---

## Qué vas a aprender

Al terminar el curso puedes:

1. **Decidir** entre Messages API vs Managed Agents vs Claude Code SDK para cualquier caso de uso, con criterios técnicos — no intuición.
2. **Construir** agentes de producción con tool use, MCP, Skills y Credential Vaults.
3. **Operar** Claude Code como arquitecto: subagents, hooks, permission modes, MCP, integraciones IDE, CI/CD con GitHub Actions.
4. **Optimizar** costos con prompt caching (90% descuento), Batch API (50% descuento) y los beta features apropiados.
5. **Gobernar** una organización vía Admin API: workspaces, usage reports, chargeback, IAM.
6. **Arquitectar** un sistema multi-agente end-to-end con seguridad, observabilidad y deploy — el capstone del módulo 12.

---

## Estructura del currículo (13 módulos)

| # | Módulo | Horas | Enfoque |
|---|---|---|---|
| **0** | **Setup & Primer Contacto** | 2h | Cuenta, API keys, primer curl, tour del dashboard |
| 1 | Messages API: Fundamentos | 5h | Modelos 4.x, streaming, errores, retry |
| 2 | Workbench: El Laboratorio | 3h | Prompt iteration, versioning, files |
| 3 | Prompt Engineering de Arquitecto | 5h | Claude 4 best practices, XML, long context |
| 4 | Capacidades Multimodales | 4h | Vision, PDFs, Files API, citations |
| 5 | Tool Use: De Chat a Agente | 6h | JSON Schema, flujo completo, server-side tools |
| 6 | Optimización & Producción | 5h | Prompt caching, Batch, rate limits |
| 7 | MCP: El Protocolo del Ecosistema | 6h | Primitivas, MCP Connector, build your own server |
| 8 | Skills: Capacidades Reutilizables | 3h | SKILL.md, upload, Anthropic vs custom |
| 9 | Managed Agents: Agentes Hospedados | 6h | Agents, Sessions, Environments, Vaults |
| 10 | Claude Code: CLI & SDK | 8h | Subagents, hooks, skills, MCP, IDE, SDK, CI/CD |
| 11 | Admin API: Gobernanza | 4h | Usage/cost reports, IAM, audit |
| 12 | Arquitectura: Proyecto Capstone | 10h | Sistema multiagente end-to-end |

**Total:** ~67 horas de contenido · ~110 lecciones · ~80 ejercicios interactivos.

---

## Prerrequisitos

- **Node.js 20+** ([nodejs.org](https://nodejs.org)) — stack primario del curso
- **Python 3.11+** ([python.org](https://www.python.org)) — para ejercicios secundarios
- **Terminal** zsh/bash
- **Git** básico (clone, commit, branch)
- Familiaridad con JSON, HTTP, variables de entorno
- Una cuenta activa en [platform.claude.com](https://platform.claude.com) con API key

No necesitas experiencia previa con Claude ni con LLMs.

---

## Setup rápido

```bash
# 1. Clona el repo
git clone https://github.com/gonzalezulises/curso-claude-console.git
cd curso-claude-console

# 2. Copia y completa las variables de entorno
cp .env.example .env
# Edita .env y pega tu ANTHROPIC_API_KEY

# 3. Instala dependencias
npm install

# 4. Verifica que tu API key funciona
npm run verify

# 5. Envía tu primer mensaje a Claude
npm run hello
```

Si `npm run verify` imprime `✓ API key OK` y lista los modelos disponibles, estás listo para empezar por el [**Módulo 0**](./content/module-00-setup/lessons/01-bienvenida-al-curso.md).

---

## Cómo estudiar el curso

1. **Lecciones** → `content/module-XX-*/lessons/*.md` — leer en orden numérico.
2. **Ejercicios** → `content/module-XX-*/exercises/*.yaml` — al terminar cada lección, abre el ejercicio referenciado en el comentario `<!-- exercise:ex-XX-YY-slug -->`.
3. **Playground** → `playground/` — scripts listos para correr que exploran conceptos.
4. **Shared** → `shared/datasets/` y `shared/schemas/` — materiales reutilizables entre módulos.

Cada lección tiene la misma estructura:

1. **Objetivo** — qué sabrás al terminarla
2. **Concepto** — la teoría
3. **Ejecución real** — código que ejecutas contra la API con tu key
4. **Anti-patterns** — qué NO hacer y por qué
5. **Recap** — 3 takeaways clave

---

## Estructura del repo

```
curso-claude-console/
├── README.md                 ← estás aquí
├── CLAUDE.md                 ← instrucciones para Claude al trabajar este repo
├── COURSE_STATE.yaml         ← estado vivo del curso (qué está escrito, qué falta)
├── course.yaml               ← metadata global
├── content/                  ← los 13 módulos
│   ├── module-00-setup/
│   │   ├── module.yaml
│   │   ├── lessons/          ← markdown
│   │   └── exercises/        ← YAML (code-python, code-sql, quiz)
│   └── module-01..12/
│       └── OUTLINE.md        ← outline detallado del módulo (en progreso)
├── shared/
│   ├── datasets/             ← PDFs, imágenes, CSVs para ejercicios
│   └── schemas/              ← JSON schemas reutilizables
├── playground/               ← scripts ejecutables listos
├── scripts/                  ← utilidades de mantenimiento del curso
└── docs/                     ← decisiones arquitectónicas del curso
    ├── architecture.md
    ├── conventions.md
    ├── roadmap.md
    └── migration-to-rizoma.md
```

---

## Modelos referenciados en el curso

Todos los ejemplos usan **alias estables** (no snapshots con fecha):

| Alias | Cuándo lo usamos |
|---|---|
| `claude-haiku-4-5` | Default — la mayoría de ejercicios donde el costo importa |
| `claude-sonnet-4-6` | Producción: tool use, agentes, casos serios |
| `claude-opus-4-6` | Razonamiento profundo: extended thinking, tool use complejo |

Verificados contra el endpoint oficial `GET /v1/models` y la lista de `platform.claude.com/docs` (abril 2026).

---

## Filosofía del curso

- **Ejecución real, no screenshots muertos.** Cada snippet se corre contra la API con tu propia key. Todo output pegado en las lecciones es real.
- **Protocolo primero, SDK después.** Empezamos cada concepto con `curl` para entender el HTTP crudo, luego mostramos el equivalente en TypeScript/Python.
- **Anti-patterns explícitos.** Todo lo que NO debes hacer está marcado, no solo implícito. El salto a arquitecto está en saber qué evitar.
- **Honestidad sobre gaps.** Cuando algo no está documentado o Anthropic aún no lo clarifica, el curso lo dice explícitamente en vez de inventar.

---

## Licencia

Por definir. Actualmente repo privado para desarrollo.

---

## Contribuir

El curso está en producción activa. Si encuentras errores o ejemplos desactualizados contra la docs actual de Anthropic, abre un issue con:

- **Lección afectada** (path al `.md`)
- **Qué está mal** (ej: "el endpoint `/v1/foo` ahora se llama `/v1/bar`")
- **Fuente de la corrección** (URL de `platform.claude.com/docs/...`)
