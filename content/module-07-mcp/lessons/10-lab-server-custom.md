# Lab: server MCP custom integrado a un agente

## Objetivo

Al terminar este lab vas a tener **un server MCP completo**, construido por vos, con **3 tools sobre un dominio** que elijas, corriendo localmente, y **consumido desde Claude Code** y desde un script Node que habla con el server via el SDK como client. Este lab ata todo lo del módulo: `registerTool`, persistencia simple, transporte stdio, integración real con un agente.

## Concepto

### Qué vas a construir

Un server MCP llamado `tasks-server` con tres tools:

1. **`create_task`** — crea una task con título, descripción y un tag opcional. Persistida en un archivo JSON local.
2. **`list_tasks`** — lista todas las tasks, con filtro opcional por tag.
3. **`complete_task`** — marca una task como completada por id.

Dominio genérico pensado para que lo adaptes a tu caso real. Las ideas de intercambio: notas, bookmarks, contactos, tickets, pacientes, productos — cualquier CRUD sobre entidades persistidas.

### Entregables del lab

Al final tenés que tener:

- [ ] `tasks-server.ts` con las 3 tools registradas.
- [ ] Persistencia en `tasks.json` (no solo memoria — el server reinicia y los datos siguen).
- [ ] Configuración en `.claude.json` para que Claude Code lo levante.
- [ ] Un script `client.ts` que usa el SDK como **client** MCP, conecta al server, lista tools y llama a una.
- [ ] Verificación: creás 2 tasks desde Claude Code, cerrás todo, abrís de nuevo, las tasks siguen ahí.

### Por qué un client en Node también

En el Módulo viste tres formas de consumir un server MCP:

1. Desde Claude Code (host ya construido).
2. Desde la Messages API vía MCP Connector (pero solo servers HTTP remotos).
3. **Desde tu propio código como client MCP** — que es lo que hace falta para servers stdio locales que quieras integrar a un backend.

El punto (3) es el que no cubrimos en profundidad antes. Este lab te obliga a hacerlo usando la clase `Client` del mismo SDK.

### Arquitectura del lab

```
┌────────────────┐     stdio     ┌────────────────┐
│  Claude Code   │◄──────────────┤  tasks-server  │
│    (host)      │               │   (Node, tsx)  │
└────────────────┘               │                │
                                 │  tasks.json    │
                                 │   (persist)    │
┌────────────────┐     stdio     │                │
│  client.ts     │◄──────────────┤                │
│  (tu código)   │               └────────────────┘
└────────────────┘
```

El mismo proceso server puede ser consumido por ambos clients (no a la vez — stdio es un canal; si abrís dos, hay que lanzar dos procesos).

## Ejecución real

### Paso 1 — Scaffolding

```bash
mkdir -p ~/mcp-tasks-lab && cd ~/mcp-tasks-lab
npm init -y
npm install @modelcontextprotocol/sdk@^1.29 zod tsx typescript
node -e 'let p=require("./package.json"); p.type="module"; require("fs").writeFileSync("package.json", JSON.stringify(p, null, 2));'
```

### Paso 2 — `tasks-server.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DB_PATH = path.join(process.cwd(), "tasks.json");

type Task = {
  id: string;
  title: string;
  description: string;
  tag: string | null;
  completed: boolean;
  createdAt: string;
};

