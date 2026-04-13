# Primitiva: prompts

## Objetivo

Al terminar esta lección sabrás **qué son los prompts en MCP**, cómo un server ofrece templates parametrizados que el host puede insertar en la conversación, la diferencia entre un prompt y una tool (ambos aceptan argumentos, pero hacen cosas distintas), y por qué los prompts se consumen típicamente por el **usuario**, no por el modelo.

## Concepto

### Prompts: templates con parámetros para el user, no para el modelo

Esta es la primitiva más malentendida. Un **prompt** en MCP no es "lo que le decís a Claude en el system message". Es un **template reutilizable** que un server ofrece al host para que el usuario lo invoque con un nombre (típicamente un slash-command) y unos argumentos.

Ejemplo: un server de GitHub podría ofrecer un prompt `summarize_pr` que, dado un número de PR, expande a:

> "Analizá el PR #1234 del repo owner/project. Foco en: cambios de API públicas, tests agregados, riesgos de regresión. Formato: bullets cortos."

El usuario lo invoca — no el modelo. El host lo expande y lo manda a Claude como parte del mensaje.

<terminology>

**Slash command**: la forma habitual en que los hosts exponen prompts al user. Claude Code muestra los prompts de servers conectados como `/server-name:prompt-name`.

**Prompt vs tool**: el modelo invoca tools; el user invoca prompts. Un prompt genera **mensajes** (típicamente para empujar al modelo en una dirección); una tool ejecuta código y devuelve datos.

**Argument**: parámetros que el user (o el host) rellena al invocar el prompt. El server declara qué argumentos acepta.

</terminology>

### Los dos métodos

**`prompts/list`** — "¿qué prompts ofrecés?"

```json
{
  "prompts": [
    {
      "name": "summarize_pr",
      "description": "Generate a structured summary of a GitHub PR",
      "arguments": [
        { "name": "owner", "description": "repo owner", "required": true },
        { "name": "repo",  "description": "repo name",  "required": true },
        { "name": "number","description": "PR number",  "required": true }
      ]
    }
  ]
}
```

**`prompts/get`** — "dame el prompt expandido con estos argumentos"

```json
// client → server
{
  "method": "prompts/get",
  "params": {
    "name": "summarize_pr",
    "arguments": { "owner": "anthropics", "repo": "claude-code", "number": "1234" }
  }
}

// server → client
{
  "description": "Summarize PR #1234 in anthropics/claude-code",
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "Analyze PR #1234 at anthropics/claude-code. Focus on: public API changes, new tests, regression risk. Format: short bullets."
      }
    }
  ]
}
```

El resultado es una **lista de mensajes** (`role` + `content`), lista para insertarse en el array `messages` de la Messages API. Puede incluir varios mensajes (ej: un `user` setteando contexto y otro `assistant` con una respuesta "sembrada" que el modelo debe continuar).

### Por qué el prompt genera mensajes, no texto

Decisión importante del protocolo: un prompt devuelve `messages: [{role, content}]`, no un string. Esto permite patrones sofisticados:

- **Few-shot**: el prompt puede incluir ejemplos `user`/`assistant` como parte del template.
- **Ancla inicial**: podés devolver un `assistant` parcial para forzar un formato de respuesta (prefill).
- **Contexto embebido**: el prompt puede incluir contenido de resources (el server decide qué inyectar).

El host toma ese array y lo concatena al historial existente antes de llamar a `/v1/messages`.

### Flujo típico en Claude Code

1. El user escribe `/github:summarize_pr` y Claude Code le pide los argumentos.
2. El user da `owner=anthropics, repo=claude-code, number=1234`.
3. Claude Code hace `prompts/get` al server con esos args.
4. Recibe `messages: [...]`, los agrega al contexto de la sesión actual.
5. Claude (el modelo) responde como si el user hubiera escrito esos mensajes a mano.

El modelo nunca "ve" que hubo un prompt MCP de por medio. Lo que ve es el contenido expandido.

### Cuándo preferir prompts sobre tools

