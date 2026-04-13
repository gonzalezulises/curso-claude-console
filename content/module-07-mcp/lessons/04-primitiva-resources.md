# Primitiva: resources

## Objetivo

Al terminar esta lección sabrás **qué son los resources en MCP**, cuándo usar un resource en lugar de una tool, cómo se identifican con URIs, los cuatro métodos asociados (`resources/list`, `resources/read`, `resources/templates/list`, `resources/subscribe`), y por qué "data vs action" es la distinción que importa.

## Concepto

### Tools hacen, resources son

La regla mental más útil:

- **Tool**: un verbo. `search_notes`, `send_email`, `run_query`. Tiene efectos (o al menos puede tenerlos). El modelo decide cuándo llamar.
- **Resource**: un sustantivo. "el archivo README.md", "la tabla users", "la URL https://...". Es **contexto disponible**, identificable por URI.

Un server MCP puede exponer ambos. Ejemplo real del server `filesystem`:

- Tool `read_file` — acción que lee un archivo arbitrario.
- Resource `file:///allowed-dir/config.yaml` — un archivo específico expuesto como "acá está este archivo, si lo necesitás".

La diferencia práctica: un **resource está disponible para que el host lo use antes o después del modelo**, sin que el modelo tenga que "pedirlo" como tool. El host puede, por ejemplo, listar los resources al iniciar la sesión y mostrárselos al user como "contexto adjunto".

<terminology>

**URI (Uniform Resource Identifier)**: el identificador único de un resource. Puede ser `file://`, `https://`, o un scheme custom (`postgres://db/table`, `notion://page/abc`). No tiene que ser resolvible externamente — solo tiene que ser único dentro del server.

**Resource template**: una URI parametrizada (ej: `file:///logs/{date}.log`). El server la publica para que el client la rellene con valores concretos al leer.

**MIME type**: qué tipo de contenido trae el resource. `text/plain`, `application/json`, `image/png`. Permite al host decidir cómo mostrarlo.

</terminology>

### Los cuatro métodos

**`resources/list`** — "¿qué resources concretos ofrecés ahora?"

```json
// server → client
{
  "resources": [
    { "uri": "file:///var/log/app.log", "name": "app.log", "mimeType": "text/plain" },
    { "uri": "config://db",              "name": "DB config", "mimeType": "application/json" }
  ]
}
```

**`resources/read`** — "dame el contenido de este resource"

```json
// client → server
{ "method": "resources/read", "params": { "uri": "config://db" } }

// server → client
{
  "contents": [
    { "uri": "config://db", "mimeType": "application/json", "text": "{\"host\":\"...\"}" }
  ]
}
```

Un resource puede devolver **varios contents** (ej: si el URI representa una colección). Cada content es texto (`text`) o binario (`blob`, base64).

**`resources/templates/list`** — "¿qué patrones de URI parametrizados ofrecés?"

Útil cuando el server expone un espacio infinito (ej: cualquier archivo bajo `/var/log/`, cualquier página de un CMS). El server publica plantillas tipo RFC 6570:

```json
{
  "resourceTemplates": [
    { "uriTemplate": "file:///var/log/{name}.log", "name": "app log", "mimeType": "text/plain" }
  ]
}
```

El client rellena `{name}` en runtime (a pedido del usuario o el modelo) y llama `resources/read` con la URI concreta.

**`resources/subscribe` / `resources/unsubscribe`** — para resources que cambian en el tiempo

El client puede pedir "avisame si cambia este resource". El server manda `notifications/resources/updated` cuando eso pasa. Útil para archivos de config que mutan, logs vivos, etc.

### Cómo el host expone resources al modelo

Acá está la parte que desorienta: **los resources no llegan al modelo por sí solos**. El host decide cómo usarlos. Dos patrones típicos:

1. **Inyección en el prompt**: el host lee el resource, lo pega al `system` o al `user` message. El modelo lo ve como texto. Ej: "acá está la config de DB del usuario: ```...```".

2. **Exposición como tool**: el host crea una tool sintética tipo `read_resource({uri})` que el modelo puede llamar. Al llamarla, el host hace `resources/read` por detrás y devuelve el content como `tool_result`.

