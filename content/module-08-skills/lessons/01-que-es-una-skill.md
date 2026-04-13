# ¿Qué es una Skill y cuándo usarla?

## Objetivo

Al terminar esta lección vas a entender qué es una **Agent Skill** de Anthropic (un bundle de `SKILL.md` + scripts + assets), qué problema resuelve respecto de meter 200 líneas de instrucciones en cada prompt, y cuándo conviene una skill versus un prompt inline, un tool custom del Módulo 5, o un server MCP del Módulo 7.

## Concepto

### El problema: prompts que crecen y se duplican

Imaginá que tu equipo necesita que Claude genere siempre reportes financieros con un formato específico: fuente Arial, colores industry-standard para formulas (azul inputs, negro cálculos, verde referencias), nunca hardcodear valores en fórmulas, documentar cada supuesto con "Source: ...".

La primera versión vive como un bloque de 200 líneas en tu `systemPrompt`. Funciona. Lo copiás al prompt del agente de Slack. Funciona. Lo pegás al script del CSV ingester. Funciona.

Seis meses después tenés el mismo bloque en cinco prompts distintos, ligeramente divergentes, y alguien modificó uno sin sincronizar los demás. Cuando el equipo de finanzas cambia el formato de fechas, hay que abrir cinco archivos.

Ese bloque tiene forma de **proceso**: instrucciones + reglas + ejemplos + (a veces) scripts auxiliares. No es una tool (no es una función con argumentos), no es un resource (no es data estática), no es conocimiento libre del modelo. Es una **capacidad**.

### La solución: Skills como bundles versionables

Una **Skill** es un bundle filesystem-based que Anthropic sabe cómo cargar en el container del modelo. Estructura mínima:

```
financial-report-skill/
├── SKILL.md          ← obligatorio, en la raíz
├── REFERENCE.md      ← opcional: docs extra
└── scripts/
    └── validate.py   ← opcional: código ejecutable
```

El archivo `SKILL.md` tiene un **frontmatter YAML** (nombre + description) y un cuerpo markdown con las instrucciones:

```yaml
---
name: financial-report
description: Use this skill when generating financial reports. Applies company-standard color coding, number formatting, and sourcing conventions.
---

# Financial Report Skill
[...instrucciones completas...]
```

Cuando invocás `/v1/messages` con la skill activa, Anthropic monta el folder en el filesystem del container (ruta `/skills/financial-report/`), y el modelo lo descubre vía `bash`/`text_editor`.

### Progressive disclosure: el truco que hace esto barato

Lo crítico es **cuándo** se carga cada parte de la skill al contexto:

| Nivel | Qué se carga | Cuándo | Costo en tokens |
|-------|--------------|--------|-----------------|
| 1 — Metadata | `name` + `description` del frontmatter | Siempre, en el system prompt | ~100 tokens |
| 2 — Instructions | El cuerpo de `SKILL.md` | Solo cuando la skill se dispara | <5k tokens |
| 3 — Resources | Otros archivos (`REFERENCE.md`, scripts) | Cuando el modelo decide leerlos | Variable, solo lo leído |

Esto significa que podés tener **20 skills instaladas** sin reventar el contexto: el modelo solo ve sus descripciones (~2k tokens totales) hasta que el usuario pide algo que matchea, y recién ahí el body completo entra.

Por contraste, 20 prompts embebidos en el system prompt serían ~100k tokens **siempre**, paguen o no.

<terminology>

**Agent Skill**: bundle reutilizable con un `SKILL.md` en su raíz + archivos opcionales. Enseña a Claude un proceso completo, no una función.

**Progressive disclosure**: la estrategia de cargar cada nivel del bundle solo cuando hace falta. Ahorra tokens y permite instalar muchas skills sin penalty.

**Container**: el VM con filesystem + bash + code execution donde corren las skills. Claude navega el folder con los mismos comandos (`cat`, `ls`, `python`) que usarías vos.

</terminology>

### Skills vs. las otras abstracciones

La tabla que resuelve el 80% de las decisiones de arquitectura:

| Situación | Usá |
|-----------|-----|
| Instrucción única, <20 líneas, específica a esta conversación | **Prompt inline** |
| Una función determinística con argumentos (`get_weather(city)`) | **Tool custom** (M05) |
| Un proceso con reglas/formato/helpers, reutilizado en muchas conversaciones | **Skill** |
| Un sistema externo (DB, API, servicio) expuesto a múltiples hosts | **MCP server** (M07) |

