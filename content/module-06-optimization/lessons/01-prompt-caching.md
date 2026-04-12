# Prompt caching: cómo funciona y cuánto ahorra

## Objetivo

Al terminar esta lección sabrás **usar `cache_control: {type: "ephemeral"}`** para cachear prefixes de prompts, cuándo se genera el cache (write) vs cuándo se reusa (read), cómo interpretar `cache_creation_input_tokens` y `cache_read_input_tokens` en `usage`, y qué ahorro real esperar (lecturas a ~10% del precio normal).

## Concepto

### El problema: pagás el mismo prompt N veces

En un agente o una aplicación LLM real, el prompt suele tener 2 partes:

```
[ SYSTEM PROMPT GIGANTE — estable ]
  "Eres un analista financiero senior. Reglas: 1... 2... 3...
   Formato de salida: ... Ejemplos: ..."

[ CONTENIDO VARIABLE ]
  "Analizá el balance de ACME del Q4 2025..."
```

El system prompt puede tener 5K, 30K, incluso 100K tokens (instrucciones + ejemplos + docs de referencia). Y lo reenviás **en cada request**. Son tokens de input pagados de nuevo y de nuevo.

**Prompt caching** le dice a Anthropic: "este prefix no va a cambiar — guardalo y reutilizalo entre requests". La próxima request con el mismo prefix paga ~10% del costo normal por la parte cacheada.

### Los números (abril 2026)

| Operación | Precio relativo | Nota |
|-----------|-----------------|------|
| Input token normal | 1.00x | baseline |
| **Cache write** (primera vez) | 1.25x | 25% overhead una sola vez |
| **Cache read** (siguientes) | **0.10x** | 90% más barato |

**Break-even**: pagar el write se recupera tras **~2 reads** dentro del TTL. Después de eso, todo es ahorro.

### Cómo activarlo: cache_control breakpoint

Podés marcar un bloque con `cache_control`, y Anthropic cachea **todo lo que está antes de ese breakpoint** (inclusive):

```json
{
  "system": [
    {
      "type": "text",
      "text": "<20 KB de instrucciones de sistema estables>",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    { "role": "user", "content": "Pregunta variable del usuario" }
  ]
}
```

<terminology>
**Breakpoint**: un `cache_control` sobre un content block. El block y todo lo anterior (tools, system previos, messages previos) se cachea hasta ese punto.

**Ephemeral**: único tipo soportado hoy. TTL default `5m`, opcional `1h` (beta — ver lección 03).

**Prefix match**: el cache hit requiere que los bytes del prefix sean **idénticos** al request original. Un carácter distinto → cache miss.
</terminology>

### Mínimos de tokens cacheables

No podés cachear un prompt chiquito — hay un **piso mínimo**:

| Modelo | Mínimo (tokens) |
|--------|-----------------|
| claude-haiku-4-5 | ~2048 |
| claude-sonnet-4-x | ~1024 |
| claude-opus-4-x | ~1024 |

Si el bloque a cachear es menor al mínimo, la API ignora el `cache_control` silenciosamente — `cache_creation_input_tokens: 0` en el response. Diseñá tu prefix para estar cómodamente sobre el mínimo.

### Leer el usage del response

Cada response trae:

```json
{
  "usage": {
    "input_tokens": 15,                  // tokens NO cacheados de esta request
    "cache_creation_input_tokens": 5409, // tokens que se cachearon ahora (write)
    "cache_read_input_tokens": 0,        // tokens que vinieron del cache (read)
    "output_tokens": 37,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 5409,
      "ephemeral_1h_input_tokens": 0
    }
  }
}
```

**Interpretar**:
- **`input_tokens`** es ahora solo los tokens **NO cacheados** de la request actual (típicamente el mensaje del user variable).
- **`cache_creation_input_tokens > 0`** → primera request o TTL expiró. Cobrás 1.25x.
- **`cache_read_input_tokens > 0`** → cache hit. Cobrás 0.10x sobre esos tokens.

### Múltiples breakpoints (hasta 4)

Podés tener hasta **4 breakpoints** por request:

```json
{
  "tools": [ ..., { "cache_control": {"type": "ephemeral"} } ],  // breakpoint 1
  "system": [ { "text": "...", "cache_control": {"type": "ephemeral"} } ],  // breakpoint 2
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "...", "cache_control": {"type": "ephemeral"} }] },  // breakpoint 3
    { "role": "assistant", "content": "..." },
    { "role": "user", "content": "pregunta actual" }
  ]
}
```

