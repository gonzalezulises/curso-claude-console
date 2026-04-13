# ¿Qué es MCP y por qué existe?

## Objetivo

Al terminar esta lección entenderás **qué es Model Context Protocol (MCP)**, qué problema resuelve respecto del tool use "artesanal" del Módulo 5, por qué Anthropic lo publicó como estándar abierto, y cuándo tiene sentido usarlo en lugar de definir tools directamente en cada request a `/v1/messages`.

## Concepto

### El problema: cada integración se reescribe desde cero

En el Módulo 5 definiste tools como arrays JSON en el request:

```json
{
  "tools": [
    { "name": "get_weather", "description": "...", "input_schema": {...} },
    { "name": "query_db",    "description": "...", "input_schema": {...} }
  ]
}
```

Esto funciona, pero escala mal. Imaginá el mismo agente consumido desde tres lugares distintos:

1. Un backend Node que llama a `/v1/messages` directamente.
2. Claude Code, corriendo en la terminal del dev.
3. Un agente managed corriendo en la infra de Anthropic.

Con tool use artesanal, **las definiciones de tools se duplican en los tres lados**. Si cambiás el schema de `query_db`, hay que actualizar tres clientes. Si agregás un cuarto consumidor (un asistente en Slack, por ejemplo), volvés a copiar el mismo código.

Peor: cada integración con un servicio externo (GitHub, Jira, un CRM, una base de datos) es una pieza de código nueva que alguien tiene que escribir, mantener y documentar. No hay un **contrato compartido**.

### La solución: un protocolo estándar para exponer capacidades

**Model Context Protocol (MCP)** es un estándar abierto que define un protocolo JSON-RPC 2.0 para que cualquier cliente LLM pueda conectarse a cualquier servidor de capacidades, independientemente de quién los construyó.

La analogía útil es **LSP (Language Server Protocol)** en el mundo de los editores:

- Antes de LSP, cada editor (VSCode, Vim, Emacs, Sublime) implementaba su propio soporte de lenguaje. Agregar Rust a Vim era un proyecto distinto de agregar Rust a VSCode.
- Con LSP, el equipo de Rust escribe **un solo server LSP**, y cualquier editor que hable LSP obtiene Rust gratis.

MCP hace lo mismo para agentes LLM:

- El equipo que mantiene Postgres escribe **un server MCP para Postgres**.
- Claude Code, Claude en Messages API, Managed Agents, y cualquier otro host que hable MCP pueden consumir ese server sin código adicional.

<terminology>

**Protocolo**: un contrato de mensajes. MCP define request/response shapes, nombres de métodos, y semántica. No es un SDK — es una especificación.

**JSON-RPC 2.0**: el transporte subyacente. Mensajes con `jsonrpc: "2.0"`, `method`, `params`, `id`. Funciona sobre stdio (proceso local) o HTTP (remoto).