La regla que decanta: **si lo estás copiando a N prompts, probablemente sea una skill**. Si es una función con inputs discretos, es una tool. Si es un sistema con su propio lifecycle, es MCP.

### Dónde corren las skills

Skills están disponibles en tres superficies:

- **Claude API**: pre-built (pdf, docx, pptx, xlsx) + custom subidas via `/v1/skills`. Corren en el container con code execution. **Sin acceso a red.**
- **Claude Code**: solo custom, filesystem-based en `~/.claude/skills/` (user) o `.claude/skills/` (proyecto). Acceso full a la máquina del usuario.
- **claude.ai**: pre-built + custom (upload via zip en Settings > Features). User-scoped, no org-wide.

El mismo bundle `SKILL.md` funciona en las tres — el formato es idéntico. Pero **no hay sync automático**: subir una skill al API no la hace aparecer en claude.ai ni en Claude Code.

## Ejecución real

Para ver el shape de una skill real, pedile al API que liste las skills que Anthropic ya provee:

```bash
curl -sS https://api.anthropic.com/v1/skills?source=anthropic \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

Output real:

```json
{
  "data": [
    {
      "type": "skill",
      "id": "xlsx",
      "created_at": "2025-10-14T08:41:11.530827Z",
      "updated_at": "2026-02-03T15:09:44.321438Z",
      "display_title": "xlsx",
      "source": "anthropic",
      "latest_version": "20260203"
    },
    {
      "type": "skill",
      "id": "pptx",
      "display_title": "pptx",
      "source": "anthropic",
      "latest_version": "20260304"
    },
    {
      "type": "skill",
      "id": "pdf",
      "display_title": "pdf",
      "source": "anthropic",
      "latest_version": "20260203"
    },
    {
      "type": "skill",
      "id": "docx",
      "display_title": "docx",
      "source": "anthropic",
      "latest_version": "20260212"
    }
  ],
  "has_more": false,
  "next_page": null
}
```

Cuatro skills oficiales. `id` corto (`pdf`, `xlsx`, etc.) y versión como fecha (`20260203`). Las tuyas propias van a tener `source: "custom"`, `id` empezando con `skill_01...` y versión como timestamp unix.

## Anti-patterns

- ❌ **Convertir cualquier prompt largo en skill**. Si solo lo usás en un agente, el prompt inline es más simple. Skills brillan con reutilización cross-conversación.
- ❌ **Meter lógica de acceso a red en una skill API**. El container no tiene red (en la superficie API). Si necesitás hacer fetch a un servicio externo, es un tool o un MCP server, no una skill.
- ❌ **Tratar skills como tools con nombre fancy**. Una tool son inputs/outputs discretos. Una skill es un proceso completo con instrucciones + código + assets. Confundirlos produce skills que son solo "un wrapper para una función" — probablemente querías una tool.
- ❌ **Subir la misma skill a 3 superficies asumiendo que se sincronizan**. No se sincronizan. Subís separado a API, a claude.ai, y copiás a `~/.claude/skills/` para Claude Code.
- ❌ **Olvidar que metadata se carga siempre**. Si tenés 30 skills instaladas, son 30 × ~100 tokens permanentemente en tu system prompt. Diseñá descriptions que se disparen específicamente, no genéricas.

## Recap

- Una **Skill** es un bundle `SKILL.md` + scripts + assets que enseña a Claude un proceso completo, no una función.
- Resuelve el problema de **prompts largos duplicados** en múltiples agentes.
- Usa **progressive disclosure**: solo metadata se carga siempre; el body y los resources se leen on-demand.
- Anthropic provee 4 skills pre-built (`pdf`, `docx`, `pptx`, `xlsx`); vos subís las tuyas via `/v1/skills`.
- Elegí skill cuando reusés el mismo proceso cross-conversación; tool cuando sea una función; MCP cuando sea un sistema externo; prompt inline cuando sea one-off.
- Skills no sincronizan entre superficies (API, claude.ai, Claude Code) — gestioná cada una separada.

---

**Fuente oficial:** [platform.claude.com/docs/en/agents-and-tools/agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
**Ejercicio:** <!-- exercise:ex-08-02-skill-md -->
