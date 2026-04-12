# Múltiples tools en paralelo

## Objetivo

Al terminar esta lección sabrás **cómo el modelo puede emitir varios `tool_use` blocks en un solo turno** cuando la pregunta del usuario requiere información independiente, cómo tu código debe ejecutar esas tools (idealmente en paralelo) y devolver múltiples `tool_result` blocks en un solo mensaje `user`, y cuándo desactivar este comportamiento con `disable_parallel_tool_use`.

## Concepto

### El modelo puede llamar varias tools en un mismo turno

Si el usuario pregunta algo que requiere información de fuentes independientes, el modelo puede emitir **múltiples `tool_use` blocks en el mismo `content[]`**:

```
user: "¿Qué clima y hora hay en Tokio?"
↓
assistant (un solo turno):
  content: [
    {type: "tool_use", id: "toolu_A", name: "get_weather", input: {city: "Tokio"}},
    {type: "tool_use", id: "toolu_B", name: "get_time",    input: {city: "Tokio"}}
  ]
  stop_reason: "tool_use"
```

El modelo identificó que las dos tools son independientes (no hace falta el resultado de una para llamar a la otra) y propuso las dos simultáneamente. **Esto reduce latencia**: en vez de 2 roundtrips (pregunta → tool A → result A → tool B → result B → respuesta), hacés 1 roundtrip con 2 resultados.

<terminology>
**Parallel tool use**: el modelo emite >1 `tool_use` block en el mismo turno de assistant. Todos los IDs son distintos. `stop_reason` sigue siendo `tool_use`.

**Secuencial** (NO paralelo): el modelo emite 1 solo `tool_use`, espera tu `tool_result`, y solo entonces decide si llamar a otra tool. Esto pasa cuando la segunda tool depende del resultado de la primera.
</terminology>

### Cómo responder con múltiples tool_results

En el mensaje siguiente (`role: "user"`), devolvés **todos los `tool_result` blocks dentro de un único content array**:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_A",
      "content": "{\"temperature\": 18, \"conditions\": \"clear\"}"
    },
    {
      "type": "tool_result",
      "tool_use_id": "toolu_B",
      "content": "{\"time\": \"2026-04-12T23:45+09:00\"}"
    }
  ]
}
```

**Reglas:**
- Un único mensaje `user` con todos los tool_result blocks.
- Cada `tool_use_id` debe matchear su tool_use correspondiente.
- El orden de los tool_result blocks NO tiene que coincidir con el orden de los tool_use — el ID es lo que los emparreja.
- Si olvidás uno solo, la API devuelve error.

### Cuándo el modelo paraleliza y cuándo no

**Paraleliza** cuando:
- Las tools no tienen dependencia entre sí.
- El input de una no depende del output de la otra.
- Ejemplos: `get_weather(Tokio) + get_time(Tokio)`, `get_user(123) + get_orders(123)`.

**No paraleliza** (secuencial) cuando:
- El output de la primera tool es input de la segunda.
- Ejemplo: `search_user(email) → id` y después `get_orders(id)`. El modelo primero llama `search_user`, espera el result, y recién entonces llama `get_orders`.

No hace falta que hagas nada especial para habilitar el paralelismo — es el comportamiento default. Vas a verlo aparecer naturalmente cuando las tools sean ortogonales.

### Ejecutar en paralelo en tu código

Si el modelo propuso 2 tool_use, tu código puede ejecutarlas en paralelo con `Promise.all` (o `asyncio.gather` en Python):

```typescript
const toolUseBlocks = resp.content.filter((b: any) => b.type === "tool_use");

const results = await Promise.all(
  toolUseBlocks.map(async (block) => {
    const output = await executeTool(block.name, block.input);
    return {
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: JSON.stringify(output),
    };
  })
);

messages.push({ role: "user", content: results });
```

Esto aprovecha el paralelismo del modelo en tu lado: no hay razón para ejecutar `get_weather` y `get_time` en serie si son independientes.

### disable_parallel_tool_use

Si querés **forzar al modelo a emitir un solo tool_use por turno**, pasá:

```json
{
  "tool_choice": {
    "type": "auto",
    "disable_parallel_tool_use": true
  }
}
```

Combinable con `auto`, `any` o `tool`. Útil cuando:
- Tus tools tienen efectos secundarios y querés auditar una a la vez.
- La segunda tool normalmente depende del resultado de la primera, y no querés que el modelo "se adelante".
- Estás debugeando y necesitás determinismo.

**Default**: `false` (paralelismo permitido).

## Ejecución real

**Request con 2 tools independientes:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather for a city.",
        "input_schema": {
          "type": "object",
          "properties": {"city": {"type": "string"}},
          "required": ["city"]
        }
      },
      {
        "name": "get_time",
        "description": "Get current local time for a city.",
        "input_schema": {
          "type": "object",
          "properties": {"city": {"type": "string"}},
          "required": ["city"]
        }
      }
    ],
    "messages": [
      {"role": "user", "content": "¿Qué clima y hora hay en Tokio?"}
    ]
  }'
```