Cada breakpoint define un nivel de cache separado. Útil para cachear diferentes slices: tools fijas (1), system estable (2), historia conversacional hasta un punto (3).

**Regla**: empezá con 1 breakpoint (al final del prefix estable). Solo agregá más cuando hayas medido y el patrón lo justifique.

### Qué invalida el cache

- Cualquier cambio en los bytes del prefix (una coma, un espacio, cambio de modelo).
- TTL expirado (5m sin uso — el TTL se extiende automáticamente en cada hit).
- Cambio del `tool_choice`, `temperature`, u otros params que afectan inferencia.

## Ejecución real

**Request con cache_control en system:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 50,
    "system": [{
      "type": "text",
      "text": "<bloque largo de ~5400 tokens de instrucciones estables>",
      "cache_control": {"type": "ephemeral"}
    }],
    "messages": [{"role": "user", "content": "Summarize your role in one line."}]
  }'
```

Response real, **3 calls consecutivas** con el mismo payload:

```
CALL 1: input=15  write=0  read=5409   (cache hit — segundo use en ventana)
CALL 2: input=15  write=0  read=5409   (cache hit)
CALL 3: input=15  write=0  read=5409   (cache hit)
```

Observá:
- `input_tokens: 15` → solo el user message ("Summarize your role in one line"). El system de 5400 tokens NO cuenta como input normal.
- `cache_read_input_tokens: 5409` → esos 5400 tokens vinieron del cache, cobrados a 0.10x.
- En la **primerísima** request (antes del experimento), el output sería `write=5409, read=0`.

**Cálculo del ahorro** (sobre Haiku 4.5, prices ilustrativos):
```
Sin cache, 100 calls × 5409 tokens × $1/M input = $0.54
Con cache (1 write + 99 reads):
  write: 1 × 5409 × 1.25 × $1/M = $0.0068
  reads: 99 × 5409 × 0.10 × $1/M = $0.0535
  total ~$0.060 — ahorro ~89%
```

**TypeScript:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const systemText = "You are a professional financial analyst. " + "...".repeat(500);

for (let i = 1; i <= 5; i++) {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 50,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `Iteration ${i}: describe your role.` }],
  });

  const u: any = resp.usage;
  console.log(`call ${i}: input=${u.input_tokens} write=${u.cache_creation_input_tokens} read=${u.cache_read_input_tokens}`);
}
```

Output típico:
```
call 1: input=15 write=5409 read=0     ← primera vez: write
call 2: input=15 write=0    read=5409  ← cache hit
call 3: input=15 write=0    read=5409
call 4: input=15 write=0    read=5409
call 5: input=15 write=0    read=5409
```

## Anti-patterns

- ❌ **Meter un timestamp o UUID al inicio del prompt**. Si el prefix cambia cada request, nunca hay cache hit. Poné lo variable al final del user message.
- ❌ **Cachear bloques debajo del mínimo** (ej. 500 tokens en haiku). La API ignora silenciosamente el `cache_control`. Asegurate de que el bloque esté sobre el mínimo del modelo.
- ❌ **Esperar cache hit cross-modelo**. El cache es por `model` exacto. Cambiar de `claude-haiku-4-5` a `claude-sonnet-4-6` = cache miss garantizado.
- ❌ **Usar cache_control "por las dudas" en todo**. Tiene overhead 1.25x en writes. Si el prompt varía en cada request, cacheás de gusto y pagás más.
- ❌ **Asumir TTL de 5m = "al menos 5m"**. Si nadie llama al mismo prefix en 5m, el cache se desaloja. El TTL se **extiende** en cada hit, no se resetea desde la creación.
- ❌ **No medir**. `cache_read_input_tokens` en el response es tu instrumento. Si después de aplicar cache tu read sigue en 0, hay un bug (prefix distinto, bloque chico, etc.).

## Recap

- `cache_control: {type: "ephemeral"}` marca un breakpoint — todo lo anterior se cachea.
- **Reads cuestan ~10% del input normal**; writes cuestan 1.25x una sola vez.
- Break-even a ~2 reads; desde ahí todo es ahorro.
- Mínimos: 1024 tokens en Sonnet/Opus, 2048 en Haiku.
- Hasta 4 breakpoints por request.
- Medí con `usage.cache_creation_input_tokens` y `usage.cache_read_input_tokens`.
- Cualquier cambio en el prefix byte-a-byte invalida el cache.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
**Ejercicio:** <!-- exercise:ex-06-01-cache-basico -->
