# Lab: optimizar un prompt caro

## Objetivo

Al terminar este lab habrás tomado un **request caro** (system prompt de ~40K tokens, ejecutado 50 veces) y lo habrás optimizado combinando **prompt caching + elección de modelo + batch API** cuando aplique. La métrica de éxito: **>80% reducción de costo** medida con `usage` real.

## Concepto

### El anti-patrón que vamos a arreglar

Imagina un job de backoffice que corre cada mañana:
- Lee 50 tickets de soporte del día anterior.
- Para cada ticket, consulta un agente Claude con un system prompt de 40K tokens que describe políticas, taxonomía de categorías, ejemplos few-shot.
- Devuelve categorización + severidad + sugerencia de respuesta.

Implementación naive:

```typescript
for (const ticket of tickets) {
  const resp = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 500,
    system: BIG_SYSTEM_PROMPT,  // 40K tokens, enviado 50 veces
    messages: [{ role: "user", content: JSON.stringify(ticket) }],
  });
  processResult(resp);
}
```

**Costo (Opus 4.6, aprox abril 2026)**:
```
Input: 40_000 × 50 × $15/M = $30.00
Output: 500 × 50 × $75/M = $1.875
Total por corrida: ~$31.88
Total mensual (30 runs): ~$956
```

### El plan de optimización

4 mejoras componibles, ordenadas por impacto/esfuerzo:

**1. Prompt caching (impacto 10x, esfuerzo 10 min)**

Marcá el system prompt con `cache_control`. Primer request paga write (1.25x), los 49 restantes pagan read (0.10x).

```typescript
system: [
  { type: "text", text: BIG_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
]
```

Nuevo costo (solo caching aplicado):
```
Write: 40_000 × 1.25 × $15/M × 1 = $0.75
Reads: 40_000 × 0.10 × $15/M × 49 = $2.94
Output: mismo = $1.875
Total: ~$5.57  → 83% reducción
```

**2. Elegir modelo apropiado (impacto adicional ~5x)**

"Categorizar y sugerir respuesta" no necesariamente requiere Opus. Probá Sonnet 4.6. Si pasa evals, bajá de $15/M a $3/M.

```
Con Sonnet 4.6 + caching:
Write: 40_000 × 1.25 × $3/M × 1 = $0.15
Reads: 40_000 × 0.10 × $3/M × 49 = $0.588
Output: 500 × 50 × $15/M = $0.375
Total: ~$1.11 → 96% reducción sobre baseline
```

Si el task es aún más simple, Haiku 4.5 ($1/M input, $5/M output) lo baja a ~$0.30.

**3. Batch API (impacto adicional 2x en workloads async)**

Este job es **nocturno, no interactivo**. Es el caso perfecto para batch.

```typescript
const batch = await client.messages.batches.create({
  requests: tickets.map((t, i) => ({
    custom_id: `ticket-${t.id}`,
    params: {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: [{ type: "text", text: BIG_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(t) }],
    }
  })),
});
```

Costo con Sonnet + caching + batch (50% off):
```
~$1.11 × 0.50 = ~$0.56  → 98% reducción sobre baseline
```

**4. (Opcional) Extended TTL de 1h si el job corre varias veces al día**

Si además de la corrida nocturna hay runs ad-hoc durante el día espaciados >5m, pasá el cache a `ttl: "1h"`. El write es 2x (vs 1.25x), pero el cache sobrevive entre corridas.

### Antes de optimizar: medí el baseline

No optimicés a ciegas. Hacé 3-5 requests de baseline y capturá `usage` para conocer el punto de partida real:

```typescript
const baseline: any[] = [];
for (let i = 0; i < 5; i++) {
  const resp = await client.messages.create({ /* sin optimizaciones */ });
  baseline.push(resp.usage);
}

const avgInput = baseline.reduce((s, u) => s + u.input_tokens, 0) / baseline.length;
const avgOutput = baseline.reduce((s, u) => s + u.output_tokens, 0) / baseline.length;
console.log(`Baseline: avg input=${avgInput}, output=${avgOutput}`);
```

Con esos números podés estimar el costo **antes** de tocar nada.

### Medí el post-optimización con el mismo método

Después de aplicar mejoras, re-ejecutá los mismos N requests y compará. Calculá:

```
ahorro_absoluto = costo_pre - costo_post
ahorro_% = (ahorro_absoluto / costo_pre) × 100
```

Si tu `ahorro_%` no pasa del 50%, algo está mal:
- ¿El cache está fallando? Revisá `cache_read_input_tokens` — si es 0, el prefix no matchea.
- ¿El modelo nuevo está dando peor calidad? Reverse course y quedate con el viejo pero cacheado.

## Ejecución real

Este lab tiene dos partes: (A) pre-medición con prompt naive, (B) aplicar optimizaciones, (C) comparar.

**Setup — simular 50 requests iguales con system prompt grande:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const BIG_SYSTEM = "Eres un categorizador de tickets...\n" + "# Política\n".repeat(3000);
// ~12K tokens aprox (ajustá hasta llegar a ~40K si querés reproducir la escala)

