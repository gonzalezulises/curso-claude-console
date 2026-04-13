# Construir un server MCP propio (TS SDK)

## Objetivo

Al terminar esta lección sabrás **construir un server MCP funcional en TypeScript desde cero** usando `@modelcontextprotocol/sdk`: crear el `McpServer`, registrar tools con `registerTool` + schemas Zod, conectar `StdioServerTransport`, y probarlo manualmente mandando JSON-RPC por stdin. Saldrás con un server que expone 2 tools reales y responde como los servers oficiales del Módulo 8.

## Concepto

### El SDK oficial: `@modelcontextprotocol/sdk`

El package canónico para construir servers MCP en TypeScript es **`@modelcontextprotocol/sdk`** (versión 1.x estable al momento de escribir — 1.29.0 el 2026-04-12). Cubre cliente, servidor y los transportes oficiales.

```bash
npm install @modelcontextprotocol/sdk zod
```

Existe también un package `@modelcontextprotocol/server` en 2.x alpha que reempaqueta la API de server con Standard Schema y un naming más limpio. En producción, hasta que 2.x salga estable, **usá 1.x**.

<terminology>
**High-level API**: `McpServer`. Abstrae el manejo de mensajes JSON-RPC, el handshake, el routing. Vos solo registrás tools, resources y prompts con handlers. Es lo que vas a usar el 95% del tiempo.

**Low-level API**: `Server` (sin "Mcp"). Da acceso directo a los handlers de cada método JSON-RPC. Útil si necesitás comportamiento raro o composición avanzada. Fuera de scope de esta lección.

**Transport**: clase que maneja el wire. El SDK trae `StdioServerTransport` (stdio) y `StreamableHTTPServerTransport` (HTTP). Vos le das una al server y el server la usa para hablar.
</terminology>

### Anatomía de un server mínimo

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "notes-server",
  version: "0.1.0",
});

