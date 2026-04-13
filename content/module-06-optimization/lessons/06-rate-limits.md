# Rate limits: RPM, ITPM, OTPM

## Objetivo

Al terminar esta lección sabrás **qué significan los tres límites principales** (RPM, ITPM, OTPM), cómo leer los headers `anthropic-ratelimit-*` que vienen en **cada response**, cómo reaccionar a un `429 rate_limit_error` usando el `retry-after`, y cómo diseñar un cliente que haga throttling proactivo antes de golpearse contra el límite.

## Concepto

### Los 3 límites que importan

Anthropic aplica 3 tipos de rate limit por ventana deslizante de 1 minuto:

| Sigla | Significa | Se cuenta | Ejemplo Haiku 4.5 Tier 1 |
|-------|-----------|-----------|---------------------------|
| **RPM** | Requests per minute | Cada request cuenta 1 | 50 |
| **ITPM** | Input tokens per minute | Tokens de input de cada request | 50,000 |
| **OTPM** | Output tokens per minute | Tokens de output generados | 10,000 |

**Regla**: el que primero llegue a su límite dispara el 429. Si enviás 50 requests de 1M input tokens cada una, vas a golpear ITPM antes que RPM.

<terminology>

**Tiers**: Anthropic escala los límites según tu uso histórico. Empezás en Tier 1, y al gastar / demostrar uso estable subís automáticamente a Tier 2, 3, 4 con límites progresivamente mayores. Los valores actuales por modelo están en la docs oficial.

**Acceleration limits**: aparte de los límites base, si tu tráfico sube **abruptamente**, podés recibir 429 incluso con headroom en RPM/ITPM/OTPM. La solución: ramp up gradual.

**Priority tier**: requests con `service_tier: "priority"` tienen límites separados y menos 429s — pagás un premium.

</terminology>

### Los headers de rate limit en cada response

Cada response de la API (incluso las exitosas) trae:

```
anthropic-ratelimit-requests-limit: 50
anthropic-ratelimit-requests-remaining: 49
anthropic-ratelimit-requests-reset: 2026-04-12T21:16:46Z

anthropic-ratelimit-input-tokens-limit: 50000
anthropic-ratelimit-input-tokens-remaining: 50000
anthropic-ratelimit-input-tokens-reset: 2026-04-12T21:16:45Z

anthropic-ratelimit-output-tokens-limit: 10000
anthropic-ratelimit-output-tokens-remaining: 10000
anthropic-ratelimit-output-tokens-reset: 2026-04-12T21:16:45Z

anthropic-ratelimit-tokens-limit: 60000
anthropic-ratelimit-tokens-remaining: 60000
anthropic-ratelimit-tokens-reset: 2026-04-12T21:16:45Z

request-id: req_011CZza7Y1bDZaLG9xVDBD53
```

**Leer esto**:
- `-limit`: tu tope actual.
- `-remaining`: cuánto te queda en la ventana actual.
- `-reset`: timestamp ISO 8601 del reset — tu contador se regenera ahí.

El de `tokens` (sin `input`/`output` en el nombre) es la **suma** input+output en la ventana.

### Qué pasa cuando golpeás el límite

Response 429:

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded. Please retry after 17 seconds."
  }
}
```

Headers:
```
retry-after: 17
anthropic-ratelimit-requests-remaining: 0
anthropic-ratelimit-requests-reset: 2026-04-12T21:17:15Z
```

**Lo que debés hacer**:
1. **Leé `retry-after`** (segundos a esperar).
2. Esperá ese tiempo.
3. Reintentá.

No hagas retry inmediato — te van a rechazar de nuevo. **Respetá el `retry-after`**.

### Throttling proactivo (mejor que reactivo)

Esperar a recibir 429 es subóptimo — el usuario ve errores, tu pipeline se detiene. **Estrategia proactiva**: antes de cada request, mirá el `remaining` del response anterior. Si está bajo, esperá.

```typescript
async function requestWithThrottle(body: any, state: RateLimitState) {
  // Si queda poco margen, esperar hasta el reset
  if (state.requestsRemaining < 2 || state.tokensRemaining < 10_000) {
    const waitMs = Math.max(0, state.reset.getTime() - Date.now());
    console.log(`Throttling: waiting ${waitMs}ms until reset`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { ... },
    body: JSON.stringify(body),
  });

  // Actualizar state con headers del response
  state.requestsRemaining = parseInt(resp.headers.get("anthropic-ratelimit-requests-remaining") ?? "0");
  state.tokensRemaining = parseInt(resp.headers.get("anthropic-ratelimit-tokens-remaining") ?? "0");
  state.reset = new Date(resp.headers.get("anthropic-ratelimit-requests-reset") ?? "");

  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return requestWithThrottle(body, state);
  }

  return resp.json();
}
```

### Backoff con jitter (si el throttling no alcanza)

Cuando un retry falla nuevamente (raro, pero sucede con acceleration limits), usá **exponential backoff + jitter**:

```typescript
async function withRetry(fn: () => Promise<any>, attempt = 0): Promise<any> {
  try {
    return await fn();
  } catch (err: any) {
    if (err.status !== 429 || attempt >= 5) throw err;
    const base = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000;
    await new Promise((r) => setTimeout(r, base + jitter));
    return withRetry(fn, attempt + 1);
  }
}
```

Así evitás que todos tus workers reintenten simultáneamente.

### Cómo reducir tu consumo (RPM/ITPM/OTPM)

- **ITPM alto** → aplicá prompt caching (lección 01). Un read a 0.10x cuenta como ~10% del token en algunos regímenes de conteo, o 0 en otros — consultá la docs. De cualquier modo, menos tokens "efectivos".
- **OTPM alto** → reducí `max_tokens`, usá `stop_sequences`, pedí respuestas concisas en el system.
- **RPM alto** → agrupá pedidos en batches (lección 04) cuando el use case lo tolere, o migrá a streaming para reducir re-requests.

### Priority tier (cuando 429 te arruina el día)

Para producción crítica donde el 429 es inaceptable, Anthropic ofrece:

```json
{
  "service_tier": "priority"
}
```

Límites separados, usualmente mucho más altos, y typically 0 acceleration limits. Pagás un premium por token. Caso de uso: APIs de cliente-final con SLA estricto.

## Ejecución real

**Medir tus headers ahora mismo:**

```bash
curl -sD /tmp/headers.txt https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":20,"messages":[{"role":"user","content":"hi"}]}' \
  > /dev/null && grep -i "ratelimit\|retry-after" /tmp/headers.txt
