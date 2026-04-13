# Conectarse a un server MCP existente

## Objetivo

Al terminar esta lección sabrás **levantar y consumir un server MCP oficial** (filesystem, fetch, time, everything) desde la línea de comandos con `npx`, ejecutar el handshake `initialize` → `notifications/initialized` → `tools/list` a mano para entender el wire protocol, y usar esos servers desde Claude Code.

## Concepto

### El repo `modelcontextprotocol/servers`

Anthropic mantiene un monorepo con servers MCP de referencia:

- **`@modelcontextprotocol/server-filesystem`** — lee/escribe archivos dentro de un directorio permitido.
- **`@modelcontextprotocol/server-fetch`** — hace HTTP requests.
- **`@modelcontextprotocol/server-time`** — tools de manejo de fecha/hora y timezones.
- **`@modelcontextprotocol/server-everything`** — server "kitchen sink" que demuestra **todas** las primitivas del protocolo. Útil para aprender.
- Y varios más (git, memory, sequentialthinking).

Todos se levantan con `npx` sin instalación previa:

```bash
npx -y @modelcontextprotocol/server-filesystem /ruta/permitida
```

La flag `-y` le dice a npx "descargá si hace falta, sin preguntar". Los servers TypeScript del repo corren sobre Node; los Python usan `uv`. Revisá el README del server específico al integrarlo.

<terminology>

**stdio transport**: estos servers usan stdin/stdout para hablar JSON-RPC. Cada mensaje va en **una línea** (NDJSON). stderr queda libre para logs del server.

**Allowed directory**: el server `filesystem` pide un directorio como argumento. Todas las operaciones se limitan a ese scope — cualquier path afuera devuelve "Access denied".

**Normalización de paths**: en macOS, `/tmp` es symlink a `/private/tmp`. El server resuelve el symlink al validar. Si al server le diste `/private/tmp/x`, pedirle que lea `/tmp/x` falla. Usá siempre el path resuelto.

</terminology>

### Handshake a mano: tres mensajes

El mínimo indispensable para empezar a hablar con un server MCP por stdio son tres líneas JSON-RPC:

1. **`initialize`** — handshake inicial del client. Declara `protocolVersion` y capabilities.
2. **`notifications/initialized`** — notification (sin `id`, sin response esperada) que le dice al server "listo, arrancá".
3. **Primera llamada real** — `tools/list`, `resources/list`, etc.

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0.1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Cada línea se envía por stdin del proceso server. El server responde por stdout.

### Usar los servers oficiales desde Claude Code

Claude Code configura servers MCP via `~/.claude.json` (o `.claude.json` en el repo) en la sección `mcpServers`. Un entry típico:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents/GitHub"]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

Claude Code lanza cada server al arrancar, hace el handshake, y expone las tools al modelo. El user no ve JSON-RPC — ve "tengo disponibles `read_text_file`, `write_file`, etc.".

### Diferencia con MCP Connector

Esto es importante para no confundirse con la lección 7:

| | MCP Connector (lección 7) | Cliente local (esta lección) |
|-----------|---------------------------|------------------------------|
| Transporte | HTTP (`streamable-http`) | **stdio** |
| Quién es host | La API de Anthropic | Tu proceso (Claude Code o tu script) |
| Server corre en | Internet, accesible a Anthropic | Localhost, tu máquina |
| Ejemplo de servers | DeepWiki, SaaS remoto | `@modelcontextprotocol/server-filesystem` |
| Beta header | `mcp-client-2025-04-04` | No aplica — no hay API Anthropic involucrada |

Para servers locales, el flujo `/v1/messages` con `mcp_servers` no aplica — ese parámetro solo acepta URLs HTTP accesibles desde la infra de Anthropic. Para consumirlos vía Messages API, necesitás **tu propio client MCP** (lo vemos en la lección 9 cuando construyamos un server propio).

### El server `everything`: referencia de features

`@modelcontextprotocol/server-everything` es el más útil para aprender porque **implementa todas las primitivas** y declara todas las capabilities. Al conectarte ves:

```json
{
  "capabilities": {
    "tools": {"listChanged": true},
    "prompts": {"listChanged": true},
    "resources": {"subscribe": true, "listChanged": true},
    "logging": {},
    "completions": {}
  },
  "serverInfo": {"name": "mcp-servers/everything", "version": "2.0.0"}
}
```

Y entre sus tools figura desde `echo` y `get-sum` (obviamente didácticas) hasta `trigger-sampling-request` y `trigger-elicitation-request` (para que pruebes las capabilities inversas del Módulo 6). Es un terreno seguro para experimentar con cada feature antes de encararlas en producción.

## Ejecución real

### 1. Handshake manual contra `server-filesystem`

Creá un archivo de prueba:

```bash
mkdir -p /private/tmp/mcp-demo
echo "hello from mcp demo" > /private/tmp/mcp-demo/note.txt
```

Armá un script que hable stdio con el server:

