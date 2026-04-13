# Flujo completo mínimo: tool_use → tool_result

## Objetivo

Al terminar esta lección sabrás **implementar el loop completo de tool use**: recibir un `tool_use` block, ejecutar tu función local, devolverle el resultado al modelo como `tool_result`, y recibir la respuesta final. Vas a entender exactamente qué va en cada mensaje del historial.

## Concepto

### El loop en diagrama

```
[Tu código]                           [API Anthropic]
    │                                      │
    ├─ POST /v1/messages ──────────────────▶
    │  {                                    │
    │    messages: [                        │
    │      {role: "user", content: "..."}   │
    │    ],                                 │
    │    tools: [...]                       │
    │  }                                    │
    │                                      │
    │◀─────── response ────────────────────┤
    │  {                                    │
    │    content: [{                        │
    │      type: "tool_use",                │
    │      id: "toolu_xxx",                 │
    │      name: "get_weather",             │
    │      input: {city: "Tokio"}           │
    │    }],                                │
    │    stop_reason: "tool_use"            │
    │  }                                    │
    │                                      │
    ├─ Ejecutar get_weather("Tokio")       │
    │   → {temp: 22, conditions: "soleado"} │
    │                                      │
    ├─ POST /v1/messages ──────────────────▶
    │  {                                    │
    │    messages: [                        │
    │      {role: "user", content: "..."},  │
    │      {role: "assistant",              │
    │       content: [<tool_use block>]},   │
    │      {role: "user",                   │
    │       content: [{                     │
    │         type: "tool_result",          │
    │         tool_use_id: "toolu_xxx",     │
    │         content: "{\"temp\":22,...}"  │
    │       }]}                             │
    │    ],                                 │
    │    tools: [...]                       │
    │  }                                    │
    │                                      │
    │◀─────── response ────────────────────┤
    │  {                                    │
    │    content: [{                        │
    │      type: "text",                    │
    │      text: "En Tokio hay 22°C..."     │
    │    }],                                │
    │    stop_reason: "end_turn"            │
    │  }
```

### Las reglas del historial

El array `messages` crece a lo largo del loop:

<terminology>

**Mensaje 1** (`role: "user"`): tu pregunta original.

**Mensaje 2** (`role: "assistant"`): el turno del modelo con el `tool_use` block. **Debés incluir el content EXACTO que devolvió la API** — incluido el `id` del tool_use. Sin eso, el modelo no puede matchear el result.

**Mensaje 3** (`role: "user"`): un nuevo turno del user con el `tool_result` block. El `tool_use_id` debe matchear el `id` del tool_use previo.

**Mensaje 4** (`role: "assistant"`): la respuesta final del modelo, típicamente `type: "text"`, con `stop_reason: "end_turn"`.

</terminology>

### La estructura de tool_result

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01XmVphSH9SgDsFPKD29oHWQ",
      "content": "{\"temperature\": 22, \"conditions\": \"sunny\"}"
    }
  ]
}
```

**Campos:**
- `tool_use_id`: debe matchear el `id` del `tool_use` al que responde.
- `content`: el resultado. Puede ser string plano o array de content blocks (text, image, etc.).
- `is_error` (opcional): si `true`, el modelo entiende que la tool falló y puede intentar una estrategia alternativa.

Si la tool falló:
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xxx",
  "content": "Error: City 'Atlantis' not found in the weather service.",
  "is_error": true
}
```

### Cuándo el loop termina

El loop termina cuando el response tiene `stop_reason: "end_turn"`. Eso significa que el modelo no quiere llamar más tools y te está devolviendo la respuesta final (o pidiendo más info al usuario).

**Si `stop_reason: "tool_use"` aparece de nuevo**, significa que el modelo quiere llamar OTRA tool — tu código debe ejecutarla y continuar el loop. No hay límite arbitrario de cuántas vueltas da el loop.

### El runtime loop en pseudocódigo

```typescript
let messages = [{ role: "user", content: userQuestion }];

while (true) {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools,
    messages,
  });

  // Agregar la respuesta del assistant al historial
  messages.push({ role: "assistant", content: resp.content });

  if (resp.stop_reason === "end_turn") {
    // Listo — el modelo terminó
    return resp.content;
  }

  if (resp.stop_reason === "tool_use") {
    // Ejecutar cada tool_use y preparar los results
    const toolResults = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
    continue; // siguiente iteración del loop
  }

  // Otros stop_reasons: max_tokens, stop_sequence, etc.
  throw new Error(`Unexpected stop_reason: ${resp.stop_reason}`);
}
```

Este patrón es **el corazón** de cualquier agente construido sobre la API cruda.

## Ejecución real

