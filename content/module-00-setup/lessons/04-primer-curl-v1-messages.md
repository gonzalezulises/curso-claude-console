# Tu primer curl a /v1/messages

## Objetivo

Al terminar esta lección habrás ejecutado tu **primera llamada real al endpoint `/v1/messages`**, entenderás **la anatomía del request y la respuesta**, y sabrás exactamente qué significa cada campo del JSON que devuelve Claude.

## Concepto

### El endpoint central

Toda conversación con un modelo Claude — desde un hello world hasta un agente multimodal con tool use y extended thinking — pasa por el mismo endpoint:

```
POST https://api.anthropic.com/v1/messages
```

No hay endpoints separados para "chat" vs "completion" vs "tool use". Es uno solo, y las capacidades se activan mediante campos del body. Esta es una decisión intencional de la Messages API: un solo protocolo estable, versionado por header, al que se le agregan capabilities sin romper el contrato base.

### Los tres headers obligatorios

<terminology>
**`x-api-key`** — tu workspace API key (`sk-ant-api03-...`). Es cómo Anthropic te autentica y te factura.

**`anthropic-version`** — la versión del protocolo HTTP. El valor estable actual es `2023-06-01`. Esta versión no cambia al ritmo de los modelos — es la versión de **cómo hablas con la API**, no del modelo.

**`content-type`** — `application/json`, porque el body es JSON. Obvio pero obligatorio.
</terminology>

Hay un cuarto header opcional pero muy importante: **`anthropic-beta`**, que activa features beta (prompt caching extendido, contexto de 1M, skills, managed agents, etc.). No lo necesitas en esta lección.

