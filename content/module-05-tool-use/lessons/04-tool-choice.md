# tool_choice: auto, any, forzar un tool

## Objetivo

Al terminar esta lección sabrás **usar el parámetro `tool_choice`** para controlar si el modelo elige cuándo usar tools (`auto`), debe usar alguna (`any`), o debe usar un tool específico (`{type: "tool", name: "..."}`). Vas a entender cuándo cada modo es apropiado y por qué **forzar un tool es el patrón canónico para extracción estructurada**.

## Concepto

### Los 3 modos de tool_choice

```typescript
// 1. auto (default) — el modelo decide
tool_choice: { type: "auto" }

// 2. any — el modelo DEBE usar alguna tool (no puede responder solo con texto)
tool_choice: { type: "any" }

// 3. tool específico — el modelo DEBE usar esa tool concreta
tool_choice: { type: "tool", name: "extract_contact" }
```

<terminology>
**auto**: el modelo decide. Si la pregunta requiere una tool, la usa. Si no, responde con texto normal. Default cuando pasás `tools[]` sin `tool_choice`.

**any**: el modelo está obligado a usar **alguna** de las tools disponibles, no puede responder con texto libre. Útil cuando sabés que la respuesta correcta siempre involucra una tool, pero no te importa cuál.

**tool específico**: el modelo está obligado a usar **esa tool exacta**. Útil para extracción estructurada — querés forzar el shape de la respuesta.
</terminology>

### Cuándo usar cada modo

**auto** — conversacional, agentes generales:
```
"¿Cuánto es 2+2?" → modelo responde directo "4" (sin tool)
"¿Cuánto gasté en marzo?" → modelo usa get_expenses
```

**any** — pipelines donde la respuesta siempre requiere acción:
```
Sistema de tickets: el usuario siempre quiere crear/buscar/cerrar un ticket.
No querés que Claude responda "entendido, te ayudo" — querés que
siempre invoque una tool del sistema.
```

**tool específico** — extracción estructurada:
```
"Contactate con Mariana Lopez al mariana@example.com"
→ forzar tool extract_contact → obtenés {name, email, phone} como JSON.
```

### El patrón "tool_choice para extracción estructurada"

Este es el más importante de la lección. Es **la forma oficial de obtener JSON garantizado** de Claude.

**Sin tool_choice (mal):**
```
user: "Extraé nombre y email de: 'Contactate con Mariana Lopez al mariana@example.com'"
→ modelo responde:
   "El nombre es Mariana Lopez y el email es mariana@example.com"
```
Texto libre. Necesitás parsearlo, lidiar con variaciones, etc.

**Con tool_choice específico (bien):**
```
tool: extract_contact con schema {name, email, phone}
tool_choice: {type: "tool", name: "extract_contact"}
user: "Contactate con Mariana Lopez al mariana@example.com"
→ modelo responde tool_use con:
   input: {name: "Mariana Lopez", email: "mariana@example.com"}
```
JSON perfecto, validado contra tu schema. Este es el método canónico, superior a pedirle "responde en JSON" en el prompt.

### disable_parallel_tool_use

Un campo adicional en `tool_choice`:

```json
{
  "type": "auto",
  "disable_parallel_tool_use": true
}
```

Cuando `true`, fuerza al modelo a emitir **un solo `tool_use` por turno** (no varios en paralelo). Útil cuando tus tools tienen dependencias o efectos secundarios que no querés en paralelo.

Por default es `false` — el modelo puede emitir varios tool_use en un turno si lo considera útil (ver lección 05).

## Ejecución real

**Paso 1 — tool_choice: "auto" (default)**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 300,
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
      {"role": "user", "content": "¿Cuánto es 15 + 27?"}
    ]
  }'
```

Respuesta (modelo decide NO usar la tool):
```json
{
  "content": [{
    "type": "text",
    "text": "15 + 27 = 42"
  }],
  "stop_reason": "end_turn"
}
```

El modelo ignoró la tool porque la pregunta no tiene que ver con weather.

**Paso 2 — tool_choice: forzar extracción estructurada**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "tool_choice": {"type": "tool", "name": "extract_contact"},
    "tools": [{
      "name": "extract_contact",
      "description": "Extract name, email, and phone from text.",
      "input_schema": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "email": {"type": "string"},
          "phone": {"type": "string"}
        },
        "required": ["name", "email"]
      }
    }],
    "messages": [
      {"role": "user", "content": "Contactate con Mariana Lopez al mail mariana@example.com o al +5491122334455"}
    ]
  }'
```