Respuesta real:
```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01TJ...",
      "name": "get_weather",
      "input": {"city": "Tokyo"}
    },
    {
      "type": "tool_use",
      "id": "toolu_015jr...",
      "name": "get_time",
      "input": {"city": "Tokyo"}
    }
  ],
  "stop_reason": "tool_use",
  "usage": { "input_tokens": 629, "output_tokens": 90 }
}
```

**Dos tool_use blocks en un solo turno**. Observá: el modelo "entendió" que ambas tools son independientes y las propuso juntas.

**Paso 2 — Ejecutar ambas en paralelo y responder:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "tools": [ ... mismas tools ... ],
    "messages": [
      {"role": "user", "content": "¿Qué clima y hora hay en Tokio?"},
      {
        "role": "assistant",
        "content": [
          {"type": "tool_use", "id": "toolu_01TJ...", "name": "get_weather", "input": {"city": "Tokyo"}},
          {"type": "tool_use", "id": "toolu_015jr...", "name": "get_time", "input": {"city": "Tokyo"}}
        ]
      },
      {
        "role": "user",
        "content": [
          {"type": "tool_result", "tool_use_id": "toolu_01TJ...", "content": "{\"temp\": 18, \"conditions\": \"clear\"}"},
          {"type": "tool_result", "tool_use_id": "toolu_015jr...", "content": "{\"time\": \"23:45 JST\"}"}
        ]
      }
    ]
  }'
```

Respuesta final:
```json
{
  "content": [{
    "type": "text",
    "text": "En Tokio hay 18°C con cielo despejado y son las 23:45 hora local (JST)."
  }],
  "stop_reason": "end_turn"
}
```

**Paso 3 — Loop completo con paralelización**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

function getWeather(city: string) {
  return { temp: 18, conditions: "clear", city };
}
function getTime(city: string) {
  return { time: "23:45 JST", city };
}

async function executeTool(name: string, input: any) {
  // Cada tool puede tener su propia implementación asíncrona
  switch (name) {
    case "get_weather": return getWeather(input.city);
    case "get_time":    return getTime(input.city);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function runAgent(question: string) {
  const tools = [
    { name: "get_weather", description: "Get current weather.",
      input_schema: { type: "object" as const, properties: { city: { type: "string" } }, required: ["city"] } },
    { name: "get_time", description: "Get current local time.",
      input_schema: { type: "object" as const, properties: { city: { type: "string" } }, required: ["city"] } },
  ];

  const messages: any[] = [{ role: "user", content: question }];

  while (true) {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") {
      return (resp.content.find((b: any) => b.type === "text") as any)?.text ?? "";
    }

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter((b: any) => b.type === "tool_use");

      // Ejecutar todas en paralelo
      const results = await Promise.all(
        toolUses.map(async (block: any) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(await executeTool(block.name, block.input)),
        }))
      );

      messages.push({ role: "user", content: results });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${resp.stop_reason}`);
  }
}

console.log(await runAgent("¿Qué clima y hora hay en Tokio?"));
```

Output:
```
En Tokio hay 18°C con cielo despejado y son las 23:45 hora local (JST).
```

El `Promise.all` es la clave: si `get_weather` tarda 300ms y `get_time` tarda 200ms, el total es ~300ms, no 500ms.

## Anti-patterns

- ❌ **Ejecutar las tools en serie cuando el modelo las propuso en paralelo**. Desperdicia la optimización del modelo. Siempre usá `Promise.all` / `asyncio.gather`.
- ❌ **Responder con mensajes `user` separados por cada tool_result**. La API requiere que TODOS los tool_result del turno estén en un solo mensaje `user` con múltiples content blocks.
- ❌ **Olvidar algún tool_result**. Si el modelo emitió 3 tool_use, tu `user` message debe tener 3 tool_result. Omitir uno → error de API.
- ❌ **Mezclar orden y pensar que importa**. El matching se hace por `tool_use_id`, no por posición. El orden es libre — pero por legibilidad, matcheá el orden.
- ❌ **Usar `disable_parallel_tool_use: true` por reflejo**. Si tus tools son idempotentes y ortogonales, permitir paralelo reduce latencia y tokens (menos turnos).
- ❌ **Asumir que el modelo SIEMPRE paralelizará tools ortogonales**. Es un hint del modelo, no una garantía. A veces emite una sola. Tu loop debe funcionar en ambos casos.

## Recap

- El modelo puede emitir varios `tool_use` blocks en el mismo turno cuando las tools son independientes.
- Respondés con UN solo mensaje `user` que contiene todos los `tool_result` blocks, matcheados por `tool_use_id`.
- Ejecutá las tools en paralelo (`Promise.all` / `asyncio.gather`) para aprovechar la optimización.
- `disable_parallel_tool_use: true` fuerza 1 tool_use por turno — solo usalo si hay dependencias o efectos secundarios delicados.
- El patrón es transparente: **tu loop** con `filter(type === "tool_use")` + `Promise.all` funciona tanto con 1 como con N tools en paralelo.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use/implementation](https://platform.claude.com/docs/en/build-with-claude/tool-use/implementation)
**Ejercicio:** <!-- exercise:ex-05-03-multiple-tools -->
