# Primitivas avanzadas: sampling y roots

## Objetivo

Al terminar esta lección sabrás **qué son sampling y roots**, las dos primitivas menos comunes de MCP, por qué invierten la dirección habitual (van del **server hacia el client**), cuándo las vas a encontrar en la práctica, y cómo encajan en el modelo de permisos del protocolo.

## Concepto

### Las primitivas "al revés"

Las tres primitivas que viste en lecciones anteriores (tools, resources, prompts) tienen algo en común: **el client pregunta, el server responde**. Son capabilities del server.

Sampling y roots son distintas — son capabilities del **client**:

- **Sampling**: el server le pide al client "por favor pedile al LLM que genere esto".
- **Roots**: el server le pregunta al client "¿qué directorios/URIs me das permiso para ver?".

La dirección inversa tiene sentido cuando pensás quién tiene qué recurso:

- Solo el host tiene conexión con el modelo LLM (Claude). Un server MCP aislado no puede llamar a `/v1/messages` por sí mismo — no tiene la API key ni debería tenerla.
- Solo el host sabe qué permisos le dio el user al server. El server no puede "listar el filesystem" sin que el user/host lo habilite.

### Sampling: el server pide una generación al LLM

**Sampling** permite a un server construir su propia lógica agentic usando el modelo del host. El server manda un `sampling/createMessage` al client:

```json
// server → client
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "sampling/createMessage",
  "params": {
    "messages": [
      { "role": "user", "content": { "type": "text", "text": "Classify this ticket: 'My login is broken'" } }
    ],
    "systemPrompt": "You are a ticket classifier.",
    "maxTokens": 200,
    "modelPreferences": {
      "hints": [{ "name": "claude-sonnet-4" }],
      "intelligencePriority": 0.7,
      "speedPriority": 0.3
    }
  }
}
```

El client:

1. Recibe la request.
2. **Pide confirmación al user** (idealmente — un host bien diseñado no deja al server disparar generaciones sin visibilidad).
3. Traduce a un request a `/v1/messages` contra el modelo del host.
4. Devuelve el response al server.

```json
// client → server
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": {
    "role": "assistant",
    "content": { "type": "text", "text": "Category: auth. Priority: high." },
    "model": "claude-sonnet-4-6",
    "stopReason": "endTurn"
  }
}
```

**Casos de uso reales**:
- Un server MCP de code review que necesita resumir diffs internos antes de exponerlos como tool result.
- Un server de búsqueda que quiere **re-rankear** resultados usando el modelo.
- Un server "meta" que compone sub-tasks y orquesta.

**Por qué sampling es raro**: es poderoso pero peligroso. Dar a un server la capacidad de disparar llamadas al LLM abre la puerta a:

- Loops infinitos (server pide generación → genera algo que pide otra generación → ...).
- Costos descontrolados (cada server conectado puede consumir tokens del user).
- Exfiltración de contexto (un server malicioso podría mandar al LLM datos privados que recibió).

Por eso la mayoría de los hosts **no lo habilitan por default**. Claude Code históricamente no expuso sampling automático sin confirmación explícita. Un client bien implementado:

1. Requiere aprobación humana por cada `sampling/createMessage`.
2. Muestra qué mensajes se van a enviar al modelo.
3. Pone límites duros de tokens y costos por sesión.

<warning>
Si vas a habilitar sampling en un host que estás construyendo, tratalo como dar shell a un proceso externo. Auditá, rate-limitá, confirmá. La capability técnicamente es opcional — activala solo si el caso lo justifica.
</warning>

### Roots: el server pregunta "¿qué puedo mirar?"

**Roots** es la primitiva más simple. Un "root" es una URI (típicamente `file://...` o `https://...`) que **el client declara al server** como "acá tenés permiso para operar".

Flujo:

1. Al hacer el `initialize`, el client declara capability `roots: { listChanged: true }` si soporta roots.
2. El server puede, en cualquier momento, pedir `roots/list`:

```json
// server → client
{ "jsonrpc": "2.0", "id": 7, "method": "roots/list" }

// client → server
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "roots": [
      { "uri": "file:///Users/ulises/Documents/GitHub/my-project", "name": "current workspace" }
    ]
  }
}
```

3. Si el user cambia de workspace o agrega un directorio, el client manda `notifications/roots/list_changed` y el server re-pregunta.

Típicamente esto se usa con servers que operan sobre filesystem:

- Claude Code le dice al server `filesystem` "tu root es el cwd del proyecto abierto".
- Si el user cambia de proyecto, el server entera y limita su scope al nuevo directorio.

