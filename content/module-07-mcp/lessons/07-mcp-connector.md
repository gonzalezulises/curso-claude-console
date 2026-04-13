# MCP Connector en la Messages API

## Objetivo

Al terminar esta lección sabrás **cómo invocar servers MCP remotos directamente desde `/v1/messages`** sin escribir un client MCP propio. Aprenderás a usar el beta `mcp-client-2025-04-04`, el parámetro `mcp_servers`, los nuevos tipos de content block (`mcp_tool_use`, `mcp_tool_result`), y cómo restringir qué tools del server puede usar el modelo con `tool_configuration`.

## Concepto

### Qué es el MCP Connector

El **MCP Connector** es una feature beta de la Messages API que hace a la API **ser el host MCP por vos**. En lugar de correr un proceso MCP client localmente, le pasás al endpoint `/v1/messages` una lista de servers MCP remotos y Anthropic:

1. Inicializa la conexión con cada server.
2. Lista las tools del server.
3. Se las expone al modelo como tools regulares.
4. Cuando el modelo quiere llamarlas, la **infraestructura de Anthropic** las ejecuta contra el server.
5. El resultado vuelve al modelo y la conversación continúa.

Todo en un solo round-trip desde tu código.

<terminology>
**Beta header**: `anthropic-beta: mcp-client-2025-04-04`. Sin este header, el parámetro `mcp_servers` no es aceptado (HTTP 400: "Extra inputs are not permitted"). Existe también `mcp-client-2025-11-20` en el catálogo de betas — consultá las docs específicas para saber cuál recomienda Anthropic para tu caso.

**URL server**: por ahora el MCP Connector solo acepta servers MCP accesibles por URL (transporte `streamable-http`). Servers stdio locales NO se pueden conectar via Connector — para eso usás Claude Code o tu propio client MCP (lección 8).

**Tool configuration**: un filtro que le decís al Connector para limitar qué tools del server se exponen al modelo (`allowed_tools: ["only_this_one"]`) o desactivarlas del todo (`enabled: false`).
</terminology>

### Shape del request

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "..."}],
  "mcp_servers": [
    {
      "type": "url",
      "name": "deepwiki",
      "url": "https://mcp.deepwiki.com/mcp",
      "authorization_token": "optional-bearer",
      "tool_configuration": {
        "enabled": true,
        "allowed_tools": ["ask_question"]
      }
    }
  ]
}
```

Campos:

- `type`: siempre `"url"` (el único soportado hoy).
- `name`: un alias que usás para identificar este server en el response.
- `url`: la URL HTTP del server MCP.
- `authorization_token` (opcional): si el server pide Bearer auth, va acá. Anthropic lo manda como header `Authorization: Bearer <token>` al server.
- `tool_configuration` (opcional): filtro de tools.

### Los nuevos content blocks

Cuando usás MCP Connector, el response contiene dos content blocks nuevos que no existen en tool use regular:

**`mcp_tool_use`** — similar a `tool_use`, pero con `server_name`:

```json
{
  "type": "mcp_tool_use",
  "id": "mcptoolu_01...",
  "name": "ask_question",
  "input": { "repoName": "...", "question": "..." },
  "server_name": "deepwiki"
}
```

**`mcp_tool_result`** — similar a `tool_result`, pero con el `content` del server embebido:

```json
{
  "type": "mcp_tool_result",
  "tool_use_id": "mcptoolu_01...",
  "is_error": false,
  "content": [
    { "type": "text", "text": "This repository is..." }
  ]
}
```

**Diferencia clave con tool use artesanal**: en M05 vos manejabas el ciclo tool_use → ejecución en tu código → tool_result. Acá el ciclo lo hace Anthropic internamente — **no tenés que "responder" con un tool_result**, ya viene incluido en el mismo response como un bloque más. Tu código recibe la conversación entera resuelta.

### Flujo en un solo request

```
TU CÓDIGO              ANTHROPIC API              SERVER MCP
    │                         │                         │
    │── POST /v1/messages ───►│                         │
    │  (con mcp_servers)      │                         │
    │                         │── initialize ──────────►│
    │                         │◄── server capabilities ─│
    │                         │── tools/list ──────────►│
    │                         │◄── tools list ──────────│
    │                         │                         │
    │                         │ (llama al modelo con    │
    │                         │  tools expuestas)       │
    │                         │                         │
    │                         │── tools/call ──────────►│
    │                         │◄── result ──────────────│
    │                         │                         │
    │                         │ (modelo continúa con    │
    │                         │  el result embebido)    │
    │                         │                         │
    │◄── response con ────────│                         │
    │   [mcp_tool_use,        │                         │
    │    mcp_tool_result,     │                         │
    │    text]                │                         │
```

### Ventajas y limitaciones

**Ventajas**:
- Cero código MCP del lado del cliente. No instalás SDK, no manejás transporte.
- El modelo ve las tools como si fueran nativas.
- Un solo request resuelve toda la cadena (si el modelo hace más de un `tools/call` en la secuencia, también queda resuelto en la respuesta).

**Limitaciones actuales**:
- Solo servers HTTP (no stdio).
- El server tiene que estar **accesible desde los datacenters de Anthropic** (no sirve un server en localhost).
- La cadena de pensamiento no es streameada en tiempo real entre tool calls — recibís todo junto al final.
- Cada server suma latencia y costo en tokens (las tools declaradas se suman al input del modelo).

Caso típico: consumir servers MCP **públicos o hosted** (DeepWiki, Notion remote, servers hosted por proveedores SaaS) desde tu backend sin tener que construir infraestructura MCP local.

## Ejecución real

Request verdadero contra el server MCP público de **DeepWiki** (wiki de repos open-source, no requiere auth):

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: mcp-client-2025-04-04" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 300,
    "messages": [{
      "role": "user",
      "content": "Using the DeepWiki MCP server, tell me in one sentence what the repo anthropics/anthropic-cookbook is for."
    }],
    "mcp_servers": [{
      "type": "url",
      "name": "deepwiki",
      "url": "https://mcp.deepwiki.com/mcp",
      "tool_configuration": {"allowed_tools": ["ask_question"]}
    }]
  }'
```