async function loadDb(): Promise<Task[]> {
  try {
    const raw = await readFile(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveDb(tasks: Task[]): Promise<void> {
  await writeFile(DB_PATH, JSON.stringify(tasks, null, 2), "utf-8");
}

const server = new McpServer({
  name: "tasks-server",
  version: "0.1.0",
});

server.registerTool(
  "create_task",
  {
    description: "Create a new task. Returns the created task id.",
    inputSchema: {
      title:       z.string().min(1),
      description: z.string().default(""),
      tag:         z.string().nullable().default(null),
    },
  },
  async ({ title, description, tag }) => {
    const tasks = await loadDb();
    const task: Task = {
      id: randomUUID().slice(0, 8),
      title,
      description,
      tag,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    tasks.push(task);
    await saveDb(tasks);
    return {
      content: [{ type: "text", text: `Created task ${task.id}: "${title}"` }],
    };
  }
);

server.registerTool(
  "list_tasks",
  {
    description: "List all tasks. Optional: filter by tag, filter by completed status.",
    inputSchema: {
      tag:              z.string().nullable().default(null),
      only_pending:     z.boolean().default(false),
    },
  },
  async ({ tag, only_pending }) => {
    const tasks = await loadDb();
    const filtered = tasks.filter(t =>
      (tag === null || t.tag === tag) &&
      (!only_pending || !t.completed)
    );
    if (filtered.length === 0) {
      return { content: [{ type: "text", text: "(no tasks match)" }] };
    }
    const lines = filtered.map(t =>
      `${t.completed ? "[x]" : "[ ]"} ${t.id} | ${t.title}${t.tag ? ` #${t.tag}` : ""}`
    );
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.registerTool(
  "complete_task",
  {
    description: "Mark a task as completed by its id.",
    inputSchema: {
      id: z.string(),
    },
    annotations: { idempotentHint: true },
  },
  async ({ id }) => {
    const tasks = await loadDb();
    const task = tasks.find(t => t.id === id);
    if (!task) {
      return {
        content: [{ type: "text", text: `No task with id ${id}` }],
        isError: true,
      };
    }
    task.completed = true;
    await saveDb(tasks);
    return {
      content: [{ type: "text", text: `Completed task ${id}: "${task.title}"` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`tasks-server running on stdio (db: ${DB_PATH})`);
```

### Paso 3 — Probar el handshake a mano

```bash
{
  echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0.1"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_task","arguments":{"title":"Write M07 lab","description":"Finish the MCP module","tag":"course"}}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tasks","arguments":{}}}'
  sleep 2
} | npx tsx tasks-server.ts 2>/dev/null
```

Deberías ver tres tools listadas, una task creada, y luego el listado con `[ ] xxxxxx | Write M07 lab #course`. Abrí `tasks.json` — la task está persistida.

### Paso 4 — Client MCP en Node (`client.ts`)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "tasks-server.ts"],
});

const client = new Client({ name: "demo-client", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("Available tools:", tools.map(t => t.name).join(", "));

const result = await client.callTool({
  name: "create_task",
  arguments: { title: "From client.ts", description: "hi from Node client", tag: "demo" },
});

console.log("Result:", JSON.stringify(result, null, 2));

await client.close();
```

```bash
npx tsx client.ts
```

Output esperado:
```
Available tools: create_task, list_tasks, complete_task
Result: {
  "content": [{ "type": "text", "text": "Created task abc123: \"From client.ts\"" }]
}
```

### Paso 5 — Conectar a Claude Code

En `~/.claude.json`:

```json
{
  "mcpServers": {
    "tasks": {
      "command": "npx",
      "args": ["tsx", "/Users/TU_USUARIO/mcp-tasks-lab/tasks-server.ts"]
    }
  }
}
```

Reiniciá Claude Code. Probá prompts como:

- "Creame 3 tasks sobre aprender MCP, con tag 'learning'"
- "Lista las tasks pending"
- "Marcá completada la task xxxxxxx"

Claude invoca las tools; el server persiste en `tasks.json`.

### Paso 6 — Verificación de persistencia

1. Creá 2 tasks desde Claude Code.
2. Cerrá Claude Code.
3. `cat tasks.json` — las tasks están ahí.
4. Abrí Claude Code de nuevo, pedile "listá las tasks".
5. Aparecen las mismas que creaste antes.

Sin esto no pasa el gate del lab.

### (Opcional) Paso 7 — Exponer via MCP Connector

Si querés seguir hasta integrar con la Messages API, tenés dos caminos:

- **Migrar a HTTP transport** (`StreamableHTTPServerTransport`), deployar a un host accesible (fly.io, Render, tu propio VPS), y pasar la URL como `mcp_servers` del beta `mcp-client-2025-04-04`.
- **Escribir un wrapper** que corra tu server stdio localmente y actúe como proxy HTTP (más complejo; típicamente no vale la pena).

Este paso no es obligatorio para cerrar el lab — pero es la última pieza para que tu server funcione desde los tres hosts del ecosistema Claude.

## Anti-patterns

- ❌ **Guardar tasks en memoria y no persistir**. Al cerrar Claude Code, el proceso server muere. Sin persistencia, perdés todo. JSON en disco es suficiente para este lab; en prod, elegí una DB.
- ❌ **Hacer `writeFile` sin lock / concurrencia**. Si tenés dos clients escribiendo en paralelo, hay race condition. Para este lab es aceptable; en prod usá una DB real o un file lock explícito.
- ❌ **Logs con `console.log`**. Se parsean como JSON-RPC roto y el transport rompe. Todo log del server va a **stderr**.
- ❌ **Paths relativos sin saber de dónde se lanzó el server**. `DB_PATH = "./tasks.json"` depende del cwd del proceso. Si Claude Code lanza el server desde otro directorio, escribís en un lugar inesperado. Usá `process.cwd()` explícito o path absoluto.
- ❌ **Descriptions genéricas**. Si `create_task` dice "creates something", el modelo duda cuándo llamarlo. Describí el **efecto observable** y el **retorno**.

## Recap

- Construiste un server MCP real con **3 tools CRUD** y persistencia en disco.
- Lo conectaste a **Claude Code** (host built-in) y a un **client propio** usando el SDK (`@modelcontextprotocol/sdk/client`).
- Entendiste el ciclo completo: tu código define tools → SDK las serializa a JSON Schema → host las muestra al modelo → modelo las invoca → SDK parsea args con Zod → tu handler ejecuta → response vuelve al host → modelo responde al user.
- Viste por qué **stderr para logs** y **type:module** son obligatorios.
- El server es reutilizable: la misma implementación sirve para Claude Code, para un backend que instancie el `Client`, y (con cambio de transport) para la Messages API vía MCP Connector.

Esto cierra el Módulo 7. En el Módulo 8 vamos a ver **Skills** — la otra forma que Anthropic ofrece para empaquetar capacidades reutilizables.

---

**Fuente oficial:** [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) y [modelcontextprotocol.io/quickstart/server](https://modelcontextprotocol.io/quickstart/server)
**Ejercicio:** <!-- exercise:ex-07-07-lab-custom-server -->
