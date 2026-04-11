# count_tokens antes de llamar

## Objetivo

Al terminar sabrás usar el endpoint **`POST /v1/messages/count_tokens`** para medir cuántos tokens de input va a consumir un request **antes de enviarlo de verdad**, por qué es **gratis** y por qué es la única forma honesta de **presupuestar** prompts grandes. Vas a ver un caso real donde el número que devuelve `count_tokens` coincide exacto con el `usage.input_tokens` del request real.

## Concepto

### Qué es count_tokens

Es un endpoint paralelo a `/v1/messages` que **no genera respuesta** — solo cuenta los tokens que consumiría el request equivalente. Misma autenticación, mismos headers, mismo body shape (`model`, `messages`, `system`, `tools`...), pero en vez de devolver una respuesta, te devuelve:

```json
{ "input_tokens": 56 }
```

Eso es todo. Un número.

### Por qué es crítico

Tres razones prácticas:

1. **Es gratis.** No se cobra. No hay excusa para no llamarlo cuando tenés duda sobre el tamaño de un prompt.
2. **Es exacto.** No es una aproximación heurística como las que calculan librerías tipo `tiktoken`. Es el **mismo tokenizer del servidor** contando el mismo input que enviarías. El número que te devuelve va a coincidir **bit a bit** con el `usage.input_tokens` que recibirías si enviaras el request de verdad. Lo vamos a verificar en la ejecución real.
3. **Te deja presupuestar antes de gastar.** Estás armando un pipeline que va a mandar 10 mil documentos a Claude con un system prompt de 2000 palabras. ¿Cuánto va a costar? En vez de adivinar o mandar 1 a ver, llamás a `count_tokens` sobre un documento representativo + system y multiplicás por 10k + overhead de output esperado. Estimación seria, no estimación-de-pasillo.

### Campos que acepta

El body es **un subset de los campos de `/v1/messages`**. Soporta:

- **`model`** (requerido) — el modelo importa porque tokenizers pueden variar ligerísimo entre familias. Pasá el mismo modelo que vas a usar en el request real.
- **`messages`** (requerido) — el array de turnos, exactamente igual que en `/v1/messages`.
- **`system`** (opcional) — el system prompt, como string o array de bloques.
- **`tools`** (opcional) — si vas a pasar tools (Módulo 5), count_tokens incluye el costo de las definiciones de tools en el total.

**No soporta** los campos que no tienen impacto en input tokens: `max_tokens`, `temperature`, `top_p`, `top_k`, `stop_sequences`, `metadata`, `stream`. Si los pasás, son ignorados (o te devuelve 400 en algunos, mejor no pasarlos).

### Qué no es

- **No es un "dry run"**. No emula la respuesta ni estima output tokens. Solo cuenta input. Para estimar output, tenés que asumir un output máximo razonable según tu `max_tokens` y calcular costo con la fórmula habitual.
- **No respeta prompt caching**. Te devuelve el input_tokens sin asumir que algún prefijo está cacheado. Si vas a usar caching, el número que te da es el escenario "todo uncached" — el peor caso.
- **No incluye el costo de la llamada de count_tokens misma**, porque no hay costo. Pero **sí cuenta hacia tus rate limits** — cada llamada a count_tokens consume un request de tu cuota por minuto.

### El patrón operativo: presupuestar antes de gastar

El caso canónico:

```typescript
// Antes de mandar el request "real"
const count = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
  method: "POST",
  headers: { /* ... */ },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    system: largeSystemPrompt,
    messages: buildMessages(userInput, historyTurns),
  }),
}).then((r) => r.json());

const expectedOutputTokens = 500; // tu estimación
const costUSD =
  (count.input_tokens * 3) / 1_000_000 + // Sonnet 4.6: $3/MTok input
  (expectedOutputTokens * 15) / 1_000_000; // $15/MTok output

if (costUSD > MAX_COST_PER_REQUEST) {
  throw new Error(`Prompt demasiado caro ($${costUSD.toFixed(4)}). Recorta historial.`);
}

// Recién ahora mandás el request real
const response = await fetch("https://api.anthropic.com/v1/messages", { /* ... */ });
```

Este patrón te salva cuando un usuario pega un texto de 50k tokens en un chatbot sin darse cuenta — el count_tokens te avisa *antes* de gastar $1 en un solo prompt.

## Ejecución real

**Paso 1 — Count tokens sobre un request simple**

```bash
curl -s https://api.anthropic.com/v1/messages/count_tokens \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "messages": [{"role": "user", "content": "Hola mundo, explícame qué es TCP en 2 frases."}]
  }'
```

Respuesta real:

```json
{ "input_tokens": 26 }
```

**26 tokens** para ese turno con ese modelo. Sin mandar nada a generar — y sin que Anthropic te cobre un centavo.

**Paso 2 — Count tokens sobre un request con `system`**

Metemos un system y un user más elaborado:

```bash
curl -s https://api.anthropic.com/v1/messages/count_tokens \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "system": "Eres un asistente técnico. Respondes en español, en 3 bullets máximo, sin preámbulos.",
    "messages": [
      {"role": "user", "content": "Explica qué es HTTPS y en qué se diferencia de HTTP."}
    ]
  }'
```

Respuesta real:

```json
{ "input_tokens": 56 }
```

**56 tokens**. Del total, ~30 vinieron del system prompt (verificable llamando a count_tokens sin el system y restando). Eso te deja evaluar numéricamente cuánto te cuesta el system que estás usando — información valiosa para decidir si vale la pena cachearlo.

**Paso 3 — Verificar que count_tokens es exacto (no aproximado)**

Enviamos el **mismo request** al endpoint real (con `max_tokens: 1` para que la generación sea trivial y barata) y leemos `usage.input_tokens`:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1,
    "system": "Eres un asistente técnico. Respondes en español, en 3 bullets máximo, sin preámbulos.",
    "messages": [
      {"role": "user", "content": "Explica qué es HTTPS y en qué se diferencia de HTTP."}
    ]
  }' | python3 -c "import sys,json; r=json.load(sys.stdin); print('input_tokens real:', r['usage']['input_tokens'])"
```

Respuesta real:

```
input_tokens real: 56
```

**56 y 56**. Exactos. Esto es lo que quiero que internalices: count_tokens **no es una aproximación** que anda por ahí con un margen de error. Es el **mismo tokenizer** que el servidor usa al procesar tu request real. El número es fidedigno para presupuestar, alertar, loggear.

**Paso 4 — Calcular costo estimado a partir de count_tokens**

Con los 56 input tokens y un `max_tokens: 500` para el output esperado en Sonnet 4.6 ($3/$15 per MTok):

```
costo_max = 56 × $3 / 1_000_000 + 500 × $15 / 1_000_000
         = $0.000168 + $0.007500
         = $0.007668 por llamada (peor caso)
```

Menos de un centavo en el peor caso — pero multiplicalo por 10k llamadas diarias y son ~$76.68/día, ~$2300/mes. Decisión de arquitecto: **¿Sonnet vale la pena acá?** ¿Con Haiku (`$1/$5`) bajarías a ~$0.0026 por llamada, o sea ~$780/mes, ahorrando $1500? Esa conversación tenés que poder hacerla **antes** de lanzar a producción, y count_tokens es una de las piezas.

## Anti-patterns

- ❌ **Usar librerías de tokens aproximadas (`tiktoken`, heurísticas por caracteres/palabras)** para estimar input de Claude. El tokenizer de Anthropic **no es el de OpenAI** y las aproximaciones pueden equivocarse hasta un 20-30%. Usá `count_tokens`, es gratis.
- ❌ **Llamar a count_tokens en caliente en cada request de producción.** Es gratis en $, pero **consume tu rate limit**. Si ya sabés que el prompt cabe cómodo, no lo llames innecesariamente. Usalo para validar en arranque, para debuggear prompts nuevos, y para presupuestar pipelines — no para cada mensaje.
- ❌ **Pasar `max_tokens` en el body de count_tokens**. No hace nada (es output) y puede devolver 400. Pasá solo lo que afecta al input: `model`, `messages`, `system`, `tools`.
- ❌ **Asumir que count_tokens refleja el costo con caching.** No lo hace. Si tu pipeline usa prompt caching, el número de count_tokens es el **peor caso** (todo se factura como input normal). El número real de "input_tokens uncached" solo lo ves después de la llamada real.
- ❌ **Contar tokens de un texto a mano dividiendo por 4 caracteres**. Útil en servilletas, no para decisiones. Puede tener un 15% de error. Para presupuestos serios, count_tokens.
- ❌ **Mezclar models**: contar con `claude-haiku-4-5` y después llamar con `claude-opus-4-6` asumiendo el mismo número. Los tokenizers son muy parecidos pero no idénticos entre familias. Usá el **mismo model** en count_tokens y en el request real.
- ❌ **Olvidarse del `system` y de los `tools` al contar**. Si tu request real los lleva, tu count debe llevarlos también, o tu estimación va a salir más barata que la realidad.

## Recap

- **`POST /v1/messages/count_tokens`** devuelve el input_tokens exacto que consumiría el request equivalente. **Gratis**, **exacto**, **el mismo tokenizer del server**.
- **Campos aceptados**: `model`, `messages`, `system`, `tools`. **No** `max_tokens`, `temperature` ni otros knobs de output.
- **Úsalo para presupuestar** pipelines, validar prompts nuevos, alertar sobre prompts que exceden un umbral. **No lo uses** como filtro en caliente para cada request en producción (consume rate limit).
- **No refleja caching** — te devuelve el peor caso. Para medir ahorro real por caching, compará con los `cache_read_input_tokens` que te devuelva la llamada real.
- **Patrón operativo**: contar → calcular costo con las tarifas del modelo + output esperado → abortar si supera el umbral → si no, enviar el request real.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages-count-tokens](https://platform.claude.com/docs/en/api/messages-count-tokens)
**Ejercicio:** <!-- exercise:ex-01-05-count-tokens -->