Respuesta (real):
```json
{
  "content": [{
    "type": "tool_use",
    "id": "toolu_01Y5EsCcnY2SooQTzpMuDNNB",
    "name": "extract_contact",
    "input": {
      "name": "Mariana Lopez",
      "email": "mariana@example.com",
      "phone": "+5491122334455"
    }
  }],
  "stop_reason": "tool_use",
  "usage": { "input_tokens": 704, "output_tokens": 80 }
}
```

Obtuviste JSON estructurado garantizado. No hay respuesta de texto, solo el tool_use con el input perfectamente tipado.

**Paso 3 — Patrón completo de extracción**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface Contact {
  name: string;
  email: string;
  phone?: string;
}

async function extractContact(text: string): Promise<Contact> {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    tool_choice: { type: "tool", name: "extract_contact" },
    tools: [{
      name: "extract_contact",
      description: "Extract contact info from text. Always call this tool.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name" },
          email: { type: "string", format: "email" },
          phone: { type: "string", description: "E.164 format preferred" },
        },
        required: ["name", "email"],
      },
    }],
    messages: [{ role: "user", content: text }],
  });

  // Como forzamos el tool, el primer block siempre es tool_use
  const toolUse = resp.content.find((b: any) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Expected tool_use in response");
  }

  return toolUse.input as unknown as Contact;
}

const contact = await extractContact(
  "Contactate con Mariana Lopez al mariana@example.com o al +5491122334455"
);
console.log(contact);
// { name: "Mariana Lopez", email: "mariana@example.com", phone: "+5491122334455" }
```

Este patrón reemplaza todo uso de "responde en JSON" + parseo frágil. El schema JSON te garantiza los campos y tipos.

**Paso 4 — tool_choice: "any"**

```json
{
  "tool_choice": {"type": "any"},
  "tools": [
    {"name": "create_ticket", ...},
    {"name": "search_tickets", ...},
    {"name": "close_ticket", ...}
  ],
  "messages": [
    {"role": "user", "content": "Hola, tengo un problema con mi factura"}
  ]
}
```

El modelo DEBE usar una de las 3 tools (no puede responder "entiendo, te ayudo"). Probablemente elija `create_ticket` dado el contexto.

## Anti-patterns

- ❌ **Forzar un tool cuando el modelo debería decidir**. Si tu tool es opcional (ej: "busca si es necesario"), usá `auto`, no `tool`.
- ❌ **Pedirle JSON en el prompt en vez de usar tool_choice**. `"responde con {name, email}"` es frágil: formato inconsistente, claves renombradas, texto extra. Forzar un tool es superior.
- ❌ **Usar `any` cuando `auto` sirve**. `any` fuerza una tool incluso cuando no es apropiada. Solo usá `any` si todas tus tools son relevantes al dominio y no querés respuestas de texto libre.
- ❌ **Asumir que `tool_choice: "tool"` garantiza input válido**. Aún forzado, el modelo puede poner valores lógicamente incorrectos (ej: email mal formateado si no usás `format: "email"`). Validá siempre en tu código.
- ❌ **disable_parallel_tool_use siempre en true "por las dudas"**. Si tus tools son independientes (ej: get_weather + get_time), permitir paralelo reduce latencia. Solo desactivalo si hay orden requerido.

## Recap

- `tool_choice: {type: "auto"}` (default) — el modelo decide si usar tools.
- `tool_choice: {type: "any"}` — el modelo debe usar alguna tool.
- `tool_choice: {type: "tool", name: "X"}` — el modelo debe usar la tool X específicamente.
- **Patrón canónico de extracción estructurada**: forzar un tool cuyo `input_schema` es tu output deseado.
- `disable_parallel_tool_use: true` fuerza 1 tool_use por turno — usalo cuando hay dependencias entre tools.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use/implementation](https://platform.claude.com/docs/en/build-with-claude/tool-use/implementation)
**Ejercicio:** <!-- exercise:ex-05-04-tool-choice -->
