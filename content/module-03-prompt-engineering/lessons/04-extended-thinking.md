# Extended thinking y adaptive thinking

## Objetivo

Al terminar sabrás **cómo activar el parámetro `thinking` en la Messages API**, qué es `budget_tokens` y por qué tiene un mínimo de 1024, cómo leer los bloques `thinking` en la respuesta, cuál es la diferencia entre `enabled`, `disabled` y `adaptive`, y cuándo extended thinking justifica su costo extra vs cuándo CoT clásico o zero-shot alcanza.

## Concepto

### Extended thinking como ciudadano de primera clase

Desde Claude 3.7 Sonnet y especialmente en los modelos 4.x, Anthropic agregó **extended thinking** como parámetro nativo del body de `/v1/messages`. En vez de pedirle al modelo "pensá paso a paso" en el prompt y dejar que mezcle el razonamiento con la respuesta, **decís en el body que el modelo debe pensar en bloques dedicados**, y la respuesta viene en dos secciones:

```json
{
  "content": [
    { "type": "thinking", "thinking": "Internal reasoning...", "signature": "sig_..." },
    { "type": "text",     "text": "La respuesta final al usuario." }
  ]
}
```

Los bloques `thinking` están **separados** de los bloques `text`. Tu código puede ignorarlos, mostrarlos en un panel de debug, auditar los costos del razonamiento, o presentarlos como "cadena de pensamiento" en la UI. El `text` es lo que el usuario final ve.

### El parámetro `thinking` — forma exacta

La forma canónica (verificada con la documentación oficial):

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 8000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 5000
  },
  "messages": [...]
}
```

Las variantes posibles del objeto `thinking`:

<terminology>

**`{ type: "enabled", budget_tokens: N }`** — activa extended thinking. `budget_tokens` es cuántos tokens puede gastar el modelo razonando. **Restricciones duras**:
- `budget_tokens` debe ser ≥ **1024**.
- `budget_tokens` debe ser **estrictamente menor** que `max_tokens`.

**`{ type: "disabled" }`** — extended thinking desactivado. Equivalente a no mandar el campo `thinking` en absoluto. Útil para tener el mismo body estructurado con un toggle.

**`{ type: "adaptive" }`** — el modelo **decide por sí mismo** si necesita pensar y cuánto. Si el problema es trivial (ej: "¿capital de Francia?"), no razona nada; si es complejo, razona hasta donde hace falta. No lleva `budget_tokens` porque el modelo elige.

**`display: "summarized"` | `"omitted"`** — campo opcional en `enabled` y `adaptive`. Controla cómo aparecen los bloques `thinking` en la respuesta:
- `"summarized"` (default): devuelve un resumen del razonamiento, legible, con la firma que permite continuar multi-turno.
- `"omitted"`: no devuelve el contenido, pero sí una firma criptográfica (`signature`) que podés reusar en turnos posteriores para que el modelo "recuerde" su razonamiento sin exponerlo al cliente.

</terminology>

El piso de 1024 tokens es **diseño, no arbitrario**: debajo de ese número el razonamiento no tiene suficiente espacio para ser útil y Anthropic prefiere que ni lo intentes. Si solo necesitás 500 tokens de razonamiento, probablemente no necesitás extended thinking — un CoT clásico en el prompt alcanza.

### `budget_tokens` es un máximo, no un objetivo

Regla importante: **el budget es un techo, no un mínimo**. Si pasás `budget_tokens: 5000` pero el problema es trivial, el modelo puede gastar 5 tokens de thinking y pasar al `text`. **Solo pagás por los tokens que efectivamente gastó** el modelo pensando.

En la Ejecución Real vas a ver un caso donde `budget_tokens: 2048` y el modelo gasta **5 caracteres** de thinking porque la pregunta era "¿capital de Francia?". El budget es una **cota superior de seguridad** — le decís "no gastes más de N tokens pensando, aunque te parezca necesario".

### ¿Qué cuesta extended thinking?

Los tokens de thinking **se cobran como output tokens normales del modelo**. No son "gratis" ni una categoría aparte. Si configurás `budget_tokens: 5000` y el modelo gasta 3000, tu `usage.output_tokens` va a incluir esos 3000 + los tokens del `text` block visible.

Dicho en plata: extended thinking es una técnica de **gastar más output tokens para ganar calidad**, no de ahorrar. Úsalo donde la calidad compensa el costo.

### ¿Cuándo sí y cuándo no?

**Activá extended thinking cuando:**

- El problema requiere razonamiento multi-paso que un modelo mediano (Haiku o Sonnet sin thinking) puede hacer mal.
- Querés **separar el razonamiento del output final** para auditoría o presentación (ej: loggear el razonamiento pero mostrar solo el resultado).
- Estás en un modelo que lo soporta (4.x, 3.7 Sonnet) y el costo extra es aceptable.
- Hacés evaluación donde necesitás ver cómo el modelo llegó a la respuesta.

**NO actives extended thinking cuando:**

- La tarea es lookup puro, extracción estructurada o clasificación simple con few-shot. Thinking no agrega nada y multiplica costos.
- Latencia importa (UX de chat real-time). Thinking agrega segundos.
- Estás en Haiku o en un modelo que no lo soporta (el request devuelve 400).
- Ya tenés buen resultado con CoT clásico y querés portabilidad entre modelos.
- **Ya activaste CoT en el prompt**. No combines ambos — es redundante, gastás el doble, y el modelo se confunde.

### Adaptive thinking: el modelo decide

`{ type: "adaptive" }` es el caso más interesante en producción: **delegás al modelo la decisión** de cuánto pensar. El modelo ve el problema y elige:

- Pregunta trivial → cero tokens de thinking, respuesta directa.
- Pregunta de complejidad media → razonamiento corto.
- Pregunta compleja → razonamiento largo hasta resolver.

Es ideal para sistemas donde las queries varían en complejidad (ej: un chat que recibe desde "hola" hasta "resolvé este problema de optimización combinatoria"). No tenés que clasificar vos mismo y decidir el budget — el modelo se auto-regula.

El trade-off: **no tenés control determinístico del costo**. Una query "compleja" puede terminar consumiendo muchos tokens de thinking y elevar el costo de ese request. Para batch jobs con presupuesto fijo, `enabled` con budget explícito es más seguro.

### Multi-turno y la firma (`signature`)

Cuando hacés una conversación multi-turno con extended thinking, hay un detalle crítico: **los bloques `thinking` tienen una firma criptográfica** (`signature`). Si en el siguiente turno mandás el historial incluyendo turnos previos con thinking, **tenés que mandar los bloques thinking con su signature intacta** — si no, la API rechaza el request.

¿Por qué? Para que Anthropic pueda validar que el razonamiento no fue manipulado entre turnos (garantía de integridad). El `display: "omitted"` te permite **no ver** el contenido del razonamiento pero **seguir recibiendo la signature**, lo cual es el caso de uso pensado para apps que no quieren exponer el razonamiento al usuario final pero quieren mantener continuidad.

No te preocupes por esto ahora — cuando llegues a multi-turno con thinking, usá el SDK oficial que lo maneja por vos.

## Ejecución real

Vamos a correr el mismo problema con tres configuraciones: sin thinking, con thinking enabled (budget 5000), y con thinking enabled sobre una pregunta trivial (para ver adaptive budget).

**El problema**: "Tengo 17 monedas de 1, 5 y 10 centavos. El total es 91 centavos. ¿Cuántas monedas de cada tipo tengo?". Es un sistema de 2 ecuaciones con 3 incógnitas — razonamiento combinatorio simple pero no trivial.

**Paso 1 — Sin thinking**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 200,
    "messages": [{
      "role": "user",
      "content": "Tengo 17 monedas de 1, 5 y 10 centavos. El total es 91 centavos. ¿Cuántas monedas de cada tipo tengo? Responde solo con una línea en formato: 1c=X, 5c=Y, 10c=Z"
    }]
  }'
```

