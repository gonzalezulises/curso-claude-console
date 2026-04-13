# Optimizaciones: strict, defer_loading, cache_control

## Objetivo

Al terminar esta lección sabrás **3 optimizaciones beta clave para tools** — `strict` (valida el schema antes de ejecutar), `defer_loading` (no carga la definición de la tool a menos que sea necesaria), y `cache_control` (cachea las definiciones de tools para no pagar tokens en cada request). Cuándo usar cada una, qué impacto tienen en latencia/costo/robustez, y cómo combinarlas.

## Concepto

### El problema que optimizan

Cuando un agente tiene **muchas tools** (10, 30, 100+), tres problemas aparecen:

1. **Prompt inflado**: cada tool definition ocupa tokens, y se inyecta en **cada request**. 30 tools = varios miles de tokens fijos por llamada.
2. **Validación client-side**: el modelo puede devolver `input` que no matchea el schema (ej: faltar un required, type incorrecto). Sin validación, tu código crashea.
3. **Cold start en agentes largos**: en un loop multi-turn, estás pagando por las mismas tool definitions una y otra vez.

Las 3 optimizaciones de esta lección atacan cada uno:

| Problema | Optimización |
|----------|--------------|
| Schema drift | `strict: true` |
| Prompt inflado con tools raramente usadas | `defer_loading: true` |
| Tokens repetidos entre turnos | `cache_control` |

### 1. strict — validación estructurada garantizada

```json
{
  "name": "create_ticket",
  "description": "...",
  "strict": true,
  "input_schema": { ... }
}
```

Con `strict: true`:
- El modelo garantiza que el `input` del tool_use matchea el schema **exactamente**.
- No aparecen campos extra no definidos en `properties`.
- Todos los `required` están presentes.
- Los `enum` se respetan (no aparecen valores fuera del set).

<terminology>

**Costo**: `strict` tiene overhead de inferencia. Para tools triviales (1-2 parámetros), no lo necesitás. Para tools con schemas complejos, `strict` reemplaza a toda tu capa de validación Ajv/Zod.

**Limitación**: el schema debe usar un subset de JSON Schema soportado (`type`, `properties`, `required`, `enum`, sin `oneOf` exóticos). Consultá la docs cuando actives `strict`.

</terminology>

**Sin strict:**
```json
{
  "name": "create_ticket",
  "input": {
    "title": "bug",
    "priority": "super_urgent",   ← no está en el enum
    "extra_field": "hola"          ← no está en el schema
  }
}
```
Tu código tiene que validar, detectar, y re-promptear.

**Con strict:**
```json
{
  "input": {
    "title": "bug",
    "priority": "urgent"   ← valor del enum
  }
}
```
Garantizado por el modelo.

### 2. defer_loading — tools bajo demanda

```json
{
  "name": "rare_admin_tool",
  "description": "...",
  "defer_loading": true,
  "input_schema": { ... }
}
```

Con `defer_loading: true`, la definición completa de la tool **NO se inyecta al system prompt por default**. El modelo solo ve una versión mínima (name + description corta). Si al modelo le parece relevante, pide "cargar" la definición completa — entonces Anthropic la inyecta y el modelo puede usarla.

**Caso de uso**: agentes con catálogos grandes de tools (ej: 200 tools cliente, Claude Code con 50+ skills).

**Beneficio**: no pagás tokens por tools que probablemente no vas a usar en este turno.

**Costo**: latencia — si la tool sí es necesaria, el modelo necesita un round-trip interno para cargarla.

**Regla**: usá `defer_loading: true` para tools con baja probabilidad de uso, y `false` (default) para tools frecuentes.

### 3. cache_control — cachear tool definitions

```json
{
  "tools": [
    { "name": "tool_a", "description": "...", "input_schema": {...} },
    { "name": "tool_b", "description": "...", "input_schema": {...} },
    {
      "name": "tool_c",
      "description": "...",
      "input_schema": {...},
      "cache_control": { "type": "ephemeral", "ttl": "5m" }
    }
  ]
}
```

El `cache_control` sobre la **última** tool del array marca un "cache breakpoint": todo el prefix (system prompt + tools hasta ese punto) se cachea. En requests siguientes dentro del TTL, Anthropic reusa el cache y te cobra **una fracción de los tokens** (cache hit).

<terminology>

**`type: "ephemeral"`**: tipo de cache (el único soportado hoy).
**`ttl`**: `"5m"` (default) o `"1h"`. El `"1h"` es beta — header `anthropic-beta: extended-cache-ttl-2025-04-11`.
**Breakpoint**: el `cache_control` puede ir en tools, system prompt, user messages o assistant messages. El patrón canónico: poner uno en tools (para cachear las definiciones fijas) y otro en system (para cachear instrucciones fijas).

</terminology>

**Cuándo cachea**:
- Segunda request con el mismo prefix exacto dentro del TTL.
- Contador de tokens: aparece `usage.cache_creation_input_tokens` (primera vez) y luego `usage.cache_read_input_tokens` (hits siguientes, cobrados al ~10%).

