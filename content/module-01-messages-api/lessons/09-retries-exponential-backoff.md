# Retries con exponential backoff

## Objetivo

Al terminar sabrás qué **errores reintentar** y cuáles son fatales (ya viste el mapa en la Lección 08, ahora lo hacemos operativo), **cómo el SDK oficial los maneja por defecto**, **cómo configurar `maxRetries`** global o por request, y **cómo implementar exponential backoff con jitter a mano** cuando estás en un cliente custom o en otro lenguaje sin SDK. Vas a ver el comportamiento real de un wrapper TypeScript ejecutado contra una simulación de fallos transitorios.

## Concepto

### ¿Qué errores reintentar? (repaso rápido de Lección 08)

<terminology>
**Reintentable** (transitorio, el problema no es tu body):
- **408 Request Timeout** — el servidor no procesó a tiempo.
- **409 Conflict** — condición de carrera a nivel de servidor.
- **429 `rate_limit_error`** — excediste RPM/TPM/TPD. El servidor te manda un header `retry-after` con los segundos que debés esperar.
- **500 `api_error`** — error interno del servidor.
- **529 `overloaded_error`** — infraestructura saturada.
- **Errores de conexión** — DNS failure, socket cerrado, TLS timeout. Todo lo que no llegó a HTTP.

**Fatal** (el problema es tu request, reintentar no arregla nada):
- **400 `invalid_request_error`**
- **401 `authentication_error`**
- **403 `permission_error`**
- **404 `not_found_error`**
- **413 `request_too_large`**
</terminology>

La regla operativa: **reintentar fatal = DoS a tu propia app**. Clasificá antes de decidir.

### Exponential backoff: la fórmula

La idea es simple: después de cada fallo, esperás **más tiempo** antes del próximo intento. Si lo hacés lineal (1s, 1s, 1s...) cuando el servidor está saturado, todos los clientes martillean al mismo tiempo y empeoran la congestión. Exponencial (1s, 2s, 4s, 8s, 16s...) le da oxígeno al servidor.

Fórmula canónica:

```
waitMs = min(base * 2^attempt, cap)
```

Con `base = 1000` (1 segundo) y `cap = 30000` (30 segundos), los intentos son:

| attempt | waitMs |
|---|---|
| 0 | 1000 |
| 1 | 2000 |
| 2 | 4000 |
| 3 | 8000 |
| 4 | 16000 |
| 5 | 30000 (capped) |

### ¿Por qué necesitás jitter?

Si 10.000 clientes caen en un 429 al mismo tiempo y todos esperan **exactamente** 1s antes de reintentar, a los 1000ms vas a tener 10.000 requests simultáneos de nuevo. Se llama **thundering herd**: la retry policy perfectamente sincronizada causa un mini-DDoS contra el servidor que acababa de recuperarse.

La solución es agregar **jitter**: ruido aleatorio al tiempo de espera. Cada cliente espera un poco distinto, se dispersa la carga en el tiempo.

Dos variantes típicas:

- **Full jitter**: `waitMs = random(0, base * 2^attempt)`. Agresivo, puede ser instantáneo o el máximo.
- **Equal jitter** (usado en este módulo): `waitMs = base * 2^attempt + random(0, base * 2^attempt * 0.25)`. Un ±25% sobre el valor nominal. Más predecible.

Ambas funcionan. Usá la que tu equipo entienda mejor.

### `retry-after`: el servidor te dice cuánto esperar

Cuando la API devuelve **429** (y a veces 529), normalmente incluye un header:

```
retry-after: 7
```

Ese `7` son **segundos**. El servidor te está diciendo "esperá al menos 7 segundos antes de volver a pedir, o te voy a devolver 429 igual". **Respetarlo es innegociable**: si lo ignorás, tu exponential backoff de 1s es inútil porque vas a quemar intentos inválidos.

Regla de oro: **si hay `retry-after`, usalo en vez de tu fórmula calculada**. Si no hay, caés en la fórmula `base * 2^attempt + jitter`.

### ¿Qué hace el SDK oficial por vos?