**Estándar abierto**: Anthropic publicó MCP con spec pública en [modelcontextprotocol.io](https://modelcontextprotocol.io). OpenAI, Google y otros pueden implementarlo — y algunos ya lo hacen.

</terminology>

### Comparación: tool use artesanal vs MCP

| Dimensión | Tool use artesanal (M05) | MCP |
|-----------|--------------------------|-----|
| Definición de tools | Inline en cada request | En el server, descubrible dinámicamente |
| Reutilización entre hosts | Copiás el JSON | El mismo server lo usan todos |
| Versionado | Manual, por integración | El server declara sus capabilities |
| Cambio de schema | Actualizás cada consumidor | Actualizás el server, los clientes refrescan |
| Ejecución del tool | Tu código la maneja en el handler | El server la ejecuta internamente |
| Overhead inicial | Bajo (solo JSON) | Medio (correr un proceso server) |

La regla práctica:

- **Tool use artesanal**: cuando las tools viven en tu mismo backend y no las vas a reutilizar afuera.
- **MCP**: cuando querés exponer un sistema (DB, API, servicio) a múltiples agentes / hosts, o consumir un sistema de terceros que ya publica un server MCP.

### MCP no reemplaza tool use — lo generaliza

Esta es la confusión más común. Cuando un agente Claude usa un server MCP, **internamente sigue siendo tool use**. El modelo ve las tools que el server ofrece y las llama con el mismo ciclo `tool_use` / `tool_result` del Módulo 5.

Lo que cambia es **quién aporta las definiciones de tools y quién las ejecuta**:

- En tool use artesanal: vos definís las tools en el request y vos las ejecutás en tu código.
- En MCP: un server MCP ofrece las tools (y otras primitivas), y el client MCP (parte del host) media las llamadas.

El modelo no "sabe" de MCP. Solo ve tools. MCP es la **plomería** que las trae a la mesa.

### Por qué importa ahora

Tres razones por las que MCP pasó de curiosidad a infraestructura:

1. **Claude Code lo usa nativamente**. Configurás un server MCP en `.claude.json` y Claude Code lo tiene disponible en cada sesión.
2. **La Messages API lo consume via `mcp_servers` + beta `mcp-client-2025-04-04`**. Tu agente backend puede conectarse a servers MCP remotos sin escribir el glue code.
3. **El ecosistema está creciendo**: hay servers MCP oficiales para filesystem, fetch, git, Postgres, GitHub, Slack, y muchos más. Usar uno existente es cuestión de apuntarle la URL.

Invertir el esfuerzo en construir algo como server MCP (lo vemos en las lecciones 9-10) significa que **una sola implementación** queda disponible para todos los hosts futuros.

## Ejecución real

MCP es una spec — no hay "curl a MCP". Pero podemos ver la **forma** del protocolo inspeccionando un mensaje real JSON-RPC 2.0 que un client MCP envía a un server cuando le pregunta "¿qué tools ofrecés?":

```json
// Request del client → server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

```json
// Response del server → client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read the contents of a file",
        "inputSchema": {
          "type": "object",
          "properties": { "path": { "type": "string" } },
          "required": ["path"]
        }
      }
    ]
  }
}
```

Observá:

- Es JSON-RPC 2.0 plano. `method`, `params`, `id`, `result`.
- El shape del `inputSchema` del tool es el **mismo** que vimos en el Módulo 5 para tool use — esto no es casual, MCP reutiliza JSON Schema para no inventar otro lenguaje.
- El transporte de este mensaje puede ser **stdio** (líneas NDJSON sobre stdin/stdout de un proceso local) o **HTTP** (un POST a un server remoto). La forma del mensaje no cambia.

Más adelante vas a ejecutar esto de verdad — en la lección 8 vas a levantar un server MCP oficial con `npx` y ver estos mensajes pasando.

> **Nota:** los mensajes de arriba están tomados de la spec oficial ([modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)) y representan el shape real del wire protocol. Verificá contra la spec al implementar.

## Anti-patterns

- ❌ **Usar MCP para todo "porque es el estándar"**. Si tus tools viven en el mismo process que tu agente y no se reutilizan, tool use artesanal es más simple y rápido. MCP agrega un proceso extra (el server) y una capa de protocolo — pagás overhead por reutilización que quizá no necesitás.
- ❌ **Pensar que MCP es un reemplazo de la API de Anthropic**. MCP es cómo los **servers** ofrecen capacidades. La API de Anthropic sigue siendo tu entry point al modelo.
- ❌ **Confundir MCP con un framework de agentes**. MCP no orquesta, no decide qué tool llamar, no persiste memoria. Es solo el contrato de cómo un cliente pide capacidades a un server.
- ❌ **Asumir que todo server MCP es confiable**. Como con cualquier dependencia, un server MCP de terceros corre con los permisos que le das (filesystem, red). Revisá el código antes de conectarlo a tu agente. Los servers oficiales de `modelcontextprotocol/servers` son un buen punto de partida.
- ❌ **Escribir un server MCP para tu primer prototipo**. Arrancá con tool use artesanal, validá que el agente funciona, y recién cuando vayas a exponer esas capacidades a un segundo host, extraé a MCP.

## Recap

- MCP es un **protocolo JSON-RPC 2.0** que estandariza cómo clientes LLM se conectan a servers de capacidades.
- Resuelve el problema de **duplicación de integraciones** entre hosts distintos (backend, Claude Code, Managed Agents, etc.).
- Es a los agentes LLM lo que LSP fue a los editores: **una integración, muchos consumidores**.
- MCP no reemplaza tool use — lo **generaliza**: el modelo sigue viendo tools, pero quien las define y ejecuta ahora es un server externo.
- Conviene usar MCP cuando querés reutilizar capacidades entre hosts o consumir servers ajenos; para un agente monolítico, tool use artesanal alcanza.
- La spec es pública: [modelcontextprotocol.io](https://modelcontextprotocol.io).

---

**Fuente oficial:** [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
**Ejercicio:** <!-- exercise:ex-07-01-conceptos-mcp -->