**No es auth, es discovery de scope**. Un server bien diseñado **ignora** URIs que caen fuera de los roots — incluso si el user/modelo le pide leer algo afuera. Roots es cómo el client le dice "acá vive tu mundo".

### Cómo se combinan en la práctica

Capability matrix típica:

| Actor | Declara típicamente |
|-------|---------------------|
| Cliente (ej: Claude Code) | `sampling`, `roots`, tal vez `elicitation` |
| Server (ej: filesystem) | `tools`, `resources`, `prompts` |

El handshake `initialize` cruza estas declaraciones. Cada lado sabe qué puede pedirle al otro:

- Server ve que el client soporta `roots` → puede llamar `roots/list`.
- Client ve que el server soporta `tools` → puede llamar `tools/list`.
- Si un lado no declara una capability, el otro **no debería** invocarla (y si lo hace, recibe un error JSON-RPC).

### Elicitation: la primitiva que está emergiendo

Vale mencionar aunque no sea foco: algunas versiones recientes de la spec agregan **elicitation** (server le pide al client "pregúntale esto al user"). Es como sampling pero para input humano en vez de input del modelo. Flujo: server necesita un dato → client muestra un form al user → user responde → server continúa. Útil en workflows interactivos pero, igual que sampling, pide cuidado en el host para no romper UX.

La versión del protocolo que soporte tu SDK determina qué está disponible. Verificá el `protocolVersion` del handshake al implementar.

## Ejecución real

Sampling y roots rara vez se ven en un curl "a mano" porque requieren infraestructura de dos lados. Un fragmento representativo del wire protocol para sampling, tomado de la spec:

```json
// server → client: createMessage
{
  "jsonrpc": "2.0", "id": 1, "method": "sampling/createMessage",
  "params": {
    "messages": [{"role":"user","content":{"type":"text","text":"What is 2+2?"}}],
    "maxTokens": 50
  }
}

// client → server: result
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "role": "assistant",
    "content": {"type":"text","text":"4"},
    "model": "claude-sonnet-4-6",
    "stopReason": "endTurn"
  }
}
```

Y para roots:

```json
// server → client
{"jsonrpc":"2.0","id":1,"method":"roots/list"}

// client → server
{"jsonrpc":"2.0","id":1,"result":{
  "roots":[{"uri":"file:///workspace","name":"workspace"}]
}}
```

En la lección 9, cuando construyas un server, vas a decidir si necesitás declarar `sampling` como required capability. Para la mayoría de servers, la respuesta es **no** — las tres primitivas del server (tools, resources, prompts) alcanzan.

> **Nota:** el `protocolVersion` exacto que soporta una capability dada varía con la spec. Consultá [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification) y el changelog del SDK para confirmar qué hay disponible hoy.

## Anti-patterns

- ❌ **Habilitar sampling sin confirmación humana**. Es la vía más rápida a una factura sorpresa y a prompt injection cross-server. Siempre confirmación, rate limit y logging.
- ❌ **Usar sampling cuando una tool alcanza**. Si el server necesita "pensar" algo, y el host ya le da acceso al modelo vía tools, no hace falta sampling — el modelo llama la tool, el server devuelve el input que necesita el modelo. Sampling es para que el **server** use el modelo sin el user en el medio.
- ❌ **Ignorar los roots en un server de filesystem**. Si tu server lee archivos basado solo en argumentos del user (sin filtrar por roots), cualquier user que conecte tu server puede leer `/etc/passwd`. Respetá el scope.
- ❌ **Roots dinámicos mal notificados**. Si cambiás los roots (user abre otro proyecto) pero no emitís `notifications/roots/list_changed`, el server opera con info vieja. Implementá la notificación.
- ❌ **Asumir que toda versión del protocolo soporta estas primitivas**. `sampling` y `elicitation` fueron agregándose en distintos momentos. Verificá `protocolVersion` y las capabilities declaradas antes de invocarlas.

## Recap

- Sampling y roots son capabilities del **client**, no del server — invierten la dirección habitual.
- **Sampling**: el server pide al client "ejecutá este request al LLM por mí". Poderoso y peligroso; requiere aprobación humana.
- **Roots**: el client le dice al server "tenés permiso para operar dentro de estas URIs". Discovery de scope, no auth.
- Se declaran en el handshake `initialize`; si un lado no declara la capability, el otro no la invoca.
- La mayoría de los servers no necesita sampling; la mayoría de los servers de filesystem sí respetan roots.
- **Elicitation** (emergente): una variante donde el server pide input al **user** vía el client, no al modelo.

---

**Fuente oficial:** [modelcontextprotocol.io/specification/client](https://modelcontextprotocol.io/specification/2025-06-18/client)
**Ejercicio:** <!-- exercise:ex-07-01-conceptos-mcp -->
