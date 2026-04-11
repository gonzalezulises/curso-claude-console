# Errores de la API: 400, 401, 403, 404, 429, 500, 529

## Objetivo

Al terminar sabrás **reconocer cada código de error** que la API de Anthropic puede devolverte, vas a entender el **formato único** de error (mismo shape sea 400 o 529), sabrás **qué errores son reintentables** y cuáles son fatales, y vas a saber el rol del campo `request_id` para escalar a soporte.

## Concepto

### El formato único de error

Todos los errores de la API comparten **un solo shape**:

```json
{
  "type": "error",
  "error": {
    "type": "<categoría del error>",
    "message": "<descripción humana>"
  },
  "request_id": "req_01ABC..."
}
```

Tres campos top-level:

- **`type`** — siempre `"error"` cuando la llamada falló. Ese discriminador te deja saber de entrada si el payload es una respuesta exitosa (`"type": "message"`) o un error.
- **`error`** — objeto con `type` (la categoría del error) y `message` (texto explicativo en inglés, destinado a developers, no a end users).
- **`request_id`** — un identificador de la request del lado del servidor. **Siempre lo vas a loggear**. Si tenés que escalarle un incidente al soporte de Anthropic, el `request_id` es lo primero que te van a pedir. Sin él, el equipo de soporte casi no puede investigar.

Lo bueno de tener un shape único: tu código de manejo de errores es un solo lugar en vez de casos por código HTTP separados.

### La tabla de códigos HTTP y qué significan

<terminology>
**`400 invalid_request_error`** — tu request está mal formado. Campos faltantes (`max_tokens`), JSON roto, modelos inexistentes a veces, parámetros fuera de rango, tipos incorrectos. **Fatal**: reintentar con el mismo body va a fallar igual. El mensaje te dice qué campo está mal.

**`401 authentication_error`** — la `x-api-key` es inválida, revocada, o está mal. **Fatal** en caliente: reintentar con la misma key no sirve. Acción: alertar al equipo porque probablemente la key se rotó y tu app no se enteró.

**`403 permission_error`** — la key es válida pero no tiene permiso para este recurso (ej: una workspace key intentando usar endpoints `/v1/organizations/*` que requieren Admin API key — Módulo 11). **Fatal**: no reintentar, revisar qué key estás usando para qué llamada.

**`404 not_found_error`** — el recurso que pediste no existe. En Messages API normalmente significa un **modelo que no existe** (typo, modelo deprecado que ya salió de servicio, o dated snapshot no válido). **Fatal**: revisar el string del modelo.

**`413 request_too_large`** — el body del request supera el límite de tamaño. **Fatal** sin cambio: reducí el prompt, dividí en chunks.

**`429 rate_limit_error`** — excediste el rate limit de tu tier. Puede ser por requests por minuto, tokens por minuto, o tokens por día. **Reintentable con backoff**: la API te está diciendo "ahora no, esperá". Tu código **debe** reintentar con exponential backoff.

**`500 api_error`** — algo se rompió del lado del servidor de Anthropic y no es tu culpa. **Reintentable con backoff**: raro de ver, pero si pasa, es un problema transitorio.

**`529 overloaded_error`** — la infraestructura de Anthropic está saturada. Pasa en picos de demanda. **Reintentable con backoff más largo**: la API básicamente te pide que la dejes respirar.
</terminology>

### La política por código

La regla mental que te salva:

| Código | Reintentar | Espera recomendada |
|---|---|---|
| `400` | ❌ NO | — (fatal hasta corregir el body) |
| `401` | ❌ NO | — (fatal hasta rotar key) |
| `403` | ❌ NO | — (fatal hasta corregir scope) |
| `404` | ❌ NO | — (fatal hasta corregir modelo) |
| `413` | ❌ NO | — (fatal hasta reducir tamaño) |
| `429` | ✅ SÍ | Backoff: 1s, 2s, 4s, 8s... (con jitter) |
| `500` | ✅ SÍ | Backoff: 1s, 2s, 4s... (raro — si persiste, incidente) |
| `529` | ✅ SÍ | Backoff más agresivo: 5s, 15s, 45s... |

**Dos categorías mentales**:

- **Fatal (no reintentar)** — el problema está de tu lado. Reintentar no cambia nada. Acción: loggear, alertar si aplica, devolver error al usuario/caller.
- **Reintentable (con backoff)** — el problema es transitorio (del servidor o de saturación). Acción: esperar, reintentar, hasta un tope de intentos.

### Refusals y otros "no errores" que parecen errores

**Una cosa importante**: una `refusal` del modelo (el clasificador de seguridad corta la generación) **no es un error HTTP**. La API te devuelve **200 OK** con `stop_reason: "refusal"`. Tu código tiene que manejarlo como una rama distinta del flujo, no en el catch de errores.

Similar con `stop_reason: "max_tokens"` (respuesta truncada): también es 200 OK, no error — pero tu output está cortado, así que tu app lo debería tratar como un caso especial.

La regla: **errores HTTP ≠ problemas con la respuesta**. Una llamada puede "tener éxito" (200) y aun así no darte lo que necesitás. El `stop_reason` es tu sensor del segundo caso.

### El rol del `request_id`

Tres razones por las que **siempre** lo loggueás:

1. **Escalación a soporte**: sin `request_id`, soporte no puede investigar incidentes en su logs.
2. **Deduplicación**: dos errores con el mismo `request_id` son el mismo evento (raro, pero útil en retries).
3. **Correlación con tu trace distribuido**: en un sistema con OpenTelemetry o similar, meter el `request_id` como atributo del span te correlaciona los logs de Anthropic con los tuyos.

El `request_id` también está presente en respuestas exitosas, normalmente en un header HTTP (`request-id`). Para errores, también viene en el body como vimos arriba.

## Ejecución real

Vamos a provocar 4 errores distintos con curls reales y ver los shapes.

**Caso 1 — 400 invalid_request_error: `max_tokens` faltante**

```bash
curl -s -w "HTTP %{http_code}\n" https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"hola"}]}'
```

Output real:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "max_tokens: Field required"
  },
  "request_id": "req_011CZxXcfahryZyt6K7bmHjK"
}
HTTP 400
```

El mensaje es **accionable**: te dice exactamente qué campo faltó. Tu código de error debería poder matchear sobre `error.type === "invalid_request_error"` para distinguirlo de un 401 sin depender del código HTTP.

**Caso 2 — 401 authentication_error: key inválida**

```bash
curl -s -w "HTTP %{http_code}\n" https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk-ant-api03-clearly-invalid-key-for-testing" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":50,"messages":[{"role":"user","content":"hola"}]}'
```

Output real:

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "invalid x-api-key"
  },
  "request_id": "req_011CZxXcksT9uJGyyztXuWXg"
}
HTTP 401
```

Señal inequívoca de que la key es el problema. En producción, este error es típicamente por **rotación de key**: alguien rotó la `ANTHROPIC_API_KEY` en el vault pero tu app todavía tiene la vieja cacheada en memoria.

**Caso 3 — 404 not_found_error: modelo inexistente**

```bash
curl -s -w "HTTP %{http_code}\n" https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-banana-9-0","max_tokens":50,"messages":[{"role":"user","content":"hola"}]}'
```

Output real:

```json
{
  "type": "error",
  "error": {
    "type": "not_found_error",
    "message": "model: claude-banana-9-0"
  },
  "request_id": "req_011CZxXcmm2NbQ6A4iCtz7Ef"
}
HTTP 404
```

El `message` te devuelve el nombre del modelo inválido como lo escribiste. Si venías de pasar una variable de entorno mal, eso te permite ver inmediatamente que tu `DEFAULT_MODEL` tiene typo.

**Caso 4 — 400 por JSON malformado**

```bash
curl -s -w "HTTP %{http_code}\n" https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{invalid json'
```

Output real:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "The request body is not valid JSON: unexpected character: line 1 column 2 (char 1)"
  },
  "request_id": "req_011CZxXcnWB9Nx7Cmh5CcxEr"
}
HTTP 400
```

Observá: es **el mismo `invalid_request_error`** que el Caso 1, pero el `message` te dice exactamente dónde está el problema en tu JSON (línea, columna, carácter). Este es el tipo de ayuda que te salva 10 minutos de debuggear.

**Paso 5 — Handler de errores canónico en TypeScript**

Un handler que mapea errores a decisiones:

```typescript
type APIErrorBody = {
  type: "error";
  error: { type: string; message: string };
  request_id: string;
};

