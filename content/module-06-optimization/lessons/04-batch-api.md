# Batch API: 50% de precio, asíncrono

## Objetivo

Al terminar esta lección sabrás **submit un Message Batch con `/v1/messages/batches`**, pollear su status hasta `ended`, descargar los resultados JSONL, matchear resultados por `custom_id`, y entender cuándo la Batch API es claramente superior a requests síncronos (trabajos async, no interactivos, tolerantes a latencia).

## Concepto

### Qué es una Batch

Un **Message Batch** es un grupo de hasta 100K requests independientes que Anthropic procesa **en background**, a la mitad del precio de los requests síncronos regulares. No es para chat en vivo — es para workloads async como reports nocturnos, backfills, evaluaciones batch, generación masiva de embeddings de texto, etc.

**Trade-offs:**

| Aspecto | Syncs (`/messages`) | Batch (`/messages/batches`) |
|---------|--------------------|-----------------------------|
| Precio | 1.00x | **0.50x** |
| Latencia | ~1-10s por request | minutos a 24h |
| Garantía | ~inmediato | completion en ≤24h, típico 5-30 min |
| Uso | UI interactiva, agentes | reports, backfills, evals |

### La forma del request de creación

```bash
POST /v1/messages/batches
```

```json
{
  "requests": [
    {
      "custom_id": "q1",
      "params": {
        "model": "claude-haiku-4-5",
        "max_tokens": 100,
        "messages": [{"role": "user", "content": "Say hello in Japanese."}]
      }
    },
    {
      "custom_id": "q2",
      "params": {...}
    }
  ]
}
```

<terminology>
**`custom_id`**: identificador que vos elegís, único dentro de la batch. Los resultados pueden volver en orden arbitrario — usás el `custom_id` para matchearlos a tu input.

**`params`**: es un objeto idéntico al body de `/v1/messages` — mismos campos (`model`, `max_tokens`, `system`, `messages`, `tools`, etc.). Cada request dentro de la batch puede usar **distintos** modelos y parámetros.
</terminology>

Response inmediato:
```json
{
  "id": "msgbatch_01FAMeAJSnirsW9yZVpRWPNN",
  "type": "message_batch",
  "processing_status": "in_progress",
  "request_counts": {
    "processing": 3, "succeeded": 0, "errored": 0,
    "canceled": 0, "expired": 0
  },
  "created_at": "2026-04-12T21:15:09Z",
  "expires_at": "2026-04-13T21:15:09Z",
  "results_url": null
}
```

### Polling del status

```bash
GET /v1/messages/batches/{batch_id}
```

Respuestas a lo largo del tiempo:
```
processing_status: "in_progress"  → todavía trabajando
processing_status: "ended"        → listo, `results_url` aparece
processing_status: "canceling"    → se pidió cancel; en transición
```

**Regla**: no polleés más seguido que cada ~5-10 segundos. Anthropic no cobra por polling, pero la buena vibra es no hammer el endpoint.

Cuando `processing_status === "ended"`:
```json
{
  "processing_status": "ended",
  "request_counts": {"processing": 0, "succeeded": 3, "errored": 0, ...},
  "ended_at": "2026-04-12T21:17:46Z",
  "results_url": "https://api.anthropic.com/v1/messages/batches/msgbatch_.../results"
}
```

### Descargar resultados (JSONL)

```bash
GET /v1/messages/batches/{batch_id}/results
```

Devuelve **JSONL** (una línea por resultado):
```jsonl
{"custom_id":"q1","result":{"type":"succeeded","message":{...},"usage":{...}}}
{"custom_id":"q2","result":{"type":"succeeded","message":{...},"usage":{...}}}
{"custom_id":"q3","result":{"type":"succeeded","message":{...},"usage":{...}}}
```

Cada línea tiene:
- **`custom_id`**: tu identificador original.
- **`result.type`**: `"succeeded"`, `"errored"`, `"canceled"`, o `"expired"`.
- **`result.message`**: el response completo del `/v1/messages` (con content, stop_reason, usage). Solo si succeeded.
- **`result.error`**: objeto de error. Solo si errored.

