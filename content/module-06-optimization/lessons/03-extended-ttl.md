# Extended cache TTL: 1 hora

## Objetivo

Al terminar esta lección sabrás **activar el TTL extendido de 1 hora** con el beta header `extended-cache-ttl-2025-04-11`, cuándo vale la pena vs el default de 5 minutos (y cuándo no), cómo interpretar `cache_creation.ephemeral_1h_input_tokens` vs `ephemeral_5m_input_tokens`, y cómo combinarlos en el mismo request.

## Concepto

### El default: TTL de 5 minutos

Por default, un cache breakpoint vive **5 minutos** desde el último acceso. Cada hit **extiende** el TTL por 5 minutos más (no lo resetea desde la creación). Si nadie usa el prefix en 5m, el cache se desaloja.

Este TTL funciona bien para:
- Apps con tráfico regular (cada request mantiene vivo el cache).
- Conversaciones activas de usuarios.
- Agentes en runtime loop.

No funciona bien para:
- Tráfico sporadic (llamadas espaciadas más de 5m).
- Cron jobs que corren cada 10-15 min.
- Batch workloads donde el primer batch llena el cache y el segundo llega 20 min después.

### La solución: TTL de 1 hora

Con el beta header:

```
anthropic-beta: extended-cache-ttl-2025-04-11
```

Podés pedir `ttl: "1h"`:

```json
{
  "cache_control": {
    "type": "ephemeral",
    "ttl": "1h"
  }
}
```

El cache vive 1 hora sin uso. En cada hit se extiende 1 hora más.

### El costo del write extendido

El trade-off no es gratis:

| TTL | Write cost | Read cost |
|-----|------------|-----------|
| `5m` (default) | 1.25x | 0.10x |
| `1h` | **2.00x** | 0.10x |

El write de 1h es **2x** el precio normal (vs 1.25x del 5m). Reads son iguales.

**Break-even** (cuándo conviene 1h vs 5m):

- Si vas a tener **>2 reads en 5m** → usá `5m` (más barato en write).
- Si tus reads están espaciados más de 5m entre sí → usá `1h`.
- Si no estás seguro, medí: probá ambos y comparás `usage` acumulado durante una hora.

<terminology>

**Ephemeral 5m** (default): TTL 5 minutos, write a 1.25x.
**Ephemeral 1h** (beta): TTL 1 hora, write a 2.00x.
**Ambos** son "ephemeral" — el nombre distingue el tipo de breakpoint que estás creando. No hay un "persistent" cache; todo lo que cacheás puede evaporarse si el TTL expira.

</terminology>

### Combinar 5m y 1h en el mismo request

Podés tener varios breakpoints con distintos TTL. Útil cuando una parte del prefix es "muy estable" (1h) y otra es "estable pero cambia algunas veces por sesión" (5m):

```json
{
  "tools": [
    ...,
    {
      "name": "last_tool",
      "cache_control": { "type": "ephemeral", "ttl": "1h" }
    }
  ],
  "system": [
    {
      "type": "text",
      "text": "<instrucciones muy estables — raro cambian>",
      "cache_control": { "type": "ephemeral", "ttl": "1h" }
    },
    {
      "type": "text",
      "text": "<documentos de contexto — pueden cambiar cada sesión>",
      "cache_control": { "type": "ephemeral", "ttl": "5m" }
    }
  ],
  "messages": [...]
}
```

El `usage` del response los separa:

```json
{
  "cache_creation": {
    "ephemeral_1h_input_tokens": 800,
    "ephemeral_5m_input_tokens": 4000
  },
  "cache_creation_input_tokens": 4800,
  "cache_read_input_tokens": 0
}
```

Y el `usage` total:
- `cache_creation_input_tokens` = total de la request cacheados (suma de ambos).
- Los breakdowns te dicen cuánto se cobró a 2x (1h) y cuánto a 1.25x (5m).

### Casos de uso canónicos para 1h

1. **Cron jobs / scheduled tasks**: un job que corre cada 15 min procesa 100 items con el mismo prompt. 5m → cache miss cada run. 1h → hits entre runs.

2. **Batch offline pipelines**: dos batches lanzados con 20 min de diferencia. Sin 1h, el segundo batch paga todo el prefix de nuevo.

3. **Agentes de soporte con ramp-up gradual**: tráfico bajo en la mañana (1 request cada 10 min). Con 5m siempre perdés el cache entre users.

4. **Multi-tenant con pooling relajado**: un system prompt shared entre 50 usuarios con actividad intermitente — la 1h mantiene caliente el cache entre tenants.

### Cuándo NO usar 1h

