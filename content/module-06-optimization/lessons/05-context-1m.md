# Context 1M tokens

## Objetivo

Al terminar esta lección sabrás **habilitar el contexto de 1 millón de tokens** con el beta header `context-1m-2025-08-07`, entender el **pricing progresivo** (tokens >200K tienen precio distinto), cuándo vale la pena (codebase analysis, long documents, multi-session memory) y cuándo NO (inflar el prompt "por las dudas"), y cómo combinarlo con caching para domar el costo.

## Concepto

### El default vs el extended

| Configuración | Context limit | Beta header requerido |
|---------------|---------------|-----------------------|
| Default | 200K tokens | ninguno |
| Extended | **1M tokens** | `context-1m-2025-08-07` |

Con `anthropic-beta: context-1m-2025-08-07`, podés enviar hasta **1,000,000 tokens** de input (suma de system + tools + messages) en Sonnet 4.6.

<terminology>

**Progressive pricing**: los tokens **por encima de 200K** se facturan a una tarifa **superior** (aprox 2x). Los primeros 200K se cobran al precio estándar. Esto es un disuasivo explícito para no usar 1M a la ligera.

**Beta**: la feature está en beta abierta — shape estable, pero revisá la docs antes de producción (los multiplicadores y disponibilidad por modelo cambian).

</terminology>

### El pricing progresivo

Para Sonnet 4.6 con `context-1m-2025-08-07` (valores ilustrativos — verificá precios actuales):

```
Input tokens 0 — 200K:   $3.00 / M   (precio estándar)
Input tokens 200K — 1M:  $6.00 / M   (2x el precio)

Output tokens 0 — 200K input:  $15.00 / M
Output tokens si input >200K:  $22.50 / M  (1.5x)
```

Un prompt de 800K tokens se factura:
```
Primeros 200K: 200_000 × $3/M = $0.60
Siguientes 600K: 600_000 × $6/M = $3.60
Total input: $4.20
```

Un prompt de 150K (bajo el threshold):
```
150_000 × $3/M = $0.45  (precio normal)
```

### Casos de uso donde 1M brilla

1. **Codebase analysis**: "acá tenés todo el monorepo (800K tokens) — identificá dead code".
2. **Long document Q&A**: un PDF de 300 páginas que no fragmentás en chunks RAG.
3. **Multi-document synthesis**: comparar 20 contratos de 30K tokens cada uno en un solo turno.
4. **Session memory**: conversaciones muy largas donde podés mantener todo el historial sin perder contexto anterior.

### Cuándo **NO** usar 1M

- "Por si acaso" — si tu task necesita 50K tokens, mandar 500K es desperdicio.
- **Haystack problems** — meter mucha paja con pocas agujas deteriora el performance del modelo. Más contexto ≠ mejor respuesta.
- Cuando RAG es una opción natural — un buen retrieval de 20K chunks relevantes suele vencer a 800K de dump.

### Combinar con caching: obligatorio arriba de 200K

Si vas a mandar 500K+ tokens y esperás varias llamadas, **cacheá todo el prefix de documentos**. Sin cache, cada request paga los 500K de nuevo (al precio 2x de la zona extendida). Con cache, el segundo request paga 10% de esos 500K.

```json
{
  "system": [
    { "type": "text", "text": "Rol del asistente..." },
    {
      "type": "text",
      "text": "<dump de 600K tokens de código o docs>",
      "cache_control": {"type": "ephemeral", "ttl": "1h"}
    }
  ],
  "messages": [{ "role": "user", "content": "pregunta específica" }]
}
```

Con esto:
- Primera request: write de 600K a 2x × 2x = **4x normal** (cache write × zona extendida). Doloroso.
- Requests 2-N: read de 600K a 0.10x — barato.

Regla: arriba de 200K, **siempre** cacheá o acéptate que es un cálculo único.

### Cómo se ve el `usage`

El response no distingue explícitamente "tokens under 200K" vs "tokens over", pero la facturación sí. El `usage.input_tokens` es el total; el billing lo parte internamente.

### Headers y disponibilidad

```bash
anthropic-beta: context-1m-2025-08-07
```

Disponibilidad actual (abril 2026):
- **Sonnet 4.6**: sí
- **Opus 4.6**: verificar docs — el roll-out va por modelo.
- **Haiku 4.5**: no tiene 1M context — sigue en 200K.

Con modelos que no soportan 1M, el header es ignorado (o la API te lanza 400 dependiendo de la versión).

## Ejecución real