server.registerTool(
  "create_note",
  {
    description: "Create a note with a title and body",
    inputSchema: {
      title: z.string().describe("Short title"),
      body:  z.string().describe("Full note body"),
    },
  },
  async ({ title, body }) => {
    // Tu lógica acá
    return {
      content: [{ type: "text", text: `Saved note "${title}" (${body.length} chars)` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("notes-server running on stdio");
```

Cinco puntos críticos:

1. **Imports con `.js`** aunque sean archivos TypeScript. El SDK usa ESM y los specifiers requieren la extensión resuelta (`.js`, no `.ts`).
2. **`package.json` con `"type": "module"`**. Sin esto, los `.ts` se transpilan a CJS y fallan con "Top-level await is not supported".
3. **`inputSchema` acepta un shape object** (claves con validators Zod), no un `z.object({...})`. El SDK lo envuelve por vos.
4. **El handler es async** y recibe los argumentos ya **parseados y tipados** por Zod. Si el input no valida, el SDK responde con error JSON-RPC sin llegar al handler.
5. **Logs a `stderr`** (`console.error`), nunca a `stdout`. stdout es el canal de protocolo.

### `registerTool` vs `tool` (legacy)

En el SDK v1 conviven dos formas de registrar tools:

- `server.tool(name, shape, handler)` — firma "clásica", sin config object.
- `server.registerTool(name, config, handler)` — firma moderna con `description`, `inputSchema`, `outputSchema`, `annotations`. **Es la recomendada**.

Usá `registerTool` siempre:

```typescript
server.registerTool(
  "calculate_bmi",
  {
    description: "Calculate BMI from weight and height",
    inputSchema: {
      weightKg: z.number(),
      heightM:  z.number(),
    },
    outputSchema: {
      bmi: z.number(),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async ({ weightKg, heightM }) => {
    const bmi = weightKg / (heightM * heightM);
    return {
      content: [{ type: "text", text: `BMI: ${bmi.toFixed(2)}` }],
      structuredContent: { bmi: Number(bmi.toFixed(2)) },
    };
  }
);
```

Cuando registrás `outputSchema`, podés devolver `structuredContent` tipado — el client puede validarlo y exponerlo como JSON estructurado sin parsear el texto.

### Registrar resources

El API análogo para resources es `registerResource`. Dos formas: URI fija o template:

```typescript
server.registerResource(
  "config",
  "config://app",                                 // URI fija
  { title: "App Config", mimeType: "application/json" },
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify({ version: "0.1" }) }],
  })
);

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

server.registerResource(
  "note",
  new ResourceTemplate("note://{title}", { list: undefined }),
  { title: "Note", mimeType: "text/plain" },
  async (uri, { title }) => ({
    contents: [{ uri: uri.href, text: `Content of note ${title}` }],
  })
);
```

La template `note://{title}` deja que el client pida `resources/read` con URIs concretas (`note://groceries`, `note://meeting-notes`) y el server rellena.

### Annotations útiles

Las `annotations` son hints — metadata para que el host decida cómo mostrar una tool:

| Annotation | Uso |
|------------|-----|
| `readOnlyHint: true` | Tool que no muta estado. Host puede auto-aprobar. |
| `destructiveHint: true` | Tool que borra/sobrescribe. Host pide confirmación. |
| `idempotentHint: true` | Llamarla N veces con mismo input = mismo resultado. |
| `openWorldHint: true` | Tool con side effects no determinísticos (web). |

No son enforcement — son guías. El servidor igual ejecuta lo que le pidan. El valor está en que el **host** las use para UX y safety.

### Stdio vs HTTP

Para servers locales (Claude Code, scripts), `StdioServerTransport` es la opción default. Para exponer tu server como URL (MCP Connector, deploy remoto), hay `StreamableHTTPServerTransport`:

```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000);
```

Esto lo retomamos en el ejercicio `ex-07-06-transport-http`. Para el lab y la mayoría de los casos de aprendizaje, stdio alcanza.

### Seguridad: el server corre con los permisos del proceso

Un server MCP con `StdioServerTransport` es un proceso normal de Node — tiene los permisos de quien lo lanzó. Si tu server hace `fs.readFile("/etc/passwd")` en un handler, lo puede leer.

Tres reglas:

1. **Validá paths del user** — no ejecutes `readFile(args.path)` sin chequear que caiga dentro de tu scope permitido (revisá cómo lo hace `server-filesystem`).
2. **Sanitizá comandos externos** — nunca `exec(userInput)` sin escaping.
3. **Tokens / secrets** — si el server llama APIs autenticadas, lee los tokens de env vars (`process.env.GITHUB_TOKEN`), no los recibas por argumento del client.

## Ejecución real

### 1. Proyecto mínimo

```bash
mkdir -p /tmp/mcp-custom && cd /tmp/mcp-custom
npm init -y
npm install @modelcontextprotocol/sdk@1.29.0 zod tsx typescript
# marcá el paquete como ESM
node -e 'let p=require("./package.json"); p.type="module"; require("fs").writeFileSync("package.json", JSON.stringify(p, null, 2));'
```

### 2. `server.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "notes-server",
  version: "0.1.0",
});

const notes = new Map<string, string>();

server.registerTool(
  "create_note",
  {
    description: "Create a note with a title and body",
    inputSchema: {
      title: z.string().describe("Short title"),
      body:  z.string().describe("Full note body"),
    },
  },
  async ({ title, body }) => {
    notes.set(title, body);
    return {
      content: [{ type: "text", text: `Saved note "${title}" (${body.length} chars)` }],
    };
  }
);

server.registerTool(
  "list_notes",
  {
    description: "List all saved note titles",
    inputSchema: {},
  },
  async () => {
    const titles = Array.from(notes.keys());
    return {
      content: [{ type: "text", text: titles.length ? titles.join("\n") : "(no notes yet)" }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("notes-server running on stdio");
```

### 3. Probarlo por stdio

```bash
{
  echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0.1"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_note","arguments":{"title":"mcp-is-cool","body":"Building my first MCP server."}}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_notes","arguments":{}}}'
  sleep 2
} | npx tsx server.ts 2>/dev/null
```

Output real (ejecutado 2026-04-12 con `@modelcontextprotocol/sdk@1.29.0`):

**Initialize**:
```json
{"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"notes-server","version":"0.1.0"}},"jsonrpc":"2.0","id":0}
```

**tools/list** (nuestras dos tools con `inputSchema` convertido de Zod a JSON Schema):
```json
{
  "result":{
    "tools":[
      {
        "name":"create_note",
        "description":"Create a note with a title and body",
        "inputSchema":{
          "$schema":"http://json-schema.org/draft-07/schema#",
          "type":"object",
          "properties":{
            "title":{"type":"string","description":"Short title"},
            "body": {"type":"string","description":"Full note body"}
          },
          "required":["title","body"]
        }
      },
      {
        "name":"list_notes",
        "description":"List all saved note titles",
        "inputSchema":{
          "$schema":"http://json-schema.org/draft-07/schema#",
          "type":"object",
          "properties":{}
        }
      }
    ]
  },
  "jsonrpc":"2.0","id":1
}
```

**tools/call create_note**:
```json
{"result":{"content":[{"type":"text","text":"Saved note \"mcp-is-cool\" (29 chars)"}]},"jsonrpc":"2.0","id":2}
```

**tools/call list_notes**:
```json
{"result":{"content":[{"type":"text","text":"mcp-is-cool"}]},"jsonrpc":"2.0","id":3}
```

Y por stderr:
```
notes-server running on stdio
```

El server corrió, hizo el handshake, expuso tools, ejecutó dos calls, devolvió resultados. El Zod shape se transformó automáticamente a JSON Schema al serializar `tools/list`.

### 4. Conectarlo a Claude Code

En `.claude.json`:

```json
{
  "mcpServers": {
    "notes": {
      "command": "npx",
      "args": ["tsx", "/tmp/mcp-custom/server.ts"]
    }
  }
}
```

Reiniciá Claude Code. Pedile "creá una nota titulada 'meeting' con el body 'standup de lunes'" — el modelo invoca `create_note` y el server (tu proceso local) responde. `list_notes` te devuelve el título que acabás de crear.

## Anti-patterns

- ❌ **Importar sin extensión `.js`**. `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"` falla. En ESM las rutas necesitan la extensión resuelta — siempre `.js`, incluso en archivos `.ts`.
- ❌ **`console.log` en un handler**. Rompe el canal stdout. Usá `console.error` para logs. Si necesitás logging estructurado, el protocolo tiene `notifications/message` (capability `logging`).
- ❌ **Guardar estado global sin pensar en reinicios**. Si tu server muere, la data en memoria se pierde. Para persistencia real, escribí a disco o a una DB al procesar cada write.
- ❌ **Tools sin `description` o con descriptions vagas**. El modelo las lee para decidir cuándo llamarlas. `description: "do stuff"` es inútil; `description: "Create a note. Returns confirmation with char count."` guía al modelo.
- ❌ **Exponer tools con efectos destructivos sin annotations**. Marcá `destructiveHint: true` en `delete_note`. Hosts bien diseñados piden confirmación humana para esas.
- ❌ **Validar con `any`**. Zod es el punto del SDK — si pusieras `inputSchema: { title: z.any() }`, perdés todo el type safety y el handler recibe `unknown`.

## Recap

- El SDK oficial TypeScript es **`@modelcontextprotocol/sdk`** (v1.x estable). El package `@modelcontextprotocol/server` (v2 alpha) reempaqueta la misma API — quedate en 1.x hasta que 2.x sea estable.
- Clase principal: **`McpServer`**. API recomendada: **`registerTool(name, config, handler)`** con `description`, `inputSchema` (shape Zod), opcionales `outputSchema`, `annotations`.
- `inputSchema` acepta el **shape** (keys Zod), no un `z.object()` envolviendo.
- Transporte por default: **`StdioServerTransport`**. HTTP via `StreamableHTTPServerTransport` para remoto.
- **package.json** necesita `"type": "module"` y los imports llevan `.js`.
- **Logs siempre a stderr** — stdout es el canal de protocolo.
- Anotaciones (`readOnlyHint`, `destructiveHint`, etc.) son hints para el host, no enforcement — el server igual ejecuta.

---

**Fuente oficial:** [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
**Ejercicio:** <!-- exercise:ex-07-04-server-basico -->