```bash
cat > /tmp/mcp-fs-test.sh <<'EOF'
#!/bin/bash
{
  printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0.1"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_text_file","arguments":{"path":"/private/tmp/mcp-demo/note.txt"}}}'
  sleep 3
} | npx -y @modelcontextprotocol/server-filesystem /private/tmp/mcp-demo 2>/dev/null
EOF
chmod +x /tmp/mcp-fs-test.sh
```

Ejecutá y filtrá la respuesta al `tools/call` (id=2):

```bash
/tmp/mcp-fs-test.sh | python3 -c '
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: m = json.loads(line)
    except: continue
    if m.get("id") == 2:
        print(json.dumps(m, indent=2))
'
```

Output real (ejecutado 2026-04-12 con `@modelcontextprotocol/server-filesystem@0.2.0`):

```json
{
  "result": {
    "content": [
      { "type": "text", "text": "hello from mcp demo\n" }
    ],
    "structuredContent": {
      "content": "hello from mcp demo\n"
    }
  },
  "jsonrpc": "2.0",
  "id": 2
}
```

El server respetó el scope (`/private/tmp/mcp-demo`), leyó el archivo, devolvió el texto. `structuredContent` es opcional — la spec moderna la agregó para respuestas tipadas acorde al `outputSchema` de la tool.

> **Nota:** si probás con `/tmp/...` en lugar de `/private/tmp/...`, recibís `isError: true` con mensaje "Access denied - path outside allowed directories". Es la normalización de symlinks de macOS. Usá siempre el path resuelto.

### 2. `server-everything` para ver capabilities completas

```bash
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0.1"}}}' | \
  npx -y @modelcontextprotocol/server-everything stdio 2>/dev/null
```

Respuesta (abreviada):

```json
{
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {"listChanged": true},
      "prompts": {"listChanged": true},
      "resources": {"subscribe": true, "listChanged": true},
      "logging": {},
      "completions": {}
    },
    "serverInfo": {"name": "mcp-servers/everything", "title": "Everything Reference Server", "version": "2.0.0"}
  }
}
```

Las capabilities del server están acá — todo lo que podés invocar. Si una capability no aparece, el método correspondiente (`resources/list`, `prompts/list`) devolvería error.

### 3. Configurar en Claude Code

En `~/.claude.json` (o `.claude.json` del proyecto):

```json
{
  "mcpServers": {
    "fs-demo": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/private/tmp/mcp-demo"]
    }
  }
}
```

Reiniciá Claude Code. Al arrancar, el proceso del server se levanta automáticamente; las tools (`read_text_file`, `write_file`, etc.) están disponibles para que Claude las invoque cuando le pidas tareas de filesystem en ese directorio.

## Anti-patterns

- ❌ **Levantar `server-filesystem` con `/` o `$HOME` como directorio permitido**. Le das al modelo acceso a todo tu FS. Scopeá al mínimo necesario (un directorio de proyecto, un staging dir).
- ❌ **Dejar el server mostrando logs en stdout**. Cualquier `console.log` del server rompe el canal JSON-RPC. El repo `modelcontextprotocol/servers` respeta esto por default — si escribís uno custom, usá stderr para logs.
- ❌ **Confundir stdio con MCP Connector**. Los servers de este repo corren **locales**; no podés pasarlos como `mcp_servers` de la Messages API sin armar un wrapper HTTP.
- ❌ **Compartir tu `.claude.json` con servers privados configurados**. Si el server usa env vars con tokens (ej: `GITHUB_TOKEN`), esos env vars van en la config. Usá `.claude.json` **fuera** del repo si tiene secretos, o usá placeholders y un `.env`.
- ❌ **Invocar un server desactualizado**. El repo oficial evoluciona; versiones viejas pueden usar `protocolVersion` anterior y romper con clients nuevos. Pinear versiones exactas en `args` (ej: `@modelcontextprotocol/server-filesystem@0.2.0`) es prudente en producción.
- ❌ **Olvidar `notifications/initialized`**. Sin esa notification, el server puede rechazar las llamadas subsiguientes o quedarse esperando. Es parte del handshake — obligatoria.

## Recap

- El repo oficial `modelcontextprotocol/servers` trae servers listos (`filesystem`, `fetch`, `time`, `everything`, `git`, `memory`, etc.).
- Se levantan con **`npx -y @modelcontextprotocol/server-...`** sin instalación previa.
- Hablan **stdio**: una línea NDJSON por mensaje JSON-RPC. stdin = client→server, stdout = server→client, stderr = logs.
- Handshake mínimo: `initialize` → `notifications/initialized` → tu primera llamada.
- En **Claude Code** se configuran en `.claude.json` bajo `mcpServers: { name: { command, args } }`.
- Servers locales **no** son consumibles via MCP Connector de la Messages API — ese requiere URLs HTTP.
- Usá **`server-everything`** para explorar capabilities que no viste en producción (sampling, elicitation, logging).

---

**Fuente oficial:** [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) y [modelcontextprotocol.io/docs](https://modelcontextprotocol.io/docs)
**Ejercicio:** <!-- exercise:ex-07-02-conectar-server-existente -->