El SDK de Anthropic (todos los lenguajes: TypeScript, Python, Go, Java, Ruby, C#) trae retries **activados por defecto**:

<terminology>
**Default**: `maxRetries: 2` — el SDK reintenta hasta 2 veces cada request fallido.

**Qué reintenta**: errores de conexión (network drop, DNS), `408 Request Timeout`, `409 Conflict`, `429 Rate Limit`, y cualquier `5xx Internal Server`.

**Cómo espera**: short exponential backoff entre intentos. Respeta `retry-after` cuando el servidor lo envía.

**Qué NO reintenta**: `400`, `401`, `403`, `404`, `413` — consistente con la clasificación fatal vs transitorio.
</terminology>

Configurarlo es trivial en TypeScript:

```typescript
import Anthropic from "@anthropic-ai/sdk";

// Global: todos los requests del cliente usan maxRetries=5
const client = new Anthropic({ maxRetries: 5 });

// Per-request: override puntual
await client.messages.create(
  { model: "claude-haiku-4-5", max_tokens: 100, messages: [...] },
  { maxRetries: 0 } // este request específico no se reintenta
);
```

**Cuándo subir `maxRetries`**: producción con alto volumen, donde algún 429 esporádico es tolerable si eventualmente pasa. `maxRetries: 5` o `6` es razonable.

**Cuándo bajarlo a `0`**: requests críticos de baja latencia donde preferís fallar rápido y degradar la UX a un mensaje explícito ("servicio ocupado, intentá en un minuto") antes que tener al usuario esperando 30 segundos con backoffs encadenados.

**Cuándo NO confiar en el SDK**: cuando estás en un cliente custom (un lenguaje sin SDK oficial, un proxy, un edge worker) y tenés que implementarlo vos. Es lo que viene abajo.

### El límite de intentos: ¿por qué siempre ponerlo?

Sin un `maxRetries`, un loop de retry puede correr **indefinidamente**. Imaginá que el servidor devuelve 429 por 4 horas porque alguien se equivocó con el rate limit del tier: tu request queda colgado esperando por 4 horas. Tu usuario cierra la pestaña. Tu operador se vuelve loco buscando el request fantasma.

**Siempre un tope**. Típico: 3-5 intentos. Después del último fallido, devolvés el error al caller con un mensaje explícito ("la API sigue devolviendo errores después de 5 intentos, revisá rate limits o intentá de nuevo en unos minutos").

## Ejecución real

**Paso 1 — Usar el SDK oficial con `maxRetries` configurado**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  maxRetries: 5, // default es 2, lo subimos para producción
});

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 50,
  messages: [{ role: "user", content: "Di 'ok' y nada más." }],
});

console.log(resp.content);
```

Si esto corre contra la API en condiciones normales, no vas a ver ningún retry porque no hay fallo. **El retry es invisible cuando todo anda bien**. El SDK solo entra en acción cuando alguno de los 2 (o 5) intentos falla con un error reintentable. En producción, con alto volumen, vas a ver la diferencia — en desarrollo casi nunca.

**Paso 2 — Implementar un wrapper a mano en TypeScript**

Guardalo en `playground/retry-wrapper-test.ts`:

```typescript
function shouldRetry(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function computeBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined) {
    return retryAfterSec * 1000; // respetar el header del servidor
  }
  const base = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s...
  const jitter = Math.random() * base * 0.25; // +0-25% jitter
  return Math.min(base + jitter, 30_000); // cap a 30s
}

async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number } = { maxRetries: 3 }
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const status: number = err.status ?? 0;
      const retryAfter = parseInt(err.headers?.["retry-after"] ?? "", 10);

      if (!shouldRetry(status) || attempt >= opts.maxRetries) {
        throw err;
      }

      const waitMs = computeBackoffMs(
        attempt,
        isNaN(retryAfter) ? undefined : retryAfter
      );
      console.error(
        `[retry] intento ${attempt + 1}/${opts.maxRetries} — status=${status} — esperando ${Math.round(waitMs)}ms`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
    }
  }
}
```

Cuatro piezas bien separadas:

1. **`shouldRetry(status)`** — la política de qué reintentar. Coincide con lo del SDK oficial: 408, 409, 429, 5xx.
2. **`computeBackoffMs(attempt, retryAfterSec?)`** — el cálculo. Si hay `retry-after`, gana. Si no, fórmula exponencial con jitter y cap.
3. **`withRetries(fn, opts)`** — el loop genérico. Envuelve cualquier función async, atrapa errores, decide, espera, reintenta.
4. **Errores fatales se re-lanzan tal cual** — si `shouldRetry` devuelve `false`, el wrapper no lo toca, el error burbujea al caller.

**Paso 3 — Correr el wrapper con simulaciones**

Ejecutamos una batería de asserts sobre el comportamiento:

```bash
cd ~/Documents/GitHub/curso-claude-console
npx tsx playground/retry-wrapper-test.ts
```

Output real:

```
Backoff sin retry-after (exponencial + jitter):
  attempt=0: 1147ms
  attempt=1: 2085ms
  attempt=2: 4027ms
  attempt=3: 8127ms
  attempt=4: 17100ms

Backoff con retry-after=7 del servidor:
  resultado: 7000ms (debe ser 7000)

shouldRetry por código HTTP:
  400: false
  401: false
  403: false
  404: false
  408: true
  429: true
  500: true
  529: true

