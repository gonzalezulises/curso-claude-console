# Anatomía completa de la respuesta

## Objetivo

Al terminar sabrás leer **cualquier respuesta** de `/v1/messages` — incluyendo las que vas a ver en módulos posteriores con `thinking`, `tool_use` o `server_tool_use` —, entenderás por qué `content` es siempre un **array de bloques**, y vas a saber exactamente qué significa cada valor de `stop_reason`, cada campo de `usage` y cuándo te importa cada uno.

## Concepto

### El shape completo de la respuesta

Cualquier llamada exitosa (HTTP 200) a `/v1/messages` te devuelve un JSON con esta forma base:

```json
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [
    { "type": "text", "text": "..." }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "stop_details": null,
  "usage": {
    "input_tokens": 32,
    "output_tokens": 13,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
    },
    "service_tier": "standard",
    "inference_geo": "global"
  }
}
```

Vamos campo por campo — esta es la lección de referencia que vas a volver a consultar cuando veas respuestas raras en los módulos siguientes.

### `id` y `type`

- **`id`** *(string)* — identificador único del mensaje con prefijo `msg_`. Es útil para **logs y auditoría**: cuando en el dashboard (Analytics) investigues una llamada rara, vas a filtrar por este id. En producción, **siempre logueá este id** junto a tu request para correlacionar.
- **`type`** *(string, siempre `"message"`)* — el discriminador del tipo de objeto. En modo streaming vas a ver otros valores (`message_start`, `message_delta`, etc.) que identifican eventos del stream, pero en una respuesta no-streaming siempre es `"message"`.

### `role`

Siempre es `"assistant"`. Marca que este objeto es el turno que Claude acaba de producir. Tiene sentido cuando lo tomás entero y lo agregás como próximo turno en `messages[]` para una conversación multi-turno (Lección 05).

### `model`

El modelo que **efectivamente atendió** la request. Ya lo vimos en la Lección 01: puede venir igual al alias que pasaste, o expandido al snapshot con fecha — depende del modelo. No confíes en que va a ser uno u otro.

### `content` — **el campo más importante**

**`content` es siempre un array**, y cada elemento es un **bloque tipado**. Esta es la decisión de diseño más importante de la Messages API y la que la prepara para todo lo demás que vas a aprender en el curso.

Tipos de bloques que podés ver:

<terminology>
**`text`** — texto plano. La forma más común. `{ "type": "text", "text": "..." }`. Si también pasaste `citations` en un bloque de documentos (Módulo 4), este bloque puede incluir un campo `citations` con las referencias que el modelo ancló.

**`thinking`** — el razonamiento interno del modelo cuando activaste extended thinking. `{ "type": "thinking", "thinking": "...", "signature": "..." }`. Lo vas a ver en tareas donde habilitaste `thinking` en el request. El `signature` sirve para permitir que el modelo *resuma* su thinking en turnos siguientes sin revelar el texto completo.

**`tool_use`** — Claude quiere llamar a una herramienta tuya. `{ "type": "tool_use", "id": "toolu_...", "name": "get_weather", "input": { ... } }`. El protocolo completo de tool use lo vemos en el Módulo 5.

**`server_tool_use`** — Claude llamó a una herramienta **que corre en la infraestructura de Anthropic** (web search, web fetch, code execution). El resultado viene en un bloque `server_tool_use_result` posterior en el mismo `content[]`. Módulo 5 también.

**`container_upload`** — usado en requests, no en respuestas, pero lo vas a ver en el Módulo 4 (multimodal con code execution).
</terminology>

**Lección crítica**: tratar `content` como array desde el día 1 hace que tu código **no tenga que refactorizarse** cuando activas tool use, thinking o citations. El patrón canónico para extraer solo texto:

```typescript
const textBlocks = message.content.filter(b => b.type === "text");
const fullText = textBlocks.map(b => b.text).join("");
```

O si solo te interesa el primer bloque de texto:

```typescript
const firstText = message.content.find(b => b.type === "text")?.text ?? "";
```

Escribir `message.content[0].text` funciona por accidente en hello world y **se rompe** en el momento que el primer bloque es `thinking` o `tool_use`.

### `stop_reason` — por qué Claude dejó de generar

Valores que vas a ver, de más común a más raro:

| Valor | Qué significa | Qué hacer |
|---|---|---|
| `"end_turn"` | Claude terminó naturalmente. | Seguir normal. Caso feliz. |
| `"max_tokens"` | Chocó con tu `max_tokens`. El output está **truncado**. | Subir `max_tokens` o pedir más corto en el prompt. |
| `"stop_sequence"` | Alguna de tus `stop_sequences` apareció. `stop_sequence` te dice cuál. | Lo que sea que tu app hace con ese freno. |
| `"tool_use"` | Claude quiere invocar una herramienta — el último bloque de `content` es un `tool_use`. | Ejecutar la herramienta y devolver el resultado (Módulo 5). |
| `"pause_turn"` | Pausa en agentes de muchos turnos. Podés continuar la misma respuesta en el siguiente request. | Reenviar para continuar (Módulo 9 — Managed Agents). |
| `"refusal"` | Los clasificadores de seguridad intervinieron y el modelo se negó. | No reintentar el mismo prompt — reformular o fallar hacia el usuario. |
| `"model_context_window_exceeded"` | Excediste la ventana de contexto del modelo durante la generación (raro con 1M). | Reducir el prompt, dividir la tarea. |
| `"compaction"` | El modelo compactó el contexto en medio de la sesión (gestión de contexto larga). | Seguir — es metadata, no es error. |

**Regla mental**: tratá `stop_reason` como una **máquina de estados**, no como un detalle. Casi todo el comportamiento de producción se decide acá: ¿hay que reintentar? ¿loguear al usuario? ¿es un tool use que requiere otra ronda? Tu código que llama a la API **siempre** debería tener un `switch (stop_reason)`.

### `stop_sequence` y `stop_details`

- **`stop_sequence`** — si `stop_reason === "stop_sequence"`, este campo contiene **cuál** de tus strings fue la que disparó el corte. En cualquier otro caso es `null`.
- **`stop_details`** — objeto opcional con metadata adicional sobre la parada. Actualmente casi siempre lo vas a ver como `null`. Es un slot reservado para refinamientos futuros — tu código no debería romperse si es `null` ni asumir que tiene valor.

### `usage` — el contador que decide tu factura

Este objeto es **la única fuente de verdad de cuánto pagás**. Mirálo siempre en desarrollo; logueálo en producción.

```json
{
  "input_tokens": 32,
  "output_tokens": 13,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 0,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 0
  },
  "service_tier": "standard",
  "inference_geo": "global"
}
```

- **`input_tokens`** — tokens del prompt que **no vinieron de cache**. Facturados a precio base del modelo.
- **`output_tokens`** — tokens generados por Claude. Facturados al precio de output (5x el input).
- **`cache_creation_input_tokens`** — tokens del prompt que se **escribieron a cache** en esta llamada. Facturados al multiplicador de cache write (1.25x o 2x según TTL). Casi siempre 0 a menos que hayas activado prompt caching (Módulo 6).
- **`cache_read_input_tokens`** — tokens que se **leyeron de cache** en esta llamada. Facturados al 0.1x del precio base.
- **`cache_creation.ephemeral_5m_input_tokens`** / **`ephemeral_1h_input_tokens`** — desglose de `cache_creation_input_tokens` por TTL. Útil para saber en qué TTL está pagando tu cache.
- **`service_tier`** — qué tier atendió tu request. Normalmente `"standard"`. Puede ser `"priority"` o `"batch"` si estás en esos planes.
- **`inference_geo`** — región donde se hizo la inferencia. Valores observados: `"global"`, regiones específicas como `"us-west-2"`, o `"not_available"` cuando la metadata no se expone. Relevante si activaste [data residency](https://platform.claude.com/docs/en/build-with-claude/data-residency) (1.1x de costo si pediste US-only).

**Fórmula del total de tokens de entrada**:

> `total_input = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`

El costo de la llamada es `input_tokens * rate_in + cache_creation_input_tokens * rate_in * 1.25|2 + cache_read_input_tokens * rate_in * 0.1 + output_tokens * rate_out`. Mientras no uses caching, se simplifica a `input × rate_in + output × rate_out`.

> **Nota**: en llamadas con tools server-side (web search, code execution, web fetch — Módulo 5) vas a ver también `usage.server_tool_use` con contadores como `web_search_requests`, `web_fetch_requests` y `code_execution_requests`. Ignoralos por ahora.

## Ejecución real

**Paso 1 — Pedir una respuesta simple y leer el shape completo**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 120,
    "messages": [{"role": "user", "content": "Di hola en 3 idiomas distintos, un idioma por línea. Sin preámbulo."}]
  }'