**Importante**: los resultados **no** vienen en el mismo orden que los mandaste. Iterá y matcheá por `custom_id`.

### Límites y expiración

- Hasta **100,000 requests** por batch.
- Tamaño máximo del batch body: **256 MB**.
- La batch **expira a las 24h**. Descargá los resultados antes de eso — después de `archived_at`, los resultados ya no están disponibles.

### Cancelar una batch

```bash
POST /v1/messages/batches/{batch_id}/cancel
```

Marca la batch para cancel. Los requests ya in-flight al momento del cancel **pueden seguir completándose**; solo los que todavía estaban en cola se cancelan. `processing_status` va a `canceling` y eventualmente `ended`.

### Service tier: "batch"

En el `usage` de cada resultado vas a ver:
```json
{ "service_tier": "batch" }
```

Esa flag indica que la request se procesó como batch (50% price). Útil para auditoría de facturación.

### Combinable con prompt caching

La batch API + prompt caching se combinan **naturalmente**. Si 1000 requests comparten un system prompt idéntico, cachéalo:

```json
{
  "requests": [
    {
      "custom_id": "doc-001",
      "params": {
        "system": [{ "type": "text", "text": "<shared prefix>", "cache_control": {"type": "ephemeral"} }],
        "messages": [{"role": "user", "content": "Analizá el documento 001..."}],
        ...
      }
    },
    {
      "custom_id": "doc-002",
      "params": {
        "system": [{ "type": "text", "text": "<same shared prefix>", "cache_control": {"type": "ephemeral"} }],
        "messages": [{"role": "user", "content": "Analizá el documento 002..."}],
        ...
      }
    }
  ]
}
```

Anthropic cachea el prefix cuando procesa el batch — el primer request cobra write, los 999 siguientes cobran read. **Combinado**: 50% batch × 10% cache read = efectivo ~5% del precio sin optimizar. Brutal.

## Ejecución real

**Paso 1 — submit:**

```bash
curl -s https://api.anthropic.com/v1/messages/batches \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "requests": [
      {"custom_id":"q1","params":{"model":"claude-haiku-4-5","max_tokens":50,"messages":[{"role":"user","content":"Say hello in Japanese."}]}},
      {"custom_id":"q2","params":{"model":"claude-haiku-4-5","max_tokens":50,"messages":[{"role":"user","content":"Say hello in French."}]}},
      {"custom_id":"q3","params":{"model":"claude-haiku-4-5","max_tokens":50,"messages":[{"role":"user","content":"Say hello in Spanish."}]}}
    ]
  }'
```

Response:
```json
{
  "id": "msgbatch_01FAMeAJSnirsW9yZVpRWPNN",
  "processing_status": "in_progress",
  "request_counts": {"processing": 3, "succeeded": 0, "errored": 0, "canceled": 0, "expired": 0},
  "created_at": "2026-04-12T21:15:09Z"
}
```

**Paso 2 — polling (real):**

```
21:15:09 — status=in_progress  (recién creado)
21:15:24 — status=in_progress
...
21:17:46 — status=ended         (completó en 2m 37s)
  request_counts: {succeeded: 3, errored: 0, ...}
  results_url: https://api.anthropic.com/v1/messages/batches/msgbatch_.../results
```

3 requests triviales terminaron en ~2.5 min. Con 100 requests triviales esperá ~5-15 min típico.

**Paso 3 — resultados:**

```bash
curl -s https://api.anthropic.com/v1/messages/batches/msgbatch_.../results \
  -H "x-api-key: $ANTHROPIC_API_KEY"
```