**Paso 1 — Request inicial**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "tools": [{
      "name": "get_weather",
      "description": "Get current weather for a city.",
      "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }],
    "messages": [
      {"role": "user", "content": "¿Cómo está el clima en Buenos Aires?"}
    ]
  }'
```

Respuesta:
```json
{
  "content": [{
    "type": "tool_use",
    "id": "toolu_01XmVphSH9SgDsFPKD29oHWQ",
    "name": "get_weather",
    "input": { "city": "Buenos Aires" }
  }],
  "stop_reason": "tool_use"
}
```

**Paso 2 — Ejecutar la tool localmente** (simulamos el resultado):

```
get_weather("Buenos Aires") → {"temperature": 24, "conditions": "partly_cloudy"}
```

**Paso 3 — Request con el historial completo + tool_result**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "tools": [{
      "name": "get_weather",
      "description": "Get current weather for a city.",
      "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }],
    "messages": [
      {"role": "user", "content": "¿Cómo está el clima en Buenos Aires?"},
      {
        "role": "assistant",
        "content": [{
          "type": "tool_use",
          "id": "toolu_01XmVphSH9SgDsFPKD29oHWQ",
          "name": "get_weather",
          "input": {"city": "Buenos Aires"}
        }]
      },
      {
        "role": "user",
        "content": [{
          "type": "tool_result",
          "tool_use_id": "toolu_01XmVphSH9SgDsFPKD29oHWQ",
          "content": "{\"temperature\": 24, \"conditions\": \"partly_cloudy\"}"
        }]
      }
    ]
  }'
```

Respuesta (final):
```json
{
  "content": [{
    "type": "text",
    "text": "En Buenos Aires hay 24°C y está parcialmente nublado."
  }],
  "stop_reason": "end_turn"
}
```

**Paso 4 — El loop completo en TypeScript**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Tu función real (o una mock)
function getWeather(city: string) {
  return { temperature: 24, conditions: "partly_cloudy", city };
}

async function runAgent(userQuestion: string) {
  const tools = [{
    name: "get_weather",
    description: "Get current weather for a city.",
    input_schema: {
      type: "object" as const,
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  }];

  const messages: any[] = [{ role: "user", content: userQuestion }];

  while (true) {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") {
      const textBlock = resp.content.find((b: any) => b.type === "text");
      return textBlock ? (textBlock as any).text : "";
    }

    if (resp.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        const result = getWeather((block.input as any).city);
        toolResults.push({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
        console.log(`  → ejecutado ${block.name}(${JSON.stringify(block.input)})`);
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${resp.stop_reason}`);
  }
}

const answer = await runAgent("¿Cómo está el clima en Buenos Aires?");
console.log("Answer:", answer);
```

Output:
```
  → ejecutado get_weather({"city":"Buenos Aires"})
Answer: En Buenos Aires hay 24°C y está parcialmente nublado.
```


## Curl en vivo

Este es el mismo request que se muestra arriba. Presioná **Ejecutar** para revelar la respuesta real que capturé contra la API al escribir esta lección.

<LiveCurl id="m05-tool-use-weather" />

## Anti-patterns

- ❌ **Olvidar incluir el tool_use block en el historial**. Si mandás el `tool_result` sin el `tool_use` previo en `messages[role=assistant]`, la API devuelve error — el `tool_use_id` no existe en el historial.
- ❌ **Cambiar el tool_use_id**. El ID que generó el modelo debe devolverse tal cual en el tool_result. Inventar un ID distinto rompe el match.
- ❌ **No manejar el caso `stop_reason !== "tool_use"` en el primer turno**. Si el modelo decide que no necesita la tool, tu loop debe retornar sin ejecutar nada.
- ❌ **Asumir que va a haber solo una iteración**. El modelo puede encadenar 5 tools secuencialmente. Usá un loop, no un if.
- ❌ **No loggear los tool_use**. En prod, siempre loggeá `block.name` y `block.input` antes de ejecutar — es tu auditoría de qué propuso el modelo.
- ❌ **Pasar un stringified JSON pero no decir que es JSON**. Si en la description no aclaraste que el tool devuelve JSON, el modelo puede no parsearlo correctamente. Sé explícito.

## Recap

- El loop es: `tool_use` (modelo) → **tu código ejecuta** → `tool_result` → respuesta final.
- El historial debe contener **todos** los turnos: user → assistant(tool_use) → user(tool_result) → assistant(final).
- `tool_use_id` tiene que matchear exactamente.
- `stop_reason === "end_turn"` → listo. `stop_reason === "tool_use"` → seguí iterando.
- El runtime loop es tu responsabilidad con la API cruda — ese loop es lo que Managed Agents hace por vos después.


## Ejercicio interactivo

<Quiz id="ex-05-08-quiz-tool-use" />

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use/implementation](https://platform.claude.com/docs/en/build-with-claude/tool-use/implementation)
**Ejercicio:** <!-- exercise:ex-05-01-primer-tool -->