Output real:

```
Busco valores enteros no negativos para:
- X + Y + Z = 17
- X + 5Y + 10Z = 91

Restando: 4Y + 9Z = 74

Probando Z = 6: 4Y = 74 - 54 = 20 → Y = 5, X = 17 - 5 - 6 = 6 ✓

1c=6, 5c=5, 10c=6

usage: input_tokens=85, output_tokens=120
```

Acertó, **pero ignoró la instrucción de "solo una línea"** — el razonamiento está en el mismo `content[0].text` junto con la respuesta. Tu parser tiene que separar el razonamiento de la línea final con regex.

**Paso 2 — Con thinking enabled, budget 5000**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 8000,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 5000
    },
    "messages": [{
      "role": "user",
      "content": "Tengo 17 monedas de 1, 5 y 10 centavos. El total es 91 centavos. ¿Cuántas monedas de cada tipo tengo? Responde solo con una línea en formato: 1c=X, 5c=Y, 10c=Z"
    }]
  }'
```

Output real (abreviado):

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me denote:\n- x = number of 1-cent coins\n- y = number of 5-cent coins\n- z = number of 10-cent coins\n\nEquations:\nx + y + z = 17\nx + 5y + 10z = 91\n\nSubtracting: 4y + 9z = 74\n\nFrom this: 4y = 74 - 9z\ny = (74 - 9z) / 4\n\nFor y to be integer, 74 - 9z must be divisible by 4.\n[...825 characters total...]",
      "signature": "Es0QClsIDBgCKkAayhVsbw2suL7DFY6xCAGUmEVuQVXSQyjF9b..."
    },
    {
      "type": "text",
      "text": "1c=6, 5c=5, 10c=6"
    }
  ],
  "usage": {
    "input_tokens": 114,
    "output_tokens": 819
  }
}
```

Dos diferencias cruciales:

1. **El `text` block tiene exactamente una línea** — `1c=6, 5c=5, 10c=6`. Sin razonamiento mezclado. `resp.content.find(b => b.type === "text").text` devuelve directamente la respuesta parseable.
2. **El razonamiento vive en un bloque aparte** con una firma criptográfica (`signature`). Podés ignorarlo, loggearlo, o mostrarlo en un panel de "ver razonamiento".

**Paso 3 — thinking enabled sobre pregunta trivial (el budget es máximo, no objetivo)**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 8000,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 2048
    },
    "messages": [{
      "role": "user",
      "content": "¿Cuál es la capital de Francia? Responde solo con el nombre."
    }]
  }'
```

Output real:

```json
{
  "content": [
    { "type": "thinking", "thinking": "París", "signature": "..." },
    { "type": "text", "text": "París" }
  ],
  "usage": {
    "input_tokens": 56,
    "output_tokens": 13
  }
}
```

**El budget era 2048 pero el modelo gastó 5 caracteres de thinking**. Total output: 13 tokens. La lección: **no pagás por el budget — pagás por lo que el modelo efectivamente pensó**. Pasar `budget_tokens: 5000` a una conversación de preguntas mixtas no te penaliza en las preguntas simples.

**Paso 4 — Parseo desde TS**

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 8000,
  thinking: { type: "enabled", budget_tokens: 5000 },
  messages: [{
    role: "user",
    content: "Tengo 17 monedas de 1, 5 y 10 centavos...",
  }],
});

// Separar bloques por tipo
const thinkingBlock = resp.content.find((b) => b.type === "thinking");
const textBlock = resp.content.find((b) => b.type === "text");

// Loggear razonamiento (auditoría)
if (thinkingBlock && thinkingBlock.type === "thinking") {
  console.log("[thinking]", thinkingBlock.thinking);
}

// Usar solo el text block para el usuario
if (textBlock && textBlock.type === "text") {
  console.log("[respuesta]", textBlock.text);
}
```

Notar el narrowing explícito `b.type === "thinking"` — sin eso, TypeScript no sabe que el campo `thinking` existe en ese objeto.


## Curl en vivo

Este es el mismo request que se muestra arriba. Presioná **Ejecutar** para revelar la respuesta real que capturé contra la API al escribir esta lección.

<LiveCurl id="m03-extended-thinking" />

## Anti-patterns

- ❌ **`budget_tokens` ≥ `max_tokens`**. La API responde 400 `invalid_request_error`. El budget debe ser estrictamente menor al `max_tokens`.
- ❌ **`budget_tokens` < 1024**. La API responde 400. El piso es 1024 por diseño.
- ❌ **Activar thinking en Haiku 4.5 u otros modelos que no lo soportan**. Verificá en la documentación de modelos qué variantes soportan extended thinking antes de activarlo.
- ❌ **Combinar `thinking: enabled` con "pensá paso a paso" en el prompt**. Es doblemente redundante: el modelo ya está razonando en bloques dedicados; pedirle CoT encima mezcla razonamientos y gasta más tokens.
- ❌ **Pasar budget alto "por las dudas"**. Aunque no te cobra lo que no se usa, budgets excesivamente altos pueden hacer que el modelo razone de más en problemas donde no hace falta. Para adaptive balance, mejor `adaptive` sin budget explícito.
- ❌ **No separar los bloques `thinking` del `text` al renderizar**. Si hacés `resp.content[0].text`, en modo thinking eso es el bloque thinking, no la respuesta. Usá `.find(b => b.type === "text")` o iterá por tipo.
- ❌ **Mandar multi-turno sin preservar la signature**. Si hacés un segundo turno y mandás el historial sin el campo `signature` del bloque thinking anterior, la API rechaza el request. Usá el SDK oficial o preservá el bloque entero.
- ❌ **Asumir que thinking mejora todo**. Corré tu evaluación **con y sin thinking** sobre casos reales. En tareas simples, thinking puede empeorar resultados porque el modelo "sobrepiensa" y alucina intermedios.

## Recap

- **Extended thinking** es el parámetro nativo `thinking` de la Messages API que separa razonamiento y respuesta en bloques distintos.
- **`type: "enabled"`** con `budget_tokens` explícito (≥1024, < `max_tokens`) es el modo más controlado.
- **`type: "adaptive"`** delega al modelo la decisión de cuánto pensar — ideal para queries de complejidad variable.
- **`budget_tokens` es un máximo**, no un objetivo — solo pagás por lo que el modelo efectivamente gasta pensando.
- **Los bloques `thinking` tienen `signature`** que debe preservarse en multi-turno — usá el SDK oficial para evitar errores.
- **No combines thinking con CoT en el prompt** — son redundantes y gastan tokens de más.
- **Thinking es mejor que CoT clásico cuando está disponible** por la separación limpia entre razonamiento y output — pero no es gratis.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/extended-thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) · [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** <!-- exercise:ex-03-03-thinking-budget -->