> **Nota:** no ejecuté una llamada de 1M tokens por costo. El shape del request y la interpretación de `usage` son idénticos al request estándar — el cambio es el beta header y el pricing al facturar.

**Request:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: context-1m-2025-08-07" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "system": [{
      "type": "text",
      "text": "<800K tokens de contexto>",
      "cache_control": {"type": "ephemeral", "ttl": "1h"}
    }],
    "messages": [{"role": "user", "content": "Resumí el tema central."}]
  }'
```

Response típica (estructura):
```json
{
  "content": [{"type": "text", "text": "..."}],
  "usage": {
    "input_tokens": 5,
    "cache_creation_input_tokens": 800000,
    "cache_read_input_tokens": 0,
    "output_tokens": 320
  }
}
```

**TypeScript:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  defaultHeaders: { "anthropic-beta": "context-1m-2025-08-07" },
});

const hugeDoc = loadMonorepoDump();  // 800K tokens, por ejemplo

const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: [
    { type: "text", text: "You are a senior engineer reviewing a codebase." },
    {
      type: "text",
      text: hugeDoc,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ],
  messages: [{ role: "user", content: "Identificá 5 patrones de dead code en el monorepo." }],
});

console.log("input_tokens:", resp.usage.input_tokens);
console.log("cache_creation:", resp.usage.cache_creation_input_tokens);
```

### Estimar costo de una llamada de 1M antes de hacerla

```typescript
function estimateCost(inputTokens: number, outputTokens: number) {
  const STANDARD_INPUT_PRICE = 3.0 / 1_000_000;
  const EXTENDED_INPUT_PRICE = 6.0 / 1_000_000;
  const STANDARD_OUTPUT_PRICE = 15.0 / 1_000_000;
  const EXTENDED_OUTPUT_PRICE = 22.5 / 1_000_000;

  const THRESHOLD = 200_000;

  let inputCost = 0;
  if (inputTokens <= THRESHOLD) {
    inputCost = inputTokens * STANDARD_INPUT_PRICE;
  } else {
    inputCost =
      THRESHOLD * STANDARD_INPUT_PRICE +
      (inputTokens - THRESHOLD) * EXTENDED_INPUT_PRICE;
  }

  const outputPrice = inputTokens > THRESHOLD ? EXTENDED_OUTPUT_PRICE : STANDARD_OUTPUT_PRICE;
  const outputCost = outputTokens * outputPrice;

  return { inputCost, outputCost, total: inputCost + outputCost };
}

console.log(estimateCost(800_000, 500));
// { inputCost: 4.20, outputCost: 0.01125, total: 4.21125 }
```

## Anti-patterns

- ❌ **Activar 1M "por si acaso"**. Si tu prompt real es 80K, habilitar 1M no te sirve — y si por error un día metés 250K, te facturás 2x sin darte cuenta.
- ❌ **No cachear arriba de 200K**. El 2x del pricing extendido se compone con el write de cache. Sin caching, cada request repetido paga otra vez — insostenible.
- ❌ **Asumir "más contexto = mejor"**. El modelo tiene sesgos de atención — meter 500K tokens de código irrelevante baja accuracy vs 20K bien seleccionados. Measure, don't assume.
- ❌ **Usar 1M para chunks de historia conversacional**. Si tu conversación crece sin compactación, eventualmente pagás mucho sin mejor resultado. Usá resumen/compactación.
- ❌ **No chequear la disponibilidad del modelo**. Haiku no soporta 1M. Probá tu header con un tiny prompt primero para confirmar que no recibís 400.
- ❌ **Mandar dump sin prompt engineering**. 1M tokens sin estructura (sin secciones, sin headers, sin XML tags) es peor que 200K bien marcados. Lee módulo 3 antes de usar 1M.

## Recap

- Beta header `anthropic-beta: context-1m-2025-08-07` habilita ventana de 1M en modelos soportados (Sonnet 4.6).
- **Pricing progresivo**: tokens >200K se cobran ~2x el precio estándar.
- Combinalo con `cache_control: {ttl: "1h"}` cuando vayas a reusar el contexto — casi obligatorio arriba de 200K.
- Casos canónicos: codebase analysis, long docs, multi-document synthesis.
- No es sustituto de RAG — es un complemento cuando el task requiere genuinamente contexto masivo.
- Estimá costos **antes** de lanzar la request — un prompt de 800K sin cache te puede costar >$4 en una sola llamada.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/context-windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
**Ejercicio:** <!-- exercise:ex-06-05-context-1m -->