```

Respuesta real al escribir esta lección:

```json
{
  "id": "msg_01G4te8DYa9rHsoS8S4vjr57",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [
    { "type": "text", "text": "Hola\nHello\nBonjour" }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "stop_details": null,
  "usage": {
    "input_tokens": 32,
    "output_tokens": 13,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
    },
    "service_tier": "standard",
    "inference_geo": "global"
  }
}
```

**Paso 2 — Extraer solo el texto de forma robusta**

En TypeScript (en un archivo `playground/parse-content.ts`):

```typescript
type TextBlock = { type: "text"; text: string };
type Block = TextBlock | { type: "thinking" | "tool_use" | "server_tool_use"; [k: string]: unknown };

function extractText(content: Block[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

const resp = {
  content: [{ type: "text" as const, text: "Hola\nHello\nBonjour" }],
};

console.log(extractText(resp.content));
// => "Hola\nHello\nBonjour"
```

Este patrón funciona **igual** cuando Claude devuelva mezclados un bloque `thinking` y uno `text` (Módulo 3), o un bloque `text` y uno `tool_use` (Módulo 5). Por eso empezamos acostumbrándote al filter/find desde ya.

**Paso 3 — Calcular el costo de la llamada desde `usage`**

Con los valores de arriba (Sonnet 4.6, 32 input / 13 output):

```
costo = 32 × $3 / 1_000_000 + 13 × $15 / 1_000_000
     = $0.000096 + $0.000195
     = $0.000291
```

Menos de 3 centésimas de centavo. Con volumen (10k llamadas como esta), serían ~$2.91. Tener `usage` loggeado desde el día 1 es **la diferencia entre controlar tu factura y descubrirla al fin de mes**.

## Anti-patterns

- ❌ **`message.content[0].text`** sin verificar el `type`. Tan pronto active tool use o thinking, revienta. Usá `filter` o `find` por `type === "text"`.
- ❌ **Ignorar `stop_reason`**. Si tu código dice "pido a la API y uso el texto", no está lista para tool use, ni para refusal, ni para truncado por `max_tokens`. Implementá un `switch` en `stop_reason` desde el principio.
- ❌ **Tratar `stop_reason: "max_tokens"` como éxito**. Técnicamente la API devolvió 200, pero tu output está **cortado en la mitad**. Si mostrás eso al usuario final sin avisar, es un bug.
- ❌ **No loguear `id` y `usage`**. El `id` es tu pista para auditoría en el dashboard; `usage` es tu contabilidad. Sin esos dos, debuggear un incidente de producción se vuelve adivinanza.
- ❌ **Asumir que `content` tiene siempre un solo elemento.** En tool use, thinking y citations vas a ver respuestas con 2, 3 o más bloques. Iterá, no indexes a mano.
- ❌ **Confundir `stop_details` con `stop_reason`**. `stop_reason` es el campo operativo que vas a leer; `stop_details` es metadata reservada que suele ser `null`.
- ❌ **Ignorar el campo `refusal` en `stop_reason`**. Si aparece, **no reintentes con el mismo prompt** — el clasificador ya dijo que no. Reformulá o fallá al usuario.

## Recap

- **La respuesta es un JSON con `id`, `type`, `role`, `model`, `content[]`, `stop_reason`, `stop_sequence`, `stop_details` y `usage`**. Esos son **todos** los campos top-level que vas a ver en respuestas normales — memorizá esta lista.
- **`content` es siempre un array de bloques tipados** (`text`, `thinking`, `tool_use`, `server_tool_use`). Filtrá por `type` desde el primer día; nunca indexes `content[0]` a ciegas.
- **`stop_reason` es una máquina de estados**, no un detalle. Tu código de producción debería manejar al menos `end_turn`, `max_tokens`, `tool_use` y `refusal` explícitamente.
- **`usage` es tu factura**. Siempre loguealo. La fórmula: `input_tokens × rate_in + output_tokens × rate_out`, más los costos de cache si los activás.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** <!-- exercise:ex-01-03-parsear-content -->