La spec no obliga ninguno — depende del host. Claude Code, por ejemplo, permite al usuario "anclar" resources como attachments que se inyectan en el system prompt. La Messages API vía MCP Connector típicamente los expone a través de tools sintéticas.

### ¿Cuándo usar resource vs tool?

| Caso | Preferí | Por qué |
|------|---------|---------|
| Archivo específico que el user pide anclar | Resource | Es data, el user sabe qué pidió |
| "Leer un archivo arbitrario que el modelo elija" | Tool | Action del modelo, no del user |
| Config estática que toda sesión necesita | Resource (via inyección) | Es contexto, no decisión del modelo |
| Búsqueda en una base | Tool | Action con argumentos variables |
| Snapshot actual de métricas | Resource | Data puntual |
| "Crear un ticket nuevo" | Tool | Efecto de escritura |

Cuando dudes: **si tiene side effects o argumentos complejos, tool. Si es data identificable por URI, resource.**

### Diferencia con tools a nivel diseño de server

Cuando construyas tu propio server (lección 9), la regla práctica:

- Toda **acción con lógica** → tool.
- Todo **asset leíble que querés que el user pueda anclar como contexto** → resource.
- Si algo es ambos (ej: "el contenido actual de este doc"), exponelo **como resource**, y si el modelo necesita pedirlo dinámicamente, agregá una tool `get_resource(uri)` o similar que internamente use `resources/read`.

## Ejecución real

Sesión real con `@modelcontextprotocol/server-filesystem` apuntado a `/tmp`:

```json
// 1. client pide lista
{"jsonrpc":"2.0","id":3,"method":"resources/list"}

// 2. server responde (output truncado)
{"jsonrpc":"2.0","id":3,"result":{
  "resources":[
    {"uri":"file:///tmp/notes.md","name":"notes.md","mimeType":"text/markdown"}
  ]
}}

// 3. client pide leer uno
{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"file:///tmp/notes.md"}}

// 4. server devuelve contenido
{"jsonrpc":"2.0","id":4,"result":{
  "contents":[
    {"uri":"file:///tmp/notes.md","mimeType":"text/markdown","text":"# My notes\n- ..."}
  ]
}}
```

En este caso el server expone **todos los archivos del dir permitido** como resources discoverable. Otros servers son más selectivos (ej: un server de Postgres puede exponer solo el schema, no las filas).

> **Nota:** la lista concreta de resources de cada server oficial varía por versión. `@modelcontextprotocol/server-filesystem` cambió su shape de resources entre versiones; verificá contra el README del server al usarlo.

## Anti-patterns

- ❌ **Usar resources para cosas con efectos**. Un `resources/read` debería ser idempotente y sin side effects. Si al leer un resource se crea un ticket, empezás a pelear contra el modelo mental del protocolo.
- ❌ **Devolver resources gigantes sin paginar**. Un log de 50MB se pasa en un solo `resources/read` y vuela el context window. Paginá con query params en la URI (`file:///log?from=2026-04-01`) o devolvé un resumen + resource_link.
- ❌ **Identificadores no únicos**. Si dos resources tienen la misma URI, el client no puede distinguirlos en cache / subscriptions. La URI es la clave — asegurate de que sea única y estable.
- ❌ **Exponer el filesystem entero sin scope**. El server oficial `filesystem` pide `ALLOWED_DIR` como argumento precisamente por esto. Un server que exponga `file:///*` sin filtro es una herida de seguridad abierta.
- ❌ **Olvidar el `mimeType`**. Sin mime type, el host no sabe si renderizar como texto, imagen o binario. Default razonable: `text/plain` si realmente es texto opaco.

## Recap

- **Resources = sustantivos**. Data identificable por **URI**, expuesta por el server para contexto.
- **Tools = verbos**. Actions con argumentos.
- Métodos clave: `resources/list`, `resources/read`, `resources/templates/list`, y suscripciones opcionales.
- El **host** decide cómo exponer resources al modelo — no hay un canal "directo" resource → LLM.
- Cada resource tiene `uri`, `name`, `mimeType`. Los contents pueden ser `text` o `blob` (base64).
- Usá **resources para data estática / anclajes**, **tools para acciones / búsquedas dinámicas**.

---

**Fuente oficial:** [modelcontextprotocol.io/specification/server/resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
**Ejercicio:** <!-- exercise:ex-07-05-resources -->