type RetryDecision =
  | { retry: true; backoffMs: number }
  | { retry: false; reason: "fatal" | "refusal" | "ok" };

function decideOnResponse(status: number, body: unknown): RetryDecision {
  if (status === 200) {
    return { retry: false, reason: "ok" };
  }

  const err = body as APIErrorBody;
  const errorType = err.error?.type;

  // Log SIEMPRE con el request_id
  console.error(
    `[claude-api] ${status} ${errorType}: ${err.error?.message} (request_id=${err.request_id})`
  );

  switch (status) {
    case 429:
      return { retry: true, backoffMs: 1000 }; // empezar en 1s
    case 500:
      return { retry: true, backoffMs: 1000 };
    case 529:
      return { retry: true, backoffMs: 5000 }; // overload: más conservador
    default:
      return { retry: false, reason: "fatal" };
  }
}
```

Este switch vive una sola vez en tu cliente de la API. Lo que viene arriba (usuarios, UI, pipelines) nunca debería ver un código HTTP — ve solo "la llamada fue exitosa", "hay que reintentar", o "error fatal, no insistas".

## Anti-patterns

- ❌ **Hacer `try/catch` genérico y reintentar ciegamente cualquier error.** Reintentar un 400 no va a arreglar tu JSON roto — va a hacerle DoS a tu propia app. Clasificá por tipo antes de decidir.
- ❌ **No loggear `request_id`.** Cuando tengas un incidente en producción y necesites que Anthropic te ayude, no vas a tener nada para darle. Loggealo **siempre**, incluso en respuestas exitosas (está en el header `request-id`).
- ❌ **Tratar `stop_reason: "refusal"` como un error HTTP.** La llamada fue 200 OK, el modelo se negó. Tu catch de errores nunca lo va a ver. Manéjalo en el path del éxito, como una rama separada.
- ❌ **Tratar `stop_reason: "max_tokens"` como éxito.** La API devolvió 200 pero tu output está truncado. Si eso llega al usuario sin aviso, es un bug silencioso.
- ❌ **Retry loops sin jitter ni límite de intentos.** Backoff sin jitter puede sincronizar a muchos clientes reintentando al mismo tiempo ("thundering herd"). Sin límite, podés colgar una request eterna. Siempre poné un `max_retries` (típicamente 3-5) y agregá jitter (±25%).
- ❌ **Mostrar `error.message` al usuario final.** Están en inglés, destinados a developers, y pueden incluir detalles internos (nombres de campos, paths JSON) que no querés exponer. Traducí a mensajes en español amigables en tu UI.
- ❌ **Asumir que un `request_id` es siempre único.** Es único por request, pero en retries de la misma llamada vas a ver distintos request_ids. No uses `request_id` como clave de idempotencia — usá un id generado por vos mismo en cada operación.
- ❌ **Confundir 400 con 422.** Anthropic no usa 422 (Unprocessable Entity) — siempre es 400 para cualquier error de validación. Tu código de cliente tiene que esperar 400, no 422.
- ❌ **Rehacer el mismo 429 en bucle sin backoff.** Si pasó rate limit, reintentar inmediatamente te va a dar otro 429 casi siempre. Esperá. En la Lección 09 vemos exactamente cómo implementar exponential backoff bien hecho.

## Recap

- **Formato único de error**: `{ type: "error", error: { type, message }, request_id }`. Matchea sobre `error.type`, no sobre HTTP status, para lógica fina.
- **Las 8 categorías que vas a ver**: `invalid_request_error (400)`, `authentication_error (401)`, `permission_error (403)`, `not_found_error (404)`, `request_too_large (413)`, `rate_limit_error (429)`, `api_error (500)`, `overloaded_error (529)`.
- **Fatal vs reintentable**: 4xx (menos 429) son fatales — no reintentes. 429/500/529 son reintentables con exponential backoff. La Lección 09 es exactamente cómo implementarlo.
- **`request_id` es oro**: loggealo siempre. Es lo primero que soporte va a pedirte en un incidente.
- **`stop_reason: "refusal"` y `stop_reason: "max_tokens"` NO son errores HTTP** — son respuestas 200 OK con una condición que tu app tiene que manejar explícitamente.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/errors](https://platform.claude.com/docs/en/api/errors)
**Ejercicio:** <!-- exercise:ex-01-06-error-matrix -->
