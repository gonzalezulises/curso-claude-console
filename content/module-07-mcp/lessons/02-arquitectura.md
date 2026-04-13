# Arquitectura: host, client, server

## Objetivo

Al terminar esta lección sabrás **qué rol cumple cada actor en una conexión MCP** (host, client, server), quién habla con quién, por qué el modelo LLM **nunca** habla directo con un server MCP, y qué transportes (stdio vs HTTP) usa el protocolo en la práctica.

## Concepto

### Los tres roles

MCP define tres actores y una dirección clara de dependencias:

```
┌─────────────────────────────────────┐
│              HOST                   │
│  (la app que el usuario interactúa) │
│                                     │
│   ┌────────────┐    ┌────────────┐  │
│   │    LLM     │    │   Client   │  │
│   │  (Claude)  │◄──►│   (MCP)    │  │
│   └────────────┘    └─────┬──────┘  │
└───────────────────────────┼─────────┘
                            │ JSON-RPC 2.0
                            │ (stdio o HTTP)
                            ▼
                     ┌──────────────┐
                     │    SERVER    │
                     │   (MCP)      │
                     │              │
                     │  - tools     │
                     │  - resources │
                     │  - prompts   │
                     └──────────────┘
```

**Host**: la aplicación que el humano usa. Ejemplos: Claude Code, un backend Node que llama a `/v1/messages`, un agente managed. El host es **dueño de la relación con el modelo** y decide qué mostrarle.

**Client**: una pieza de software **dentro del host** que habla MCP con un server. Un host puede tener **varios clients activos**, uno por cada server conectado. El client se encarga de listar tools, invocarlas, leer resources, manejar reconexiones, etc.

**Server**: un proceso independiente (local o remoto) que expone primitivas (tools, resources, prompts). Puede estar escrito en cualquier lenguaje — lo único que importa es que hable MCP por el transporte acordado.

<terminology>
**Capability**: lo que cada lado declara que soporta al handshake inicial. El server declara "ofrezco tools y resources"; el client declara "soporto sampling". Esto evita romper cuando un server usa features que el client no entiende.

**Transport**: cómo viajan los mensajes. Los dos oficiales son `stdio` (proceso hijo, stdin/stdout) y `streamable-http` (HTTP con SSE para eventos server-push).

**Initialize**: el primer mensaje del handshake. El client envía `initialize` con su protocol version y sus capabilities; el server responde con las suyas. Hasta que no pase ese ida y vuelta, no se puede llamar a `tools/list` ni a nada más.
</terminology>

### Por qué el LLM no habla con el server directamente

Esto es importante: **Claude nunca envía un request JSON-RPC al server MCP**. El flujo real es:

1. El client MCP (en el host) le pregunta al server qué tools ofrece (`tools/list`).
2. El host traduce esa lista al formato que la Messages API entiende (`tools: [...]`) y lo manda a Claude.
3. Claude responde con un `tool_use` como en el Módulo 5.
4. El host detecta el `tool_use`, lo traduce a un `tools/call` MCP, y se lo manda al server.
5. El server ejecuta, devuelve el resultado al client.
6. El host se lo devuelve a Claude como `tool_result`.
7. Claude continúa generando.

El modelo vive **puro** en el mundo tool use — no aprende MCP ni sabe que existe. Esto tiene tres implicaciones importantes:

- **Seguridad**: el host puede filtrar qué tools expone al modelo, validar argumentos antes de llamar al server, auditar cada ida y vuelta.
- **Portabilidad**: el mismo server MCP sirve para Claude, GPT, Gemini o cualquier LLM cuyo host implemente MCP.
- **Composición**: un host puede orquestar N servers MCP simultáneos y agregar todas sus tools en una sola lista para el modelo.

### Transporte 1: stdio

Pensado para **servers que corren localmente** como procesos hijos del host:

- El host lanza el server con `spawn`/`Popen`, le pasa argumentos y env vars.
- Cada mensaje JSON-RPC es una línea NDJSON por stdin (client → server) o stdout (server → client).
- stderr queda libre para logs del server.
- Cerrar stdin termina la sesión.

Ideal para:
- Servers que acceden a recursos del sistema local (filesystem, git, bases de datos locales).
- Desarrollo y testing — sin networking, sin auth, sin CORS.
- Claude Code, que lanza servers locales configurados en `.claude.json` / `mcp.json`.

Ejemplo de cómo el host levanta un server oficial:

```bash
# Claude Code hace algo equivalente a esto por detrás:
npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/dir
```

El proceso se queda vivo hablando NDJSON por sus stdin/stdout hasta que el host lo cierra.

### Transporte 2: streamable-http

Pensado para **servers remotos**, accesibles por red:

- El client hace POST a una URL del server con el JSON-RPC request.
- El server responde con JSON plano o abre un stream Server-Sent Events (SSE) si necesita mandar eventos push (ej: notificación de que las tools cambiaron).
- La auth típicamente es un Bearer token en el header `Authorization`.

Ideal para:
- Servers multi-tenant (varios usuarios distintos conectándose al mismo server).
- Integraciones con SaaS (un server MCP de Slack hosteado por Slack).
- El beta **MCP Connector** de la Messages API (lección 7), que consume URLs HTTP.

<warning>
En HTTP con auth, el host NO debe inyectar credenciales del servidor directamente en el prompt del modelo. La auth vive en el transporte. El modelo solo ve los resultados de las tools.
</warning>

### Un host, varios servers

Es completamente normal — y la situación típica de Claude Code — tener **un host con múltiples clients activos**, cada uno apuntando a un server distinto:

```
Claude Code
├── client A ──► server filesystem (stdio)
├── client B ──► server fetch (stdio)
├── client C ──► server github (streamable-http)
└── client D ──► server custom-notes (stdio)
```

Cada server declara sus tools. Cuando el host llama al modelo, **concatena** todas las tools de todos los servers en un único `tools: [...]`. Cuando el modelo responde con un `tool_use`, el host mira de qué server vino ese tool y lo routea.

Una consecuencia práctica: **evitá nombres de tools colisionando** entre servers. Si dos servers tienen un `read_file`, el host tiene que desambiguar (algunos usan prefijo `server-name__read_file`).

### Handshake: initialize

Antes de cualquier otra llamada, client y server hacen un ida y vuelta:

```json
// client → server
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "sampling": {},
      "roots": { "listChanged": true }
    },
    "clientInfo": { "name": "claude-code", "version": "1.x" }
  }
}
```

```json
// server → client
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": {},
      "prompts": {}
    },
    "serverInfo": { "name": "filesystem", "version": "0.6.0" }
  }
}
```

Solo después de este handshake el client puede llamar `tools/list`, `resources/list`, etc.

## Ejecución real

Una forma rápida de **ver** el handshake en vivo: lanzar un server MCP oficial con `npx` y hablarle a mano por stdin. Este es el tipo de ejercicio que hacés en la lección 8, pero podemos adelantar el olor:

```bash
# Lanzar el server filesystem en una terminal
npx -y @modelcontextprotocol/server-filesystem /tmp
```

Desde otra herramienta (o un script), el client manda primero `initialize`, luego `notifications/initialized`, y recién después puede pedir `tools/list`. La spec formaliza el orden exacto.

> **Nota:** no pegamos aquí la sesión stdio cruda porque el intercambio exacto byte-a-byte lo cubrimos en la lección 8 con herramientas. Lo que importa ahora es la forma: **tres roles, un handshake, mensajes JSON-RPC 2.0 sobre un transporte**.

## Anti-patterns

- ❌ **Hacer que el modelo "sepa" de MCP**. No le expliques en el system prompt "tenés un server MCP disponible". El modelo ve tools comunes; MCP es infraestructura del host.
- ❌ **Levantar un server stdio que hace logs a stdout**. stdout es el canal de protocolo. Cualquier `console.log` en el server se parsea como JSON-RPC roto. Usá **stderr** para logs.
- ❌ **Confundir "server MCP remoto" con "server serverless"**. Un server streamable-http debe mantener estado de sesión mientras dure el handshake; un Lambda con cold-start cada request rompe la semántica. Existen implementaciones stateless, pero requieren cuidado.
- ❌ **Asumir que cambiar el `protocolVersion` es transparente**. La spec evoluciona. Si actualizás el SDK, revisá el changelog — hubo breaks entre versiones (por ejemplo el movimiento de `.tool()` a `.registerTool()`).
- ❌ **Hablar con el server "directamente" desde el LLM**. Aun si el server corre en tu backend, el flujo siempre es LLM → Host → Client → Server. Si rompés esta cadena, perdés el modelo de permisos.

## Recap

- **Host**: la app (Claude Code, backend, Managed Agent). **Client**: pieza dentro del host que habla MCP. **Server**: proceso que expone primitivas.
- El LLM **nunca** habla con el server — habla con el host vía tool use y el host traduce.
- Dos transportes estándar: **stdio** (proceso local) y **streamable-http** (remoto con SSE opcional).
- Un host puede tener **varios clients** conectados a varios servers simultáneamente; el host agrega las tools en una lista única para el modelo.
- Toda conexión arranca con un **handshake `initialize`** que declara `protocolVersion` y `capabilities` de ambos lados.
- En stdio, **stdout es protocolo** — logs van a stderr.

---

**Fuente oficial:** [modelcontextprotocol.io/specification/architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
**Ejercicio:** <!-- exercise:ex-07-01-conceptos-mcp -->
