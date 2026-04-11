# Anatomía completa del request

## Objetivo

Al terminar sabrás **qué hace cada campo del body de `POST /v1/messages`**, cuáles son obligatorios vs opcionales, y cuándo conviene tocarlos. Vas a poder leer cualquier request de la API y entender en un vistazo qué comportamiento está pidiendo.

## Concepto

El body de `/v1/messages` es un JSON con unos pocos campos obligatorios y un puñado de opcionales muy bien pensados. A diferencia de APIs viejas con docenas de knobs, Anthropic es deliberadamente parca: hay ~10 campos que vas a tocar en la vida real, y cada uno tiene un propósito claro.

### Los 3 campos obligatorios

<terminology>
**`model`** *(string)* — alias o snapshot del modelo a usar. `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6` o un snapshot con fecha.

**`max_tokens`** *(integer)* — techo superior de tokens que Claude puede generar en esta respuesta. Es un **máximo**, no un objetivo: el modelo puede (y suele) terminar antes. Obligatorio porque la API se niega a dejarte pedir una respuesta sin cota.

**`messages`** *(array)* — la lista de turnos de la conversación. Cada elemento es `{ "role": "user" | "assistant", "content": <string | array de bloques> }`. Ya vamos a ver multi-turno en la Lección 05.
</terminology>

Con esos tres campos ya tenés un request válido. Los demás son opcionales, pero los vas a usar muchísimo.

### Los campos opcionales que importan

#### `system` — contexto persistente

El `system` es la instrucción de alto nivel que pone a Claude en un rol o le da reglas que deben aplicar a todos los turnos. **No va dentro de `messages`** — es un campo top-level del body.

Puede ser una **string simple**:

```json
{
  "system": "Eres un asistente técnico que responde siempre en español y con ejemplos ejecutables.",
  "messages": [...]
}
```

O un **array de bloques de texto** (formato que vas a usar cuando habilites prompt caching en el Módulo 6):

```json
{
  "system": [
    {
      "type": "text",
      "text": "Eres un asistente técnico...",
      "cache_control": { "type": "ephemeral", "ttl": "5m" }
    }
  ]
}
```

La Lección 04 está dedicada íntegramente a `system`, así que por ahora solo notá que **existe y es top-level**.

#### `temperature` — aleatoriedad del sampling

Controla cuánto "se anima" Claude a elegir tokens menos probables. Rango **`0.0` a `1.0`** (en Anthropic no es 0-2 como en otras APIs).

- **`0`** → máximamente determinístico. Úsalo para extracción estructurada, traducción fiel, código que necesitás que sea idéntico turno a turno. Importante: **no es fully deterministic** — la propia doc advierte que incluso con `temperature: 0` puede haber pequeñísima variación por paralelismo interno. Es determinístico "para efectos prácticos", no criptográficamente.
- **`0.3–0.7`** → rango de "creatividad controlada" para tareas conversacionales normales.
- **`1.0`** → máxima diversidad. Lo vas a querer para brainstorming, generación de variantes, etc.

**Default si no lo pasás**: el modelo tiene un default sano que nunca es el extremo — suficiente para conversación. Si te importa la consistencia del output, bajalo explícitamente; si no te importa, no lo toques.

#### `top_p` y `top_k` — sampling avanzado

Son formas alternativas (o complementarias) de acotar el sampling:

- **`top_p`** *(0–1)* — nucleus sampling. Solo considera el conjunto más pequeño de tokens cuya probabilidad acumulada supera `top_p`. `top_p=0.9` es conservador; `top_p=1.0` es "sin recorte".
- **`top_k`** *(integer)* — solo considera los `k` tokens más probables. `top_k=40` limita brutalmente la cola larga.

**Recomendación de la propia doc de Anthropic**: "Usually you only need to use `temperature`. You should alter `temperature` or `top_p`, but not both". Traducción operativa: **no toques `top_p` ni `top_k` salvo que estés haciendo research, evals reproducibles, o replicando un setup específico**. En el 95% de los proyectos, `temperature` sola alcanza.

