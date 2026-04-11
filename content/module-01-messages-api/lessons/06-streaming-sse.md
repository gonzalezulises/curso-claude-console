# Streaming con Server-Sent Events

## Objetivo

Al terminar sabrás **habilitar streaming en `/v1/messages`**, identificar los 7 tipos de eventos del stream, parsearlos **a mano con curl** para no depender del SDK, y después verás cómo el SDK oficial los ergonomiza. Vas a entender por qué el stream es lo único que hace experiencia de "chat token a token" posible y cómo contar tokens desde los eventos.

## Concepto

### ¿Por qué streaming?

Sin streaming, Claude genera toda la respuesta entera y recién entonces te la manda — tu usuario ve una pantalla en blanco durante 3-20 segundos mientras Opus piensa una respuesta larga. Con streaming, la API te manda **cada fragmento de texto apenas se genera**, así tu UI empieza a mostrar letras en menos de 1 segundo.

Para chatbots, asistentes y cualquier tarea donde la respuesta sea directa al usuario, **streaming no es opcional**. La gente no tolera 10 segundos de pantalla muerta.

Además, streaming es la única forma de:

- Mostrar un "typewriter effect" real (no simulado).
- Cortar la generación temprano si el usuario cambia de opinión.
- Empezar a parsear output estructurado antes de que termine (parsing incremental).

### ¿Cómo activarlo?

Agregás **dos cosas** al request:

1. En el body: `"stream": true`.
2. En los headers: `Accept: text/event-stream`.

El header es técnicamente opcional en Anthropic — el `stream: true` del body es suficiente — pero es buena higiene: le dice a cualquier proxy o CDN intermedio que esto es SSE y no debe bufferizarlo.

La respuesta deja de ser un JSON único y pasa a ser una secuencia de **Server-Sent Events** (SSE). Formato nativo de HTTP, muy simple, muy soportado.

### El formato SSE en 30 segundos

Un stream SSE es texto plano con este shape:

```
event: <nombre del evento>
data: <JSON con la carga>

event: <otro evento>
data: <otro JSON>

```

Cada bloque "evento + data" está separado del siguiente por **una línea en blanco**. El parser canónico es: leer líneas hasta encontrar una en blanco, juntar las `event:` y `data:` acumuladas, emitir ese evento, repetir.

En Node/TS con el SDK oficial esto está abstraído, pero entenderlo a mano te deja construir clientes en cualquier lenguaje — y debuggear cuando algo raro pasa.

### Los 7 eventos del stream de Anthropic

En orden cronológico de una respuesta típica:

<terminology>
**`message_start`** — se envía una sola vez al inicio. La carga es un objeto `message` con `id`, `model`, `role`, `content: []` (vacío), `stop_reason: null`, y un `usage` **inicial** que ya contiene `input_tokens` definitivo pero `output_tokens: 1` (sí, 1 — no 0; el API cuenta desde el primer token). Pensalo como "el esqueleto del mensaje que va a ir llenándose".

**`content_block_start`** — se envía cada vez que empieza un nuevo bloque dentro de `content[]`. Incluye `index` (0, 1, 2...) y el objeto `content_block` inicial vacío: `{ "type": "text", "text": "" }`, o `{ "type": "tool_use", ... }`, o `{ "type": "thinking", ... }`. Un stream puede tener varios `content_block_start` si la respuesta tiene múltiples bloques.

**`content_block_delta`** — el evento más frecuente. Trae un `delta` que incrementa el bloque actual. Los tipos de delta: `text_delta` (texto plano), `thinking_delta` (razonamiento interno), `input_json_delta` (JSON de tool use que se va construyendo), `citations_delta` (citas ancladas), `signature_delta` (firma criptográfica del thinking).

**`content_block_stop`** — cierra el bloque actual. `index` coincide con el `content_block_start` correspondiente.

**`message_delta`** — se envía (normalmente una vez) **casi al final**, con los cambios finales del mensaje: `stop_reason` ya concreto, `stop_sequence` si aplica, y crucialmente un `usage` **con output_tokens finales acumulados**. Este es el evento donde leés la contabilidad real.

**`message_stop`** — último evento. Indica que terminó todo. No trae carga útil — es un marcador de EOF.

**`ping`** — evento de keepalive que la API puede emitir en cualquier momento para evitar que intermediarios cierren la conexión por idle. Ignoralo en el parser — no aporta data.
</terminology>

**Gotcha importante**: el `usage` del `message_start` y el del `message_delta` **no son iguales**. El de `message_start` es preliminar (`output_tokens: 1` por protocolo); el de `message_delta` es el acumulado real al final. **Para contar tokens, leé el `message_delta`**, no el `message_start`.