```

Output real (Tier 1, Haiku 4.5):
```
anthropic-ratelimit-input-tokens-limit: 50000
anthropic-ratelimit-input-tokens-remaining: 50000
anthropic-ratelimit-input-tokens-reset: 2026-04-12T21:16:45Z
anthropic-ratelimit-output-tokens-limit: 10000
anthropic-ratelimit-output-tokens-remaining: 10000
anthropic-ratelimit-output-tokens-reset: 2026-04-12T21:16:45Z
anthropic-ratelimit-requests-limit: 50
anthropic-ratelimit-requests-remaining: 49
anthropic-ratelimit-requests-reset: 2026-04-12T21:16:46Z
anthropic-ratelimit-tokens-limit: 60000
anthropic-ratelimit-tokens-remaining: 60000
anthropic-ratelimit-tokens-reset: 2026-04-12T21:16:45Z
```

Observá:
- RPM 50 Tier 1 Haiku — el `-remaining: 49` porque la request que acabo de hacer descontó 1.
- ITPM 50K, OTPM 10K.
- `-tokens-limit: 60000` combinado (input+output en ventana).

**TypeScript — cliente con throttling:**

```typescript
interface RateLimitState {
  requestsRemaining: number;
  tokensRemaining: number;
  reset: Date;
}

class ThrottledClient {
  private state: RateLimitState = {
    requestsRemaining: 50,
    tokensRemaining: 60_000,
    reset: new Date(Date.now() + 60_000),
  };

  async request(body: any) {
    // Proactive throttle
    if (this.state.requestsRemaining < 3) {
      const waitMs = Math.max(0, this.state.reset.getTime() - Date.now());
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    this.updateState(resp.headers);

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get("retry-after") ?? "5");
      console.log(`429 — waiting ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.request(body);
    }

    return resp.json();
  }

  private updateState(headers: Headers) {
    const reqRem = headers.get("anthropic-ratelimit-requests-remaining");
    const tokRem = headers.get("anthropic-ratelimit-tokens-remaining");
    const reset = headers.get("anthropic-ratelimit-requests-reset");
    if (reqRem) this.state.requestsRemaining = parseInt(reqRem);
    if (tokRem) this.state.tokensRemaining = parseInt(tokRem);
    if (reset) this.state.reset = new Date(reset);
  }
}
```

## Anti-patterns

- ❌ **Retry inmediato después de un 429**. Vas a recibir otro 429. **Siempre respetá `retry-after`**.
- ❌ **No leer los headers**. Volás a ciegas — vas a golpearte contra límites sin ver venir la pared.
- ❌ **Retry agresivo sin jitter**. 50 workers con `retry at 1s, 2s, 4s` → todos reintenentan en el mismo instante → 429 permanente. Agregá jitter aleatorio.
- ❌ **Asumir que pagar más sube el tier automáticamente**. Los upgrades de tier son automáticos pero requieren **uso estable** durante semanas. No te vas a Tier 4 por comprar créditos.
- ❌ **Mandar requests lentamente "para no golpear el límite"**. Subutilizás tu throughput. Mejor: throttling proactivo basado en `remaining` + batch API para async.
- ❌ **Ignorar `inference_geo` y región**. Los límites pueden variar por región; en multi-region deployments medí por endpoint usado.

## Recap

- **RPM** (requests/min), **ITPM** (input tokens/min), **OTPM** (output tokens/min). El primero que golpee dispara 429.
- Headers `anthropic-ratelimit-*-{limit,remaining,reset}` vienen en cada response — leé siempre.
- Con 429: `retry-after` te dice cuántos segundos esperar. Respetalo.
- **Throttling proactivo** > reactivo: si `remaining` está bajo, esperá antes de mandar.
- Combiná con **backoff exponencial + jitter** para burst handling.
- Para bajar consumo: caching (ITPM), `max_tokens` menor (OTPM), batch API (RPM).
- **Priority tier** (`service_tier: "priority"`) paga premium por SLA casi sin 429s.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/rate-limits](https://platform.claude.com/docs/en/api/rate-limits) · [platform.claude.com/docs/en/api/errors](https://platform.claude.com/docs/en/api/errors)
**Ejercicio:** <!-- exercise:ex-06-04-rate-limits -->