- Apps con tráfico alto (cada request renueva el 5m sola).
- Prototyping / development (costos marginales, simplicidad gana).
- Cuando el system prompt cambia más seguido que 1 vez por hora (invalidá el cache y perdés el write premium).

## Ejecución real

**Request con TTL 1h:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: extended-cache-ttl-2025-04-11" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 50,
    "system": [{
      "type": "text",
      "text": "<prefix estable 5400 tokens>",
      "cache_control": {"type": "ephemeral", "ttl": "1h"}
    }],
    "messages": [{"role": "user", "content": "Summarize."}]
  }'
```

Response esperado (primera vez):
```json
{
  "usage": {
    "input_tokens": 15,
    "cache_creation_input_tokens": 5409,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 5409
    },
    "output_tokens": 37
  }
}
```

Observá:
- `ephemeral_1h_input_tokens: 5409` → se facturaron a 2x (write premium).
- `ephemeral_5m_input_tokens: 0` → no hay nada en 5m.

Siguiente request dentro de 1h:
```json
{
  "usage": {
    "cache_read_input_tokens": 5409,  // read normal a 0.10x
    "cache_creation_input_tokens": 0
  }
}
```

**TypeScript con dos niveles:**

```typescript
const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 500,
  // Header beta via defaultHeaders al crear el cliente
  system: [
    {
      type: "text",
      text: coreInstructions,  // 1200 tokens — muy estable
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
    {
      type: "text",
      text: sessionDocs,  // 4000 tokens — cambia por sesión
      cache_control: { type: "ephemeral", ttl: "5m" },
    },
  ],
  messages: [{ role: "user", content: userQuery }],
}, {
  headers: { "anthropic-beta": "extended-cache-ttl-2025-04-11" },
});

const u: any = resp.usage;
console.log("1h write:", u.cache_creation?.ephemeral_1h_input_tokens);
console.log("5m write:", u.cache_creation?.ephemeral_5m_input_tokens);
console.log("read:", u.cache_read_input_tokens);
```

### Cálculo de break-even

Con Haiku 4.5 (input $1/M, reads $0.10/M):
```
Prefix: 5000 tokens cacheados
Write 5m cost: 5000 × 1.25 × $1/M = $0.00625
Write 1h cost: 5000 × 2.00 × $1/M = $0.01000
Read cost:      5000 × 0.10 × $1/M = $0.00050

Escenario A: 1 request cada 15 min durante 1h (4 requests totales)
  5m: 4 writes × $0.00625 = $0.025        (ningún hit porque cada request está a >5m)
  1h: 1 write × $0.01 + 3 reads × $0.0005 = $0.0115
  → 1h gana 54% de ahorro

Escenario B: 1 request cada 30s durante 1h (120 requests totales)
  5m: 1 write × $0.00625 + 119 reads × $0.0005 = $0.0658
  1h: 1 write × $0.01 + 119 reads × $0.0005 = $0.0695
  → 5m gana — no pagues el premium si el tráfico mantiene el cache vivo
```

## Anti-patterns

- ❌ **Prender `ttl: "1h"` por default para todos los prefixes**. Pagás 2x en writes. Solo tiene sentido si vas a tener gaps >5m entre hits.
- ❌ **Olvidar el beta header**. Sin `anthropic-beta: extended-cache-ttl-2025-04-11`, el `"1h"` se downgrade silenciosamente a `"5m"`.
- ❌ **Asumir que 1h = siempre más barato**. No: escenario B arriba muestra cuando 5m gana.
- ❌ **Mezclar TTL distinto al mismo bloque**. Cada cache_control es su breakpoint independiente. Si el modelo de tráfico cambia, medí y reasignás.
- ❌ **No separar "muy estable" (1h) de "estable por sesión" (5m)**. Si todo va con un solo TTL, o pagás write premium innecesario, o perdés cache entre sesiones.

## Recap

- `cache_control: {type: "ephemeral", ttl: "1h"}` + header `anthropic-beta: extended-cache-ttl-2025-04-11` extiende el cache a 1 hora.
- Write a 2x (vs 1.25x del 5m); reads iguales (0.10x).
- Break-even: si tus requests están espaciados >5m entre sí, 1h ahorra. Con tráfico denso (cada < 5m), 5m gana.
- Podés mezclar TTL distintos en la misma request — el `usage.cache_creation` los separa en `ephemeral_1h_input_tokens` y `ephemeral_5m_input_tokens`.
- Casos canónicos: cron jobs, batches espaciados, agentes de tráfico bajo, multi-tenant con actividad intermitente.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
**Ejercicio:** *(cubierto en ex-06-02-cache-breakpoint)*