#### `stop_sequences` — el freno explícito

Un array de strings. Si Claude genera **cualquiera** de esas strings, corta la generación **justo antes** de esa string (no la incluye en el output) y el `stop_reason` de la respuesta pasa a ser `"stop_sequence"` con `stop_sequence` indicando cuál fue.

Casos típicos:

- Vas a postear el output dentro de un template y querés evitar que Claude se pase de largo: `"stop_sequences": ["</answer>"]`.
- Estás implementando un REPL y querés cortar en `"\nUser:"`.
- Querés que Claude genere una lista y pare en un marcador final.

**Ojo**: el string cortado **no aparece** en el output. Si le pedís "termina con END" y pasás `stop_sequences: ["END"]`, en el `content[0].text` NO va a estar "END". La señal de que pasó es `stop_reason === "stop_sequence"`.

#### `metadata.user_id` — tracking per usuario final

Un objeto con una sola llave útil hoy: `user_id` (una string **opaca** — no pongas PII como email o nombre). Sirve para:

- **Analytics**: en el dashboard vas a poder filtrar consumo por user_id.
- **Abuse detection**: Anthropic usa `user_id` como señal para detectar abuso de tu propio servicio sin afectar a tus otros usuarios.
- **Rate limiting granular**: en tiers avanzados podés pedir rate limits por user_id.

**Recomendación fuerte del curso**: usá `metadata.user_id` desde el día 1 aunque tu app tenga 3 usuarios. Más adelante (Módulo 11, Admin API) te vas a agradecer tener el tracking per-usuario sin tener que instrumentar nada extra.

Usá un identificador **opaco y estable**: un UUID, un hash del email, un `user_<id>` — cualquier cosa que no sea la identidad real. La Messages API no es el lugar para filtrar datos personales.

#### `stream` — SSE en vez de respuesta única

Booleano. Si `true`, la respuesta no es un JSON único sino un stream de Server-Sent Events. Lección 06 entera dedicada a esto.

#### `service_tier` — cola de atención

Opcional. Controla cómo Anthropic enruta tu request cuando la infra está saturada:

- **`"auto"`** (default) — Anthropic decide.
- **`"standard_only"`** — no caigas a tiers degradados, fallá si no hay capacidad estándar.

En el 99% de los proyectos no lo toques. Lo vas a ver en el Módulo 6 (Optimización) cuando hablemos de batch vs real-time.

### Lo que **no** está en el request (y es intencional)

- **No hay `seed`**. Si querés reproducibilidad, usá `temperature: 0` y acordate que aún así no es bit-exacto.
- **No hay `presence_penalty` ni `frequency_penalty`**. Anthropic no expone esos knobs de OpenAI — el comportamiento lo controlás con el system prompt.
- **No hay `n` para pedir múltiples completions**. Si querés 5 variantes, hacés 5 requests (y en ese caso mirá batching, Módulo 6).

Esta parsimonia es una decisión de diseño. Menos knobs = menos formas de romper tu prompt en silencio.

## Ejecución real

Veamos tres campos opcionales "en acción" con curls reales.

**Paso 1 — `stop_sequences` freno explícito**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "stop_sequences": ["END"],
    "messages": [
      {"role": "user", "content": "Enumera los 5 primeros números primos, uno por línea. Cuando termines escribe la palabra END en una nueva línea."}
    ]
  }'
```

Respuesta real (resumida):

```json
{
  "model": "claude-haiku-4-5-20251001",
  "content": [
    { "type": "text", "text": "2\n3\n5\n7\n11\n" }
  ],
  "stop_reason": "stop_sequence",
  "stop_sequence": "END",
  "usage": { "input_tokens": 40, "output_tokens": 12, "...": "..." }
}
```

Observá:

- `content[0].text` termina en `"11\n"` — la "END" **no aparece**.
- `stop_reason` pasó a `"stop_sequence"` (en vez del habitual `"end_turn"`).
- `stop_sequence` contiene cuál fue exactamente (útil si pasaste varias).

Esa combinación `stop_reason + stop_sequence` es tu mecanismo para saber "la generación se cortó por el freno que yo puse, no porque Claude haya terminado naturalmente".

**Paso 2 — `temperature: 0` para reproducibilidad**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 60,
    "temperature": 0,
    "messages": [{"role": "user", "content": "Inventa un nombre de gato en una sola palabra. Solo la palabra, sin nada más."}]
  }'
```