Response (JSONL real):
```jsonl
{"custom_id":"q1","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"こんにちは (Konnichiwa)\n\nThis is the standard way to say \"hello\" in Japanese during the day."}],"usage":{"input_tokens":12,"output_tokens":32,"service_tier":"batch"}}}}
{"custom_id":"q2","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"Bonjour! (Hello!) or Salut! (Hi!)"}],"usage":{"input_tokens":12,"output_tokens":19,"service_tier":"batch"}}}}
{"custom_id":"q3","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"¡Hola!"}],"usage":{"input_tokens":12,"output_tokens":10,"service_tier":"batch"}}}}
```

Observá:
- Los 3 resultados, en el orden que vinieron (no necesariamente el orden de submit).
- `service_tier: "batch"` confirma el pricing 50%.
- `input_tokens + output_tokens` por request → facturás al 50% del precio estándar.

**TypeScript end-to-end:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// 1. submit
const batch = await client.messages.batches.create({
  requests: [
    { custom_id: "q1", params: { model: "claude-haiku-4-5", max_tokens: 50, messages: [{ role: "user", content: "Say hello in Japanese." }] } },
    { custom_id: "q2", params: { model: "claude-haiku-4-5", max_tokens: 50, messages: [{ role: "user", content: "Say hello in French." }] } },
  ],
});
console.log("submitted:", batch.id);

// 2. poll
let current = batch;
while (current.processing_status !== "ended") {
  await new Promise(r => setTimeout(r, 10_000));
  current = await client.messages.batches.retrieve(batch.id);
  console.log(`  poll: ${current.processing_status} ${JSON.stringify(current.request_counts)}`);
}

// 3. fetch and iterate results
for await (const entry of await client.messages.batches.results(batch.id)) {
  if (entry.result.type === "succeeded") {
    const text = (entry.result.message.content[0] as any).text;
    console.log(`${entry.custom_id}: ${text.slice(0, 60)}...`);
  } else {
    console.log(`${entry.custom_id}: ${entry.result.type}`);
  }
}
```

Output:
```
submitted: msgbatch_01FAMe...
  poll: in_progress {"processing":2,"succeeded":0,...}
  poll: in_progress {"processing":2,"succeeded":0,...}
  poll: in_progress {"processing":2,"succeeded":0,...}
  poll: ended {"processing":0,"succeeded":2,...}
q1: こんにちは (Konnichiwa)...
q2: Bonjour! (Hello!) or Salut...
```

## Anti-patterns

- ❌ **Usar Batch API para UX interactiva**. La batch puede tardar minutos a 24h. Si un usuario está esperando, usá requests síncronos.
- ❌ **Polling más seguido que cada 5s**. Amable con la API; además, el status cambia pocas veces por minuto — no vas a acelerar nada.
- ❌ **No matchear por custom_id**. Los resultados llegan en orden arbitrario. Si asumís orden, vas a cruzar respuestas con requests equivocados.
- ❌ **No descargar resultados antes del `expires_at`**. Después de 24h y del archivado, los resultados se pierden. Si esperás 2 días, adiós.
- ❌ **Mandar 1 request como batch para "probar"**. Para un solo request, el sync es más simple y la latencia es menor. Batch mínimo ~10 requests para que tenga sentido.
- ❌ **Ignorar errores en el JSONL**. Iterando solo los `type === "succeeded"` dejás silenciosamente afuera los errored. Loggeá los fallos.

## Recap

- `POST /v1/messages/batches` — submit hasta 100K requests por batch, 50% del precio.
- Cada request lleva un `custom_id` propio y un `params` idéntico al body de `/v1/messages`.
- Polling: `GET /v1/messages/batches/{id}` hasta `processing_status: "ended"`.
- Descarga: `GET .../results` — JSONL, orden arbitrario, matcheá por `custom_id`.
- Vida útil: 24h hasta `archived_at`. Descargá antes.
- `service_tier: "batch"` en usage confirma el pricing 50%.
- **Combiná con prompt caching** para ahorro compuesto: ~5% del costo sin optimizar en workloads con prefix compartido.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/batch-processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
**Ejercicio:** <!-- exercise:ex-06-03-batch-submit -->