Response (partes clave, ejecutado el 2026-04-12 contra Haiku 4.5):

```json
{
  "stop_reason": "end_turn",
  "content": [
    {
      "type": "mcp_tool_use",
      "id": "mcptoolu_01...",
      "name": "ask_question",
      "input": {
        "repoName": "anthropics/anthropic-cookbook",
        "question": "What is this repository for?"
      },
      "server_name": "deepwiki"
    },
    {
      "type": "mcp_tool_result",
      "tool_use_id": "mcptoolu_01...",
      "is_error": false,
      "content": [{"type":"text","text":"..."}]
    },
    {
      "type": "text",
      "text": "The anthropics/anthropic-cookbook repository is a collection of practical Jupyter notebooks that demonstrate how to use Anthropic's Claude API and SDK with real-world use cases."
    }
  ],
  "usage": {
    "input_tokens": 2283,
    "output_tokens": 130,
    "service_tier": "standard"
  }
}
```

Observaciones:

- `input_tokens: 2283` — mucho más alto que un "hola" normal porque las tools del server se declaran como parte del prompt del modelo. Cada tool del server que expongas suma tokens.
- El modelo invoca `ask_question` (1 mcp_tool_use), la API la ejecuta contra DeepWiki, y el resultado viene embebido (1 mcp_tool_result). Luego el modelo sintetiza la respuesta final (1 text block).
- Filtré con `tool_configuration.allowed_tools: ["ask_question"]` — DeepWiki ofrece varias tools pero solo esa llega al modelo.

**Sin el beta header**, el request falla con:

```json
{"type":"error","error":{"type":"invalid_request_error","message":"mcp_servers: Extra inputs are not permitted"}}
```

HTTP 400. Acordate del header `anthropic-beta: mcp-client-2025-04-04`.

### TypeScript equivalente

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.beta.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 300,
  messages: [{
    role: "user",
    content: "Using the DeepWiki MCP server, tell me in one sentence what the repo anthropics/anthropic-cookbook is for.",
  }],
  mcp_servers: [{
    type: "url",
    name: "deepwiki",
    url: "https://mcp.deepwiki.com/mcp",
    tool_configuration: { allowed_tools: ["ask_question"] },
  }],
  betas: ["mcp-client-2025-04-04"],
});

for (const block of resp.content) {
  if (block.type === "mcp_tool_use") {
    console.log(`[CALL] ${block.server_name}.${block.name}`, block.input);
  } else if (block.type === "mcp_tool_result") {
    console.log(`[RESULT] is_error=${block.is_error}`);
  } else if (block.type === "text") {
    console.log(`[TEXT] ${block.text}`);
  }
}
```

El SDK expone el Connector bajo `client.beta.messages` con la opción `betas: ["mcp-client-2025-04-04"]`.

## Anti-patterns

- ❌ **Olvidar el beta header**. Es el error más común. `mcp_servers` sin beta = HTTP 400.
- ❌ **Exponer decenas de servers "por las dudas"**. Cada server declara sus tools en el prompt → más tokens de input por request. Listá solo los que el agente realmente necesita.
- ❌ **Conectar un server sin revisar sus tools primero**. El modelo puede llamar cualquier tool que el server exponga. Si no sabés qué ofrece un server MCP de terceros, usá `tool_configuration.allowed_tools` para whitelistear.
- ❌ **Hardcodear el `authorization_token` en el código cliente**. Como cualquier secret, va en env var. Un token de MCP server que se fuga = cualquiera puede consumir las tools autenticadas.
- ❌ **Usar MCP Connector para tools locales**. Si tus tools viven en tu backend, mejor tool use artesanal (M05) — no pagues la latencia de un server MCP remoto hecho por vos.
- ❌ **Asumir que el response trae solo una tool call**. El modelo puede encadenar varias en el mismo response si la task lo requiere. Iterá el array `content` esperando múltiples `mcp_tool_use` / `mcp_tool_result`.

## Recap

- **MCP Connector** (beta `mcp-client-2025-04-04`) convierte a `/v1/messages` en host MCP — vos solo pasás `mcp_servers: [...]` y Anthropic se encarga del handshake, discovery y ejecución.
- Solo servers **URL** (streamable-http) hoy; servers stdio locales no caben acá.
- Dos content blocks nuevos en la respuesta: **`mcp_tool_use`** (con `server_name`) y **`mcp_tool_result`** (con `content` del server embebido).
- **Sin el beta header**, el request falla con HTTP 400.
- Usá **`tool_configuration`** para whitelistear tools o desactivar servers en runtime.
- Cada server suma tokens de input — agregá solo los necesarios.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use/remote-mcp-servers](https://platform.claude.com/docs/en/build-with-claude/tool-use/remote-mcp-servers)
**Ejercicio:** <!-- exercise:ex-07-03-mcp-connector -->