Respuesta real:

```json
{
  "content": [ { "type": "text", "text": "Misifu" } ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 30, "output_tokens": 7, "...": "..." }
}
```

Correlo varias veces. Lo más probable es que siga devolviendo `"Misifu"` o alguna de 2-3 opciones fijas. Sin `temperature: 0`, cada corrida te va a dar nombres distintos — más divertido para humanos, más frustrante para tests automatizados. Para extracción estructurada y tests, **`temperature: 0` es casi siempre lo que querés**.

**Paso 3 — `metadata.user_id` opaco**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 40,
    "metadata": {"user_id": "user_7f9c1b3a-opaque-id"},
    "messages": [{"role": "user", "content": "Responde solo OK"}]
  }'
```

Respuesta real:

```json
{
  "content": [ { "type": "text", "text": "OK" } ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 12, "output_tokens": 4, "...": "..." }
}
```

La respuesta es idéntica a si no hubieras pasado `metadata` — **el `user_id` no afecta el contenido**. El efecto lo vas a ver en **Analytics** del dashboard, donde vas a poder desagregar consumo por ese identificador. No vas a ver feedback inmediato en este curl; es infraestructura para el futuro.

## Anti-patterns

- ❌ **Tocar `top_p` y `temperature` juntos**. La propia doc dice explícitamente: alterá una o la otra, no las dos. Si no sabés por qué estás tocando `top_p`, no lo toques.
- ❌ **Pasar emails, nombres o teléfonos en `metadata.user_id`**. Es el lugar perfecto para filtrar PII por accidente. Usá un hash o un UUID.
- ❌ **Olvidarte de `max_tokens`**. No es opcional — la API te devuelve 400. Ponele un número generoso pero finito (por ejemplo, `1024` para respuestas conversacionales, `4096` para outputs largos). Si chocás mucho con `stop_reason: "max_tokens"`, subí el número.
- ❌ **Asumir que `temperature: 0` es bit-exacto**. No lo es. Es reproducible para efectos prácticos (mismo output ~siempre en prompts cortos), pero no es seed-determinístico.
- ❌ **Meter el `system` dentro de `messages` como primer turno `"role": "system"`**. **Esa sintaxis no existe en Anthropic**. En la Messages API los roles válidos son `"user"` y `"assistant"` — `"system"` es un **campo top-level** del body, no un rol. Es un error que importan mucho los que vienen de OpenAI.
- ❌ **Meter la misma instrucción en `system` y dentro del primer `user`**. Redundancia que infla input tokens por las dudas. Elegí uno: si es regla global, va en `system`; si es contexto específico del turno, va en `user`.
- ❌ **Escribir `stop_sequences` con mayúsculas/minúsculas no intencionales.** La coincidencia es exacta. `["END"]` no va a cortar en `"end"`. Revisá qué forma le estás pidiendo a Claude que genere.

## Recap

- **3 campos obligatorios**: `model`, `max_tokens`, `messages`. Con eso sólo ya tenés un request válido.
- **Campos opcionales que importan**: `system` (top-level, no rol dentro de messages), `temperature` (0–1), `stop_sequences`, `metadata.user_id` (opaco, usalo desde el día 1), `stream`.
- **Sampling avanzado** (`top_p`, `top_k`) está disponible pero no lo toques salvo investigación. Anthropic recomienda quedarte con `temperature`.
- **Lo que no está es intencional**: no hay `seed`, no hay `presence_penalty`, no hay `n`. Menos knobs, menos formas de romper tu prompt en silencio.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** (esta lección no tiene ejercicio asociado directo — los parámetros se ejercitan en `ex-01-02-system-prompt` y `ex-01-06-error-matrix`)