| Caso | Preferí |
|------|---------|
| El user quiere lanzar una tarea recurrente con inputs | Prompt |
| El modelo decide qué hacer dadas sus capabilities | Tool |
| Formato/estilo de respuesta fijo reutilizable | Prompt |
| Consulta de datos dinámicos | Tool |
| "Generá el resumen semanal" | Prompt |
| "Traeme las métricas de la última hora" | Tool |

Regla: **si el user es quien decide cuándo invocar, es un prompt. Si lo decide el modelo, es una tool.**

### Limitaciones prácticas

Los prompts son **menos usados** que tools y resources, y hay razones:

- No todos los hosts los exponen. Claude Code sí; la Messages API cruda requiere que tu código los exponga como slash-commands en tu app.
- Se solapan con "snippets" / "templates" del lado del host, que muchos equipos resuelven fuera de MCP.
- Para automatización de agentes, tools son más directas: el modelo decide y ejecuta.

Aún así, son la manera canónica de **empaquetar workflows reutilizables** dentro del ecosistema MCP. Si publicás un server de dominio (ej: un server para tu SaaS), exponer prompts con los flujos más comunes (`create_incident`, `escalate`, `weekly_report`) le ahorra trabajo a cualquier user que conecte tu server.

## Ejecución real

Los servers oficiales de `modelcontextprotocol/servers` no siempre exponen prompts — `filesystem`, `fetch` y `time` hoy exponen principalmente tools. Un server que sí expone prompts es, por ejemplo, un server custom que vos construyas o un server de dominio (GitHub, Slack, etc.).

Un shape típico, adaptado de la spec:

```json
// prompts/list
{
  "prompts": [
    {
      "name": "git_commit",
      "description": "Generate a conventional commit message for staged changes",
      "arguments": [
        { "name": "scope", "description": "commit scope (optional)", "required": false }
      ]
    }
  ]
}

// prompts/get name=git_commit arguments={scope: "auth"}
{
  "description": "Generate a conventional commit for scope auth",
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "Based on the staged diff I will paste next, write a conventional commit message with scope 'auth'. Keep it under 72 chars. Type: feat|fix|chore|docs|refactor."
      }
    }
  ]
}
```

El user en Claude Code lo invoca como `/myserver:git_commit scope=auth`. El host expande, pega el diff real (de otra tool), y le pasa todo a Claude.

> **Nota:** este ejemplo es ilustrativo del shape del protocolo — no viene de un server público específico. En la lección 9, cuando construyamos un server, expondremos un prompt real.

## Anti-patterns

- ❌ **Meter lógica mutante en `prompts/get`**. El método solo expande texto; no debería escribir a DB ni crear tickets. Si necesitás efectos, combiná con una tool que el prompt mencione.
- ❌ **Duplicar con tools**. No expongas `summarize_pr` como prompt **y** como tool con el mismo nombre. Confunde al host y al user. Elegí uno según la regla "quién invoca".
- ❌ **Prompts con 50 argumentos**. Son un formulario — si tenés tantos inputs, convertilo en un wizard (múltiples prompts) o documentá bien los defaults.
- ❌ **Texto del template en un idioma distinto al del user**. Si tu server es multi-lingüe, recibí el `locale` como argument o documentalo. Un prompt en inglés sobre un codebase latino puede generar fricción.
- ❌ **Prompts que el modelo elige solo**. No los uses como "tools lite". Si el modelo tiene que decidir cuándo ejecutar algo, es una tool por definición.

## Recap

- Un **prompt MCP** es un **template parametrizado** que el **user** invoca (no el modelo).
- Métodos: **`prompts/list`** (descubrir) y **`prompts/get`** (expandir con arguments).
- `prompts/get` devuelve un array de **`messages: [{role, content}]`** listo para insertarse en `/v1/messages`.
- En Claude Code se exponen típicamente como **slash-commands**.
- Úsalos para **workflows reutilizables iniciados por el user**; para acciones del modelo, tools.
- Son la primitiva menos usada — no todos los servers los exponen, y no todos los hosts los consumen.

---

**Fuente oficial:** [modelcontextprotocol.io/specification/server/prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)
**Ejercicio:** <!-- exercise:ex-07-01-conceptos-mcp -->
