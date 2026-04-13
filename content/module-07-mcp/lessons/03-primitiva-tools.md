# Primitiva: tools

## Objetivo

Al terminar esta lección sabrás **cómo un server MCP expone tools**, los dos métodos JSON-RPC involucrados (`tools/list` y `tools/call`), la relación uno-a-uno con los tools que viste en el Módulo 5, y cómo el host traduce entre ambos mundos.

## Concepto

### Tools en MCP = tools en la Messages API

MCP define cinco primitivas: **tools, resources, prompts, sampling y roots**. Las vemos una por lección. Arrancamos por la más importante y conocida: **tools**.

Una tool en MCP es **idéntica semánticamente** a una tool del Módulo 5:

- Tiene un `name` único en el server.
- Tiene una `description` que el modelo lee para decidir cuándo llamarla.
- Tiene un `inputSchema` (JSON Schema) que describe sus argumentos.
- Cuando se invoca, produce un resultado — típicamente texto, pero también puede ser imagen, audio o un resource link.

La única diferencia real: en tool use artesanal vos las definís inline en el request; en MCP las **declara el server** y el client las descubre en runtime.

### Los dos métodos que importan

Para tools, MCP define dos métodos JSON-RPC:

**`tools/list`** — "¿qué tools ofrecés?"

```json
// client → server
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

```json
// server → client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "search_notes",
        "description": "Search personal notes by keyword",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "search term" },
            "limit": { "type": "integer", "default": 10 }
          },
          "required": ["query"]
        }
      }
    ]
  }
}
```

**`tools/call`** — "ejecutá esta tool con estos argumentos"

```json
// client → server
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_notes",
    "arguments": { "query": "postgres index", "limit": 5 }
  }
}
```

```json
// server → client
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "Found 3 notes matching 'postgres index':\n1. ..." }
    ],
    "isError": false
  }
}
```

El `content` es un array de bloques tipados (como los content blocks de la Messages API). Los tipos soportados incluyen `text`, `image`, `audio`, y `resource_link` (una referencia a un resource que el client puede leer aparte).

### Cómo el host traduce MCP ↔ Messages API

Acá está la costura. El host hace esto cada vez que invoca al modelo:

1. Llama `tools/list` a cada server conectado.
2. Toma los tools y los transforma al shape que espera `/v1/messages`:

```javascript
// Lo que el server MCP devolvió:
{ name: "search_notes", description: "...", inputSchema: {...} }

// Lo que el host le pasa a Claude en tools:
{ name: "search_notes", description: "...", input_schema: {...} }
```

Casi igual — solo cambia `inputSchema` (camelCase, MCP) a `input_schema` (snake_case, Messages API).

3. Claude responde con un `tool_use`:

```json
{ "type": "tool_use", "id": "toolu_xxx", "name": "search_notes", "input": {"query": "..."} }
```

4. El host detecta "ese tool vino del server de notas", lo transforma a un `tools/call` MCP, lo manda.
5. El server responde con `content: [{type: "text", text: "..."}]`.
6. El host empaqueta ese content como `tool_result` y lo devuelve a Claude:

```json
{ "type": "tool_result", "tool_use_id": "toolu_xxx", "content": "Found 3 notes..." }
```

El modelo ve un ciclo tool use normal. MCP queda del lado del host.

### Dynamic discovery: la ventaja que justifica MCP

Con tool use artesanal, cada vez que agregás una tool tenés que:

1. Cambiar el código del backend.
2. Redeployar.
3. Volver a probar.

Con MCP, si un server agrega una tool nueva y soporta `listChanged: true` como capability:

1. El server manda una notificación `notifications/tools/list_changed`.
2. El client refresca la lista vía `tools/list`.
3. La próxima vez que el host invoque al modelo, Claude ya ve la nueva tool — **sin tocar el host**.

Esto es especialmente valioso cuando el server MCP expone un sistema dinámico (ej: un server de base de datos que expone una tool por cada tabla; si agregás una tabla, aparece una tool sola).

### Tool result: success vs error

Un `tools/call` puede devolver dos tipos de "fallo":

**Error a nivel protocolo** (el server no pudo ni intentar): response JSON-RPC con `error`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "Unknown tool: search_notes_typo"
  }
}
```