**Cuándo NO cachea**:
- Cambiaste cualquier tool (order, name, description, schema).
- TTL expiró.
- El prefix es distinto en bytes.

### Combinar las 3

Un agente profesional típicamente combina:

```json
{
  "tools": [
    {
      "name": "common_tool",
      "strict": true,
      "input_schema": {...}
    },
    {
      "name": "rare_admin_tool",
      "defer_loading": true,
      "input_schema": {...}
    },
    {
      "name": "last_tool",
      "strict": true,
      "input_schema": {...},
      "cache_control": { "type": "ephemeral", "ttl": "1h" }
    }
  ]
}
```

- Tools frecuentes → `strict` para validación gratis.
- Tools raras → `defer_loading` para no pagar tokens siempre.
- Último del array → `cache_control` para cachear todo el prefix.

## Ejecución real

> **Nota:** output abreviado — el efecto de estas optimizaciones se observa en `usage` (cache_read_input_tokens, cache_creation_input_tokens) y en la validación del input. No hay cambio en la shape del content.

**Request con strict + cache_control:**

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
        "name": "extract_contact",
        "description": "Extract contact info from text.",
        "strict": true,
        "input_schema": {
          "type": "object",
          "properties": {
            "name": {"type": "string"},
            "email": {"type": "string"},
            "phone": {"type": "string"}
          },
          "required": ["name", "email"]
        },
        "cache_control": {"type": "ephemeral", "ttl": "5m"}
      }
    ],
    "tool_choice": {"type": "tool", "name": "extract_contact"},
    "messages": [
      {"role": "user", "content": "Contactate con Mariana Lopez al mariana@example.com"}
    ]
  }'
```

Response (primera vez — cache miss):
```json
{
  "content": [{
    "type": "tool_use",
    "id": "toolu_...",
    "name": "extract_contact",
    "input": { "name": "Mariana Lopez", "email": "mariana@example.com" }
  }],
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 50,
    "cache_creation_input_tokens": 420,
    "cache_read_input_tokens": 0,
    "output_tokens": 60
  }
}
```

Request 2, idéntica salvo por el mensaje user (dentro del TTL):

```json
{
  "usage": {
    "input_tokens": 55,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 420,
    "output_tokens": 60
  }
}
```

**`cache_read_input_tokens: 420`** → te cobran esos a un ~10% del precio normal. Ahorro real.

### Medir el ahorro

```typescript
const resp = await client.messages.create({...});

const cacheCreation = resp.usage.cache_creation_input_tokens ?? 0;
const cacheRead = resp.usage.cache_read_input_tokens ?? 0;
const inputTokens = resp.usage.input_tokens ?? 0;

console.log(`Cache creation: ${cacheCreation}`);
console.log(`Cache read (90% cheaper): ${cacheRead}`);
console.log(`Uncached input: ${inputTokens}`);
```

En un agente con 50 tools y 20 turnos, el cache_control reduce costo típicamente **30-60%**.

## Anti-patterns

- ❌ **Activar `strict: true` por defecto en tools con schemas inestables**. Si todavía estás iterando el schema, `strict` te fuerza a rigidez prematura. Prendelo cuando el schema esté consolidado.
- ❌ **Usar `defer_loading` para la tool principal del agente**. Si es la que usás en el 80% de turnos, paga el hit del load cada vez. `defer_loading` es para la "long tail".
- ❌ **Poner `cache_control` en cada tool del array**. Solo el último breakpoint cuenta para cachear el prefix completo. Multiples breakpoints = multiples cache levels (complica mucho; solo lo vas a querer en casos avanzados).
- ❌ **Olvidar que cualquier cambio al prefix invalida el cache**. Reordenar tools, cambiar una description, agregar una tool al medio → cache invalidado. El orden y contenido deben ser idénticos entre requests.
- ❌ **Mezclar `ttl: "1h"` sin el beta header**. Requiere `anthropic-beta: extended-cache-ttl-2025-04-11`. Sin eso, el TTL se silencia a 5m.
- ❌ **Asumir que `strict` reemplaza toda validación**. Valida schema, pero NO valida lógica (ej: `email` con `format: "email"` garantiza sintaxis pero no que el email exista). Validación de negocio sigue siendo tuya.

## Recap

- **`strict: true`** — el modelo garantiza que el `input` del tool_use matchea el schema. Reemplaza gran parte de tu validación client-side.
- **`defer_loading: true`** — la definición completa solo se carga si el modelo la necesita. Ideal para agentes con muchas tools raramente usadas.
- **`cache_control: {type: "ephemeral", ttl: "5m"|"1h"}`** — cachea el prefix (tools + system). Segunda request con mismo prefix = tokens a ~10% del precio.
- Combinalas: `strict` en tools de schema estable, `defer_loading` en tools raras, `cache_control` en la última tool del array para cachear todo.
- Medí con `usage.cache_creation_input_tokens` y `usage.cache_read_input_tokens`.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use/implementation](https://platform.claude.com/docs/en/build-with-claude/tool-use/implementation) · [platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
**Ejercicio:** <!-- exercise:ex-05-02-schema-strict -->