### Los tres campos obligatorios del body

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 256,
  "messages": [
    { "role": "user", "content": "Hola, ¿quién eres?" }
  ]
}
```

- **`model`** — el alias del modelo. Usamos `claude-haiku-4-5` porque es el más barato y rápido; perfecto para un hola mundo.
- **`max_tokens`** — límite superior de tokens que Claude puede generar en esta respuesta. Es un techo, no un objetivo; el modelo puede terminar antes. Obligatorio porque la API no quiere que accidentalmente pidas una respuesta infinita.
- **`messages`** — el array de turnos de conversación. Cada turno tiene `role` (`user` o `assistant`) y `content`. En esta primera llamada hay un solo turno del usuario.

### Anatomía de la respuesta

Cuando el request tiene éxito, recibes un JSON con esta forma:

```json
{
  "id": "msg_01ABcDEFghiJKLMN...",
  "type": "message",
  "role": "assistant",
  "model": "claude-haiku-4-5",
  "content": [
    { "type": "text", "text": "Hola, soy Claude..." }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 15,
    "output_tokens": 32,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

Campo por campo:

- **`id`** — identificador único del mensaje generado. Útil para logs y auditoría. Cuando abras **Analytics** en el dashboard, puedes filtrar por este id.
- **`type`** — siempre `"message"` en respuestas normales (hay otros valores en streaming events que veremos en el Módulo 1).
- **`role`** — siempre `"assistant"` en la respuesta; es el rol del turno que Claude acaba de producir.
- **`model`** — el modelo que efectivamente atendió la request. **Importante**: si pasaste un alias, esto puede resolver a un snapshot con fecha (ej: `claude-haiku-4-5-20251001`). Útil para reproducibilidad.
- **`content`** — un **array** de bloques. Para texto simple hay un solo bloque `{ type: "text", text: "..." }`. Pero `content` es array porque puede contener múltiples bloques de tipos distintos: `text`, `thinking`, `tool_use`, `server_tool_use`, etc. Entender que es array desde el día 1 te ahorra confusión cuando lleguen esos tipos.
- **`stop_reason`** — por qué Claude dejó de generar. Los valores que vas a ver más:
  - `end_turn` — Claude terminó naturalmente (lo esperado).
  - `max_tokens` — chocó con tu `max_tokens`. Si ves esto mucho, sube el límite.
  - `tool_use` — Claude quiere llamar a una herramienta (Módulo 5).
  - `stop_sequence` — Claude encontró una secuencia que le dijiste que detuviera la generación.
  - `pause_turn` — pausa en un agente de múltiples turnos (Módulo 9).
- **`stop_sequence`** — si `stop_reason = stop_sequence`, aquí aparece cuál fue. Suele ser `null`.
- **`usage`** — contabilidad de tokens. `input_tokens` es lo que cuenta tu prompt; `output_tokens` lo que generó Claude. Las otras dos entradas son para prompt caching (Módulo 6) — por ahora serán 0.

### ¿Por qué empezamos con curl y no con el SDK?

El protocolo HTTP es el contrato estable. Los SDKs son conveniencias construidas encima. Si aprendes el protocolo primero:

- Debuggeas cualquier SDK roto — porque sabes qué debería estar pasando por la red.
- Escribes clientes custom en cualquier lenguaje — todo lo que un SDK oficial hace, lo puedes reproducir con un request HTTP.
- Entiendes qué hace cada método del SDK por dentro — no es magia.

Cuando en el Módulo 1 veas `anthropic.messages.create(...)` del SDK TypeScript, vas a saber exactamente qué body está armando y qué respuesta está parseando, porque lo hiciste primero a mano.

## Ejecución real

**Pre-requisito**: tener `ANTHROPIC_API_KEY` exportada en tu shell (de la Lección 03).

**Paso 1 — El request mínimo**

Copia y pega este curl en tu terminal:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 256,
    "messages": [
      { "role": "user", "content": "Preséntate en 2 frases: quién eres, qué modelo eres, y en qué puedes ayudar. Responde en español." }
    ]
  }'
```

**Paso 2 — Lee el output que recibiste**

Tu respuesta se verá parecida a esto (el texto exacto variará, pero la **forma** es siempre la misma):

```json
{
  "id": "msg_017Kq8ZsPjR2x7mVnJ4aT1yB",
  "type": "message",
  "role": "assistant",
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {
      "type": "text",
      "text": "Hola, soy Claude, un asistente de IA creado por Anthropic, específicamente el modelo Claude Haiku 4.5. Puedo ayudarte con tareas como análisis de texto, escritura, programación, razonamiento y responder preguntas en múltiples idiomas."
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 38,
    "output_tokens": 72,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

> **Nota:** los valores exactos de `id`, `text` y `usage` van a ser distintos en tu corrida. Lo que tiene que coincidir es la **estructura** de los campos.

**Paso 3 — Observa que `model` resolvió a un snapshot con fecha**

En el ejemplo, pediste `claude-haiku-4-5` (alias) pero la respuesta dice `claude-haiku-4-5-20251001` (snapshot). Eso es deliberado: el alias apunta al snapshot "current", y la API te devuelve exactamente qué snapshot atendió para que puedas auditar. La próxima vez que Anthropic publique una versión nueva de haiku 4.5, el alias pasará a apuntar al nuevo snapshot, pero tu código no cambia.

**Paso 4 — Cambia el modelo y vuelve a correrlo**

Cambia `"claude-haiku-4-5"` por `"claude-sonnet-4-6"` y corre de nuevo. Nota:

- El texto probablemente es más elaborado.
- `usage.input_tokens` es el mismo (el prompt no cambió).
- `usage.output_tokens` puede variar.
- `model` en la respuesta ahora resuelve al snapshot current de sonnet.

Esto te muestra que **cambiar de modelo es cambiar un string** en el request. Esa es una propiedad muy poderosa — vas a usarla mucho a lo largo del curso para elegir el modelo adecuado por tarea.

**Paso 5 — Provoca un error 400 a propósito**

Para familiarizarte con cómo responde la API cuando algo está mal, intenta llamar sin `max_tokens`:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "messages": [{ "role": "user", "content": "hola" }]
  }'
```

Recibes algo así:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "max_tokens: Field required"
  }
}
```

Esta forma `{ type: "error", error: { type, message } }` es el formato estándar de errores de la API. Lo vas a ver en 401 (auth), 400 (request mal formado), 404 (modelo inexistente), 429 (rate limit), 529 (overload). Siempre la misma forma, solo cambian `error.type` y `error.message`.

## Anti-patterns

- ❌ **Pegar la API key directo en el curl en lugar de usar `$ANTHROPIC_API_KEY`.** Es tentador para un "one-liner de prueba", pero la key queda en `history` del shell y en screenshots. Usa siempre la variable de entorno.
- ❌ **Usar `claude-opus-4-6` para un hola mundo.** Es ~40x más caro por token que haiku, y no vas a notar la diferencia en un saludo de 3 frases. La regla mental: **haiku por default, subir a sonnet si el resultado no alcanza, subir a opus solo con justificación**.
- ❌ **Hardcodear un snapshot con fecha en código de producción.** Usa siempre el alias (`claude-haiku-4-5`), salvo que estés haciendo un experimento donde la reproducibilidad exacta importa más que tener el modelo más reciente.
- ❌ **Ignorar `usage`.** Ese objeto es la única fuente de verdad de cuánto vas a pagar. Si lo ignoras en desarrollo, te vas a llevar sorpresas en la factura.
- ❌ **Asumir que `content` es un string.** Es un array de bloques. Escribir `message.content.text` (como si fuera string) rompe en el momento que el modelo devuelve un `tool_use` o un `thinking` block. Lee siempre `content[0]` verificando el `type` primero.
- ❌ **Escribir tu propio retry sin exponential backoff en 429/529.** La API señaliza cuándo está saturada (`529 overloaded`) y cuándo te pasaste de rate (`429 rate_limit_error`); volver a llamar en un loop apretado solo empeora ambas situaciones. En el Módulo 1 vemos cómo hacerlo bien con el SDK.

## Recap

- **Un solo endpoint**: `POST /v1/messages`. Tres headers obligatorios (`x-api-key`, `anthropic-version: 2023-06-01`, `content-type`), tres campos obligatorios en el body (`model`, `max_tokens`, `messages`).
- **La respuesta es JSON con `id`, `model`, `content[]` (array de bloques), `stop_reason` y `usage`**. `content` es array porque ahí van a vivir también `thinking`, `tool_use`, `server_tool_use` y más en futuros módulos.
- **Cambiar de modelo es cambiar un string**. Empezamos con `claude-haiku-4-5` por costo; subimos a sonnet u opus cuando el problema lo justifica, no antes.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** <!-- exercise:ex-00-01-primer-curl -->