**Error a nivel ejecución** (la tool intentó pero falló, ej: "archivo no existe"): response con `result.isError: true`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "Error: file not found" }],
    "isError": true
  }
}
```

La distinción importa: **los errores de ejecución se devuelven al modelo como `tool_result` con `is_error: true`**, así Claude puede ver qué pasó y reaccionar (re-intentar, pedir clarificación al user, etc.). Los errores de protocolo son bugs del host / server — típicamente no llegan al modelo.

## Ejecución real

Una sesión real de `tools/list` contra el server oficial `@modelcontextprotocol/server-time` muestra el formato exacto. Mandar este JSON por stdin al proceso del server:

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0.0.1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Y el server responde con algo como:

```json
{"jsonrpc":"2.0","id":1,"result":{"tools":[
  {"name":"get_current_time","description":"Get current time in a specific timezone","inputSchema":{"type":"object","properties":{"timezone":{"type":"string"}},"required":["timezone"]}},
  {"name":"convert_time","description":"Convert time between timezones","inputSchema":{"type":"object","properties":{"source_timezone":{"type":"string"},"time":{"type":"string"},"target_timezone":{"type":"string"}},"required":["source_timezone","time","target_timezone"]}}
]}}
```

Dos tools, `get_current_time` y `convert_time`, que cualquier host MCP puede consumir sin saber nada del código del server.

> **Nota:** el output exacto depende de la versión del server (los servers de `modelcontextprotocol/servers` evolucionan). Verificá al correrlo en la lección 8 con `npx`. El shape general (`tools/list` → `{tools: [{name, description, inputSchema}]}`) es estable en el protocolo.

## Anti-patterns

- ❌ **Exponer tools destructivas sin confirmación en el server**. Una tool `delete_file` debería al menos pedir un flag `--confirm` o devolver preview primero. El modelo no sabe cuán peligrosa es — el diseño de la tool (y del server) sí.
- ❌ **Pasar schemas gigantes con ejemplos de 10KB en `description`**. Llegan al modelo como parte del prompt de tools — consumen tokens en cada request. Mantené descriptions concisas y usá `examples` / `$comment` del JSON Schema con mesura.
- ❌ **Retornar JSON como texto en `content`** sin avisar al modelo. Si la tool devuelve `{"rows": [...]}` en un `text` block, aclará en la description: "Returns JSON with shape {...}". Claude es mejor usando el resultado si sabe qué esperar.
- ❌ **Mezclar tools read-only con tools write en el mismo server sin prefijo**. Cuando integrás varios servers, la diferencia entre `read_x` y `write_x` se vuelve crítica. Prefijá o agrupá por capability.
- ❌ **Ignorar el tamaño del resultado**. Un `tools/call` que devuelve 500KB de texto lo come el modelo en el próximo turno. Limitá, paginá o devolvé un `resource_link` si el dato es grande.

## Recap

- Una tool MCP es **equivalente** a una tool de la Messages API — solo cambia quién la declara.
- Dos métodos: **`tools/list`** (descubrir) y **`tools/call`** (ejecutar).
- El host **traduce** entre el shape MCP (`inputSchema`) y el de Messages API (`input_schema`), y entre `tool_use` / `tools/call` en cada ciclo.
- **Dynamic discovery**: con capability `listChanged`, las tools pueden aparecer/desaparecer sin redeployar el host.
- Hay dos niveles de error: protocolo (JSON-RPC `error`) y ejecución (`result.isError: true`). Los de ejecución llegan al modelo como `tool_result` con `is_error: true`.
- El `content` de un tool result es un array de bloques tipados (`text`, `image`, etc.) — igual que en la Messages API.


## Ejercicio interactivo

<Quiz id="ex-07-01-conceptos-mcp" />

---

**Fuente oficial:** [modelcontextprotocol.io/specification/server/tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
**Ejercicio:** <!-- exercise:ex-07-01-conceptos-mcp -->