Simulación: wrapper con fallo transitorio (fake 429 dos veces, después OK):
[retry] intento 1/3 — status=429 — esperando 1000ms
[retry] intento 2/3 — status=429 — esperando 1000ms
Resultado final: {"content":[{"type":"text","text":"ok"}]}
```

**Lectura detallada**:

- **Backoff exponencial**: 1147ms → 2085ms → 4027ms → 8127ms → 17100ms. No son potencias exactas de 2 porque el jitter agrega ±25% aleatorio. Cada vez que corras esto los números van a ser ligeramente distintos — eso es exactamente lo que queremos, dispersión temporal.
- **Con `retry-after=7`**: el wrapper ignora la fórmula y respeta los 7000ms del header. Crítico para 429.
- **`shouldRetry`**: los 4 fatales (400/401/403/404) caen en `false`, los 4 transitorios (408/429/500/529) caen en `true`. Coincide con la tabla de Lección 08.
- **Simulación del loop completo**: una función `fakeCall` falla 2 veces con 429 (y `retry-after: 1`) y a la tercera devuelve `{content: [...]}`. El wrapper reintentó exactamente 2 veces, esperó 1 segundo entre cada uno (respetando `retry-after`), y al tercer intento devolvió el resultado. **El loop cumplió su contrato**: el caller nunca vio el fallo, solo el resultado final.

Este wrapper es conceptualmente idéntico a lo que hace el SDK oficial. Si lo mirás bien, son ~30 líneas de TypeScript — y funciona en cualquier runtime JavaScript (Node, Deno, Bun, edge workers, navegadores).

**Paso 4 — Combinar el wrapper con el SDK (para lógica extendida)**

A veces querés la conveniencia del SDK pero con más retries que los defaults, y con tu propia lógica de logging:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ maxRetries: 0 }); // desactivás el SDK

async function callWithCustomRetries(params: Anthropic.MessageCreateParams) {
  return withRetries(
    () => client.messages.create(params),
    { maxRetries: 5 }
  );
}

const resp = await callWithCustomRetries({
  model: "claude-haiku-4-5",
  max_tokens: 50,
  messages: [{ role: "user", content: "Hola" }],
});
```

**Patrón sutil pero importante**: desactivamos los retries del SDK (`maxRetries: 0`) para no tener **dos capas** de retries (las del SDK adentro y las tuyas afuera). Con dos capas, un 429 provoca `sdk_retries * your_retries` intentos totales — si ambos están en 5, son 25 intentos reales, y tu backoff acumulado puede crecer a minutos sin que te des cuenta. Una sola capa de retries, siempre.

## Anti-patterns

- ❌ **Reintentar un error fatal (400, 401, 403, 404)**. Tu JSON roto no se arregla por volver a mandarlo. Tu key inválida tampoco. Clasificá primero, decidí después.
- ❌ **Retries sin backoff**. Un `while (true) { try { call() } catch { continue } }` es peor que no tener retries — es un DoS a tu propia app y al servidor de Anthropic.
- ❌ **Backoff sin jitter**. Cuando 1000 clientes se sincronizan y reintentan exactamente al mismo milisegundo, el 429 vuelve instantáneo. Siempre agregá ±25% aleatorio.
- ❌ **Retries sin `maxRetries`**. Sin tope, un request colgado puede reintentar por horas. Usuario ya cerró la pestaña. Operador confundido. **Siempre un tope**, típico 3-5.
- ❌ **Ignorar el header `retry-after`**. El servidor te dijo literalmente "esperá 7 segundos" y tu código espera 1. Te vas a comer otro 429 seguro. **Respetalo**.
- ❌ **Dos capas de retries superpuestas**. Si usás el SDK con retries activados y además lo envolvés en tu propio wrapper, multiplicás los intentos: `sdk_retries * your_retries`. Desactivá una de las dos capas.
- ❌ **Usar exponential backoff para streaming**. Si un stream falla a mitad de generación, reintentar desde cero te genera todo de nuevo y pagás los tokens dos veces. En streaming, el manejo es distinto: mejor abortar y que el usuario reintente explícitamente.
- ❌ **Backoff infinito sin cap**. `2^20 ms` son ~17 minutos. Sin cap, un retry al intento 20 queda esperando casi 3 horas. Cap a 30s-60s máximo.
- ❌ **Loggear el retry como `ERROR`**. Un retry exitoso es un **éxito** después de un fallo transitorio. Loggealo como `WARN` o `INFO` con contexto, no como `ERROR`, o vas a llenar tu alerting de falsos positivos.
- ❌ **Reintentar pero con un prompt ligeramente distinto**. Tu retry debería ser **el mismo request exacto**. Cambiar el body entre intentos rompe la idempotencia y te hace imposible debuggear después.

## Recap

- **Qué reintentar**: 408, 409, 429, 5xx, y errores de conexión. **Qué NO reintentar**: 400, 401, 403, 404, 413.
- **El SDK oficial lo hace por vos**: `maxRetries: 2` por default, exponential backoff corto, respeta `retry-after`. Configurable global o per-request con la option `maxRetries`.
- **Fórmula manual**: `min(base * 2^attempt + jitter, cap)`. `base=1000`, `cap=30000`, `jitter` ±25%. Si hay `retry-after`, gana sobre la fórmula.
- **Siempre un `maxRetries` tope**: típicamente 3-5. Sin tope, tu request puede colgarse por horas.
- **Evitá dos capas de retries** (SDK + tu wrapper). Desactivá una de las dos para no multiplicar intentos.
- **30 líneas de TypeScript** te dan un wrapper genérico que funciona contra cualquier función async, no solo la API de Anthropic.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/sdks/typescript](https://platform.claude.com/docs/en/api/sdks/typescript) y [platform.claude.com/docs/en/api/rate-limits](https://platform.claude.com/docs/en/api/rate-limits)
**Ejercicio:** (esta lección no tiene ejercicio propio — el patrón de retries se ejercita en el lab `ex-01-07-chat-cli`)
