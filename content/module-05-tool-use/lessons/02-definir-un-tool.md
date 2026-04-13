# Definir un tool: name, description, input_schema

## Objetivo

Al terminar esta lección sabrás **cómo definir un tool correctamente** con los 3 campos obligatorios (`name`, `description`, `input_schema`), por qué la `description` es efectivamente parte del prompt, cómo escribir un `input_schema` JSON Schema Draft 2020-12 válido, y los patrones para diseñar tools que el modelo usa bien en la primera.

## Concepto

### La estructura mínima de un tool

```json
{
  "name": "get_weather",
  "description": "Get current weather for a city. Returns temperature in Celsius and conditions.",
  "input_schema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "City name, e.g. Buenos Aires"
      },
      "units": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "default": "celsius"
      }
    },
    "required": ["city"]
  }
}
```

<terminology>

**name**: identificador único. Debe matchear exactamente el nombre que devolvés en el `tool_use.name` y que usás en `tool_result`. Snake_case por convención, ASCII, sin espacios.

**description**: **parte del prompt efectivo**. El modelo la lee para decidir cuándo usar la tool. Una descripción vaga = el modelo la usa en casos incorrectos o no la usa cuando debería. Invertí tiempo acá.

**input_schema**: JSON Schema Draft 2020-12 para los argumentos. `type: "object"` obligatorio. `properties` describe cada campo. `required` lista los obligatorios. Claude valida sus propuestas contra este schema.

</terminology>

### La description es parte del prompt

Esta es la regla más importante de la lección.

Cuando enviás `tools[]` en el request, Anthropic inyecta las definiciones en el system prompt efectivo. El modelo **lee** tu description para decidir:
- ¿Qué hace esta tool?
- ¿Cuándo es relevante usarla?
- ¿Qué esperar como resultado?

**Mal description:**
```
"description": "Weather tool"
```
El modelo no sabe si devuelve el pronóstico, la temperatura actual, o algo específico. Va a adivinar y fallar.

**Buen description:**
```
"description": "Get CURRENT weather (not forecast) for a city. Returns a JSON object with: temperature (Celsius by default), conditions (string like 'sunny' or 'rainy'), humidity (percent), and wind_kmh. Use this when the user asks about weather RIGHT NOW — not for forecasts or historical data."
```

<warning>

**Regla del pulgar**: si tu description no le diría a un developer junior cuándo y cómo usar la función, no le dice al modelo tampoco. Tratá la description como documentación de una API pública.

</warning>

### JSON Schema: lo que importa

JSON Schema tiene muchas features. Para tools, las más útiles son:

**Types básicos:**
```json
{"type": "string"}
{"type": "number"}
{"type": "integer"}
{"type": "boolean"}
{"type": "array", "items": {"type": "string"}}
{"type": "object", "properties": {...}}
```

**Enums (constrain valores):**
```json
{
  "type": "string",
  "enum": ["pending", "approved", "rejected"]
}
```

**Descriptions por campo:**
```json
{
  "ticker": {
    "type": "string",
    "description": "Stock ticker symbol (e.g., AAPL, MSFT). Uppercase only."
  }
}
```

**Formatos y patterns:**
```json
{
  "email": {"type": "string", "format": "email"},
  "date": {"type": "string", "format": "date"},
  "phone": {"type": "string", "pattern": "^\\+?[0-9]{7,15}$"}
}
```

**Nested objects:**
```json
{
  "address": {
    "type": "object",
    "properties": {
      "street": {"type": "string"},
      "city": {"type": "string"},
      "zip": {"type": "string"}
    },
    "required": ["street", "city"]
  }
}
```

**Required list:**
```json
{
  "type": "object",
  "properties": {
    "query": {"type": "string"},
    "limit": {"type": "integer", "default": 10}
  },
  "required": ["query"]
}
```

### Descriptions por campo también son prompt

No solo la tool tiene description — **cada campo también puede tener la suya**. El modelo las lee:

```json
{
  "city": {
    "type": "string",
    "description": "City name in English (e.g., 'Buenos Aires', not 'bs as'). Spell out fully — no abbreviations."
  }
}
```

Esto reduce drift: el modelo pasa "Buenos Aires" consistentemente, no "BA" en una request y "Buenos Aires" en otra.

### Diseño: tools atómicas vs tools compuestas

Hay dos filosofías:

**Tools atómicas (recomendado para empezar):**
```
- get_user(id)
- get_orders(user_id)
- send_email(to, body)
```
Cada tool hace una cosa. El modelo encadena varias si necesita. Fácil de mantener, fácil de testear.

**Tools compuestas:**
```
- notify_user_about_orders(user_id, template)
  // internamente: get_user + get_orders + send_email
```
Menos tokens (el modelo no itera), más control del flujo, pero menos flexible.

**Regla**: empezá atómico. Si notás que Claude siempre encadena A→B→C en el mismo orden, entonces crea una tool compuesta `do_abc`.

## Ejecución real

**Paso 1 — Una tool simple**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 500,
  tools: [{
    name: "get_weather",
    description: "Get current weather for a city. Returns temperature in Celsius and conditions.",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. Buenos Aires" },
        units: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          default: "celsius",
        },
      },
      required: ["city"],
    },
  }],
  messages: [
    { role: "user", content: "¿Cómo está el clima en Buenos Aires ahora?" },
  ],
});

console.log(JSON.stringify(resp.content, null, 2));
```

Output real:
```json
[
  {
    "type": "tool_use",
    "id": "toolu_01XmVphSH9SgDsFPKD29oHWQ",
    "name": "get_weather",
    "input": { "city": "Buenos Aires" }
  }
]
```

Observá: el modelo respetó el schema. Pasó `city` (required) pero omitió `units` (tiene default, no era necesario).

**Paso 2 — Una tool con schema más rico**

```typescript
const tool = {
  name: "create_ticket",
  description: "Create a support ticket in the system. Use this when the user reports a problem that requires tracking (not for general questions).",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short summary of the issue (under 80 chars).",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
        description: "low=cosmetic, medium=normal bug, high=blocker, urgent=production down",
      },
      category: {
        type: "string",
        enum: ["billing", "technical", "account", "other"],
      },
      description: {
        type: "string",
        description: "Full description of the problem, including any error messages.",
      },
      contact_email: {
        type: "string",
        format: "email",
      },
    },
    required: ["title", "priority", "category", "description"],
  },
};
```

Las descriptions por enum value (`low=cosmetic, medium=normal bug, ...`) son gold — el modelo elige mejor la priority correcta.

**Paso 3 — Validar el schema antes de mandar**

```typescript
// Usá Ajv o similar para validar que tu input_schema es JSON Schema válido
import Ajv from "ajv";

const ajv = new Ajv({ strict: true });
const valid = ajv.validateSchema(tool.input_schema);

if (!valid) {
  console.error("Invalid schema:", ajv.errors);
  throw new Error("Fix the schema before sending.");
}
```

La API de Anthropic también valida, pero un check local te ahorra una roundtrip.

## Anti-patterns

- ❌ **Description de una línea genérica**. `"description": "Busca cosas"` → el modelo usa la tool en casos aleatorios. Invertí en descriptions ricas.
- ❌ **Sin descriptions por campo**. Sin eso, el modelo "adivina" qué poner en cada campo. Documentá cada property, especialmente las ambiguas.
- ❌ **Enums sin descripciones**. `enum: ["a", "b", "c"]` — ¿qué significa cada uno? Agregá `description` al enum o explícalo en la description del campo.
- ❌ **Usar types como `"any"` o dejar campos sin type**. JSON Schema requiere types. Sin type = el modelo improvisa.
- ❌ **Tools con 20 parámetros**. Si tu tool tiene 20 parámetros, probablemente son 3-4 tools distintas. Dividí.
- ❌ **Name con espacios o caracteres especiales**. Usá snake_case ASCII. `"get user info"` rompe — usá `"get_user_info"`.

## Recap

- Un tool tiene 3 campos obligatorios: `name`, `description`, `input_schema`.
- **La `description` es parte del prompt** — escribila con detalle suficiente para que un dev junior entienda cuándo usarla.
- `input_schema` es JSON Schema Draft 2020-12 con `type: "object"`.
- Usá `enum`, `format`, `pattern`, y `description` por campo para reducir ambigüedad.
- **Empezá con tools atómicas**; creá tools compuestas solo si ves patrones de encadenamiento fijo.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use](https://platform.claude.com/docs/en/build-with-claude/tool-use)
**Ejercicio:** <!-- exercise:ex-05-01-primer-tool -->