### Secuencia mínima vs secuencia compleja

La secuencia más simple (texto plano, respuesta corta):

```
message_start
content_block_start (index=0, type=text)
content_block_delta (text_delta)
content_block_delta (text_delta)
...
content_block_stop (index=0)
message_delta (stop_reason=end_turn)
message_stop
```

Una respuesta con tool use:

```
message_start
content_block_start (index=0, type=text)
content_block_delta (text_delta: "Voy a consultar el clima...")
content_block_stop
content_block_start (index=1, type=tool_use)
content_block_delta (input_json_delta: parcial del JSON)
content_block_delta (input_json_delta: siguiente trozo)
content_block_stop
message_delta (stop_reason=tool_use)
message_stop
```

Observá que el `index` te permite saber a **qué bloque** pertenece cada delta. Con múltiples bloques en la respuesta (que verás en el Módulo 5), el `index` es lo que te permite reconstruir `content[]` correctamente.

## Ejecución real

**Paso 1 — curl con `stream: true` y leer los eventos**

```bash
curl -s -N https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 60,
    "stream": true,
    "messages": [{"role": "user", "content": "Dame 3 palabras separadas por coma y nada más. Sin explicación."}]
  }'
```

Dos flags nuevos del curl importan:

- **`-N`** (`--no-buffer`): sin esto, curl bufferiza la salida y ves el stream de golpe al final. Con `-N`, ves los eventos a medida que llegan.
- **`-H "accept: text/event-stream"`**: higiene para proxies.

Output real al correr esta lección:

```
event: message_start
data: {"type":"message_start","message":{"model":"claude-haiku-4-5-20251001","id":"msg_01BiHaB6TfwQ4SrYoHQQBE7h","type":"message","role":"assistant","content":[],"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":27,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: ping
data: {"type": "ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"g"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ato, luna, café"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null,"stop_details":null},"usage":{"input_tokens":27,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":9}}

event: message_stop
data: {"type":"message_stop"}
```

**Observaciones**:

- `input_tokens: 27` está fijo desde `message_start` (la API ya los contó antes de generar).
- `output_tokens: 1` en `message_start` vs `output_tokens: 9` en `message_delta`. **El 9 es el real**. El 1 del inicio es protocolo.
- El primer `content_block_delta` trajo solo `"g"`; el segundo trajo `"ato, luna, café"` entero. Los deltas **no son tokens individuales** — son "trozos de tamaño arbitrario que el servidor elige enviarte cuando conviene". No asumas que un delta = un token.
- **Un `ping` apareció entre `content_block_start` y el primer `content_block_delta`**. Tu parser tiene que ignorarlo y seguir.
- Al **concatenar todos los `text_delta`** en orden, reconstruís el texto completo: `"g" + "ato, luna, café"` = `"gato, luna, café"`. Eso es exactamente lo que habrías visto en `content[0].text` con una llamada no-streaming.

**Paso 2 — Parser SSE manual en TypeScript (sin SDK)**

Para un archivo `playground/stream-parser.ts`:

```typescript
import "dotenv/config";

type SSEEvent = { event: string; data: string };

async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;

    buffer += decoder.decode(value, { stream: true });

    // Los eventos están separados por \n\n
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // el último puede estar incompleto

    for (const rawEvent of events) {
      let event = "";
      let data = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (event) yield { event, data };
    }
  }
}

async function main() {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 60,
      stream: true,
      messages: [
        { role: "user", content: "Dame 3 palabras separadas por coma y nada más. Sin explicación." },
      ],
    }),
  });

  let fullText = "";
  let finalUsage: { input_tokens: number; output_tokens: number } | null = null;

  for await (const sse of parseSSE(response)) {
    const payload = JSON.parse(sse.data);

    switch (sse.event) {
      case "content_block_delta":
        if (payload.delta.type === "text_delta") {
          process.stdout.write(payload.delta.text); // imprimir en vivo
          fullText += payload.delta.text;
        }
        break;
      case "message_delta":
        finalUsage = {
          input_tokens: payload.usage.input_tokens,
          output_tokens: payload.usage.output_tokens,
        };
        break;
      case "ping":
      case "message_start":
      case "content_block_start":
      case "content_block_stop":
      case "message_stop":
        // no-op para este ejemplo
        break;
    }
  }

  console.log("\n---");
  console.log("Texto completo:", fullText);
  console.log("Usage final:", finalUsage);
}

main();
```

Correlo con:

```bash
cd ~/Documents/GitHub/curso-claude-console
npx tsx playground/stream-parser.ts
```

Vas a ver `gato, luna, café` aparecer letra por letra (bueno, trozo por trozo), seguido del `usage` final. **Acabás de escribir un cliente streaming desde cero, sin SDK**. Eso es lo que un SDK te ahorra, pero lo podés hacer en 50 líneas de código.

**Paso 3 — El mismo ejemplo con el SDK oficial**

Para comparar, el equivalente con `@anthropic-ai/sdk`:

```typescript
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function main() {
  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 60,
    messages: [
      { role: "user", content: "Dame 3 palabras separadas por coma y nada más. Sin explicación." },
    ],
  });

  stream.on("text", (text) => process.stdout.write(text));

  const finalMessage = await stream.finalMessage();
  console.log("\n---");
  console.log("Texto completo:", finalMessage.content);
  console.log("Usage final:", finalMessage.usage);
}

main();
```

Menos código: el SDK te abstrae el parseo SSE y te da un helper `.on("text", ...)` que solo te entrega el texto a medida que llega, ignorando los eventos que no te importan. Además `stream.finalMessage()` te devuelve el objeto message "como si hubiera sido una llamada no-streaming", con `content[]` ya reconstruido y `usage` completo.

**Momento arquitecto**: el SDK es azúcar sintáctica sobre lo mismo que hiciste en el Paso 2. Saber el protocolo subyacente te permite:

- Escribir clientes para lenguajes sin SDK oficial.
- Debuggear cuando el SDK hace algo inesperado.
- Construir proxies que transformen el stream en tiempo real (por ejemplo, filtrar PII del texto antes de que llegue al cliente final).

## Anti-patterns

- ❌ **Asumir que un `content_block_delta` = un token**. No lo es. Los deltas son chunks de tamaño variable que el servidor decide. Si estás contando tokens contando deltas, estás equivocándote. Para contar, leé `usage.output_tokens` del `message_delta`.
- ❌ **Leer `usage.output_tokens` del `message_start`** pensando que es el total. El del `message_start` es siempre 1 (protocolo inicial). El total real está en el `message_delta`.
- ❌ **Olvidar `-N` en curl**. Sin `-N` ves el stream de golpe al final y pensás que el streaming no funciona. No es el API, es curl bufferizando.
- ❌ **Ignorar el `index` de los bloques.** En respuestas con múltiples bloques (tool use, thinking), los deltas llegan intercalados con distintos `index`. Si los pegás todos juntos sin respetar `index`, te queda el texto de un bloque mezclado con los inputs JSON de otro — un desastre.
- ❌ **No manejar el `ping`.** Si tu switch de eventos no tiene un case para `ping`, y además tu código falla ante "evento desconocido", vas a crashear aleatoriamente cuando llegue un keepalive. Siempre ignorá `ping` sin romper.
- ❌ **Concatenar deltas sin filtrar por tipo.** Si hay un bloque `thinking` y un bloque `text`, un parser que hace `fullText += delta.text` va a concatenar ambos, mezclando razonamiento interno con output visible al usuario. Filtrá por `delta.type === "text_delta"` si solo querés el texto visible.
- ❌ **Cortar el stream a mitad de camino sin limpiar el reader.** Si tu usuario cancela, cerrá la conexión (`reader.cancel()` en JS, `abort()` en fetch con AbortController) o vas a dejar conexiones colgadas.
- ❌ **Usar streaming cuando no lo necesitás**. Para un endpoint server-to-server que procesa un lote de 10k prompts, streaming solo agrega complejidad. Úsalo cuando hay un humano esperando output.

## Recap

- **Activar streaming**: `"stream": true` en el body + `Accept: text/event-stream` en headers + `-N` en curl. Eso es todo.
- **7 tipos de eventos**: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `ping`. El orden es siempre el de arriba (con múltiples `content_block_*` pares si hay varios bloques) y `ping` puede aparecer en cualquier momento.
- **Los deltas no son tokens**. Son chunks arbitrarios. Para contar tokens, leé `usage.output_tokens` del `message_delta` (NO del `message_start`).
- **Parsear SSE a mano es 50 líneas de código**. Hacelo una vez (el SDK te lo abstrae pero saberlo te habilita a debuggear y construir clientes custom).
- **El SDK oficial** te da `.on("text", ...)` y `stream.finalMessage()` como azúcar sobre el mismo protocolo. Mismo contrato, menos boilerplate.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages-streaming](https://platform.claude.com/docs/en/api/messages-streaming)
**Ejercicio:** <!-- exercise:ex-01-04-streaming-manual -->