const TICKETS = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  subject: `Issue ${i}`,
  body: "No puedo acceder a la plataforma.",
}));
```

**Parte A — baseline sin caching:**

```typescript
async function runBaseline() {
  let totalInput = 0, totalOutput = 0;
  for (const t of TICKETS.slice(0, 5)) {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: BIG_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(t) }],
    });
    totalInput += resp.usage.input_tokens;
    totalOutput += resp.usage.output_tokens;
  }
  console.log(`Baseline (5 reqs): input=${totalInput}, output=${totalOutput}`);
  // Extrapolá × 10 para estimar las 50
}
```

Output típico:
```
Baseline (5 reqs): input=60245, output=412
```

Costo baseline estimado (Haiku 4.5):
```
60_245 × $1/M + 412 × $5/M ≈ $0.0624 por 5 reqs
→ $0.624 por 50 reqs
```

**Parte B — aplicar caching:**

```typescript
async function runCached() {
  let totalWrite = 0, totalRead = 0, totalOutput = 0;
  for (const t of TICKETS.slice(0, 5)) {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: [{
        type: "text",
        text: BIG_SYSTEM,
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: JSON.stringify(t) }],
    });
    totalWrite += (resp.usage as any).cache_creation_input_tokens ?? 0;
    totalRead += (resp.usage as any).cache_read_input_tokens ?? 0;
    totalOutput += resp.usage.output_tokens;
  }
  console.log(`Cached (5 reqs): write=${totalWrite}, read=${totalRead}, output=${totalOutput}`);
}
```

Output típico:
```
Cached (5 reqs): write=12049, read=48196, output=405
```

Costo con caching (Haiku):
```
write: 12_049 × 1.25 × $1/M = $0.01506
read:  48_196 × 0.10 × $1/M = $0.00482
output: 405 × $5/M = $0.00203
Total: ~$0.0219 por 5 reqs → $0.219 por 50
```

**Parte C — comparar:**

```
Baseline (sin cache):  $0.624 por 50 reqs
Cached:                $0.219 por 50 reqs
Ahorro:                65% en este ejemplo con Haiku
```

Con Opus (donde los tokens de input cuestan 15x) el ahorro porcentual es **mayor** — cuanto más caro el modelo, más absoluto el beneficio de caching.

### Variante con batch API

Si el job no necesita respuesta inmediata, empaquetá las 50 requests como batch:

```typescript
const batch = await client.messages.batches.create({
  requests: TICKETS.map((t) => ({
    custom_id: `ticket-${t.id}`,
    params: {
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: [{
        type: "text",
        text: BIG_SYSTEM,
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: JSON.stringify(t) }],
    },
  })),
});

// Poll hasta ended, luego descargar results
```

Costo con caching + batch (50% off):
```
$0.219 × 0.50 = ~$0.11 por 50 reqs
→ ~82% reducción sobre baseline no optimizado
```

### Hoja de ruta del lab (paso a paso)

Seguí este orden exacto:

1. **Escribí el baseline** (sin optimización). Corré 5 requests y capturá `usage`.
2. **Calculá costo baseline** con calculadora (input × precio + output × precio).
3. **Agregá `cache_control`** al system. Corré 5 requests. Observá que el primero tiene write y los 4 siguientes tienen read.
4. **Calculá costo cached**. Comparalo con baseline.
5. **Probá con otro modelo** (Haiku → Sonnet o viceversa). Mantené caching.
6. **(Opcional) Envolvé en batch API**. Submit, poll, download.
7. **Reportá el % de reducción total.** Target: >80% para un caso de 40K system + 50 reqs.

## Anti-patterns

- ❌ **Aplicar todas las optimizaciones juntas sin medir entre pasos**. Si después algo funciona mal, no vas a saber qué rompió. Aplicá una por una, midiendo en cada paso.
- ❌ **Optimizar por costo sacrificando calidad sin evals**. Bajar de Opus a Haiku puede ahorrar 90% pero si la categorización baja de 95% a 70% accuracy, ese ahorro es ilusorio. Medí quality junto con costo.
- ❌ **Ignorar que el primer request siempre paga write**. Si tu lab corre solo 2-3 requests, el write no se amortiza. Necesitás ≥3-4 reads para ver ahorro real.
- ❌ **Olvidar que el cache tiene TTL**. Si esperás 20 min entre requests y usás `ttl: "5m"`, nunca vas a ver reads. Ajustá a `"1h"` o acercá los requests.
- ❌ **Batch API para workloads interactivos**. Si el usuario final está esperando en UI, la latencia de batch (min a 24h) mata la UX.
- ❌ **Cachear un prefix que cambia seguido**. Si el system prompt se regenera cada vez (timestamp, user_id, etc.), el cache miss es 100% y estás pagando write siempre sin reads. Revisá con hash del prefix.

## Recap

- El workflow canónico de optimización es: **medir baseline → agregar caching → probar modelo más barato → batch si async → medir ahorro final**.
- **Orden importa**: optimizar una mejora a la vez y medir en cada paso.
- Caching solo ya da **70-90% de ahorro** en workloads con system grande repetido.
- Combinado con batch API y modelo más barato, **>95% reducción** es alcanzable en casos async.
- Siempre medí con `usage` real — no estimés "a ojo".
- Track `cache_creation_input_tokens` y `cache_read_input_tokens` separadamente — es la firma de que el cache está funcionando.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) · [platform.claude.com/docs/en/build-with-claude/batch-processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
**Ejercicio:** <!-- exercise:ex-06-06-lab-optimize -->
