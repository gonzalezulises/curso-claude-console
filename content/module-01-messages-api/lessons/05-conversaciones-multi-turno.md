# Conversaciones multi-turno y prefill del assistant

## Objetivo

Al terminar sabrás **extender el array `messages[]` para mantener contexto entre turnos**, cuándo conviene resetear la conversación, qué es el **prefill del assistant** y cómo usarlo para forzar formatos de salida cuando el system prompt solo no alcanza.

## Concepto

### La Messages API es stateless

Este es el punto fundamental: **Anthropic no guarda tu conversación**. Cada llamada a `/v1/messages` es independiente. Si querés que Claude recuerde lo que se dijo en el turno anterior, **tenés que reenviarlo vos** en el array `messages`.

Esto tiene implicaciones importantes:

1. **Tú sos dueño del historial.** Lo guardás donde quieras (archivo, DB, Redis). La API no te obliga a nada.
2. **Cada turno paga los tokens de todo el historial.** Si tu conversación va por el turno 20, el input tokens de esa llamada incluye los 20 turnos previos. Esto es parte de por qué **prompt caching** (Módulo 6) es tan importante en chatbots largos.
3. **Podés editar el historial.** Nada te prohíbe borrar un turno anterior, reescribirlo, o agregar uno falso antes de enviarlo. Es poder (útil para el prefill que vemos abajo) y es responsabilidad (no mientas al usuario).

### ¿Cómo se ve un turno multi-turno?

El array `messages` alterna roles `"user"` y `"assistant"`. El último elemento debe ser **siempre** `"user"` si querés que Claude responda (si el último es `"assistant"`, Claude va a intentar continuar ese mismo turno — que es exactamente lo que el prefill explota):

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 150,
  "messages": [
    { "role": "user",      "content": "Mi perro se llama Toto. Recuerda su nombre." },
    { "role": "assistant", "content": "Entendido, tu perro se llama Toto y lo recordaré durante nuestra conversación." },
    { "role": "user",      "content": "¿Cómo se llamaba mi perro?" }
  ]
}
```

La respuesta de Claude va a ser el **próximo turno assistant**, que después vos agregás al historial antes del próximo user turn. El loop de un chatbot es literalmente:

```
loop {
  leer input del usuario
  messages.push({ role: "user", content: input })
  resp = POST /v1/messages con { messages }
  texto = extraer texto de resp.content
  mostrar texto al usuario
  messages.push({ role: "assistant", content: texto })
}
```

### Reglas del `messages` array

Cosas que la API te va a rechazar con 400:

- **El array vacío.** Necesitás al menos un turno.
- **Dos turnos consecutivos del mismo role.** No podés mandar `[user, user]` ni `[assistant, assistant]`. Si tu usuario mandó dos mensajes seguidos, combinalo en un solo turno.
- **Empezar con `"assistant"`**. El primer turno tiene que ser `"user"`. (Nota: hay casos avanzados — agentes con pause_turn — donde la historia *reanuda* con un estado que ya incluye assistant; para conversaciones normales, empezá siempre con user).

Cosas que **son legales**:

- **Terminar con `"assistant"`** — eso es el prefill, y veremos la mecánica más abajo.
- **Content como string o como array de bloques.** `"Hola"` es atajo para `[{ "type": "text", "text": "Hola" }]`. Usá el array cuando necesites múltiples bloques (imagen + texto, tool_result, etc.).

### ¿Cuándo resetear la conversación?

Tu historial crece indefinidamente si no hacés nada. Eventualmente vas a querer **cortar** — por costo, por ventana de contexto, o porque la conversación se fue de tema. Tres patrones:

1. **Sliding window** — mantenés los últimos N turnos y tirás los viejos. Simple pero pierde contexto temprano. Útil cuando la conversación es intercambio rápido sin dependencias largas.
2. **Summarization** — cuando el historial supera un umbral, le pedís a Claude que resuma los primeros K turnos en 1 párrafo, y reemplazás esos K turnos por el resumen. Mantiene contexto denso.
3. **Hard reset** — empezás un `messages` nuevo cuando el usuario cambia de tema o explícitamente reinicia. Lo más simple para apps transaccionales.

En el Módulo 9 (Managed Agents) vas a ver una tercera opción que Anthropic ofrece del lado del server: **context management** (`clear_thinking`, `clear_tool_uses`, `compact` como estrategias automáticas). Por ahora, sliding window o summarization hechos por vos.

### Prefill del assistant — la "trampa legal"

Si el último turno del array `messages` es `{ "role": "assistant", "content": "<texto parcial>" }`, Claude interpreta eso como **"el assistant ya empezó a hablar así, continuá desde ahí"**. Es la puerta de atrás para:

<terminology>
**Forzar formato JSON real** — ponés `{ "role": "assistant", "content": "{" }` y Claude continúa escribiendo el JSON, sin markdown alrededor. Como el assistant ya "abrió" el JSON, tiene que cerrarlo.

**Forzar que arranque con una palabra específica** — si querés que la respuesta empiece con "Sí," o "Basado en los datos:", metelo en el prefill.

**Saltar explicaciones innecesarias** — si Claude suele responder con un preámbulo "Claro, aquí tienes..." que no querés, prefilleá con lo que sí querés que empiece.
</terminology>

**La gotcha crítica del prefill**: la respuesta **NO incluye el prefill**. Si prefilleaste con `"{"`, `content[0].text` va a contener lo que Claude generó **después** del `{` — o sea, NO tiene el `{`. Para reconstruir el output completo tenés que **concatenar prefill + respuesta en tu cliente**.

Vamos a verlo en acción abajo — es uno de esos patterns que parecen magia la primera vez pero tienen una lógica impecable.

## Ejecución real

**Paso 1 — Una conversación de 2 turnos donde el contexto sí se mantiene**

Primer turno:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 150,
    "temperature": 0,
    "system": "Respondes en español, en 1 frase máximo.",
    "messages": [
      {"role": "user", "content": "Mi perro se llama Toto. Recuerda su nombre."}
    ]
  }'
```

Respuesta real:

```json
{
  "content": [
    { "type": "text", "text": "Entendido, tu perro se llama Toto y lo recordaré durante nuestra conversación." }
  ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 39, "output_tokens": 28, "...": "..." }
}
```

Segundo turno — agregamos el assistant anterior y la nueva pregunta:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 150,
    "temperature": 0,
    "system": "Respondes en español, en 1 frase máximo.",
    "messages": [
      {"role": "user", "content": "Mi perro se llama Toto. Recuerda su nombre."},
      {"role": "assistant", "content": "Entendido, tu perro se llama Toto y lo recordaré durante nuestra conversación."},
      {"role": "user", "content": "¿Cómo se llamaba mi perro?"}
    ]
  }'
```

Respuesta real:

```json
{
  "content": [
    { "type": "text", "text": "Tu perro se llama Toto." }
  ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 84, "output_tokens": 13, "...": "..." }
}
```

Observaciones:

- **Claude recordó el nombre.** No porque la API guarde estado — sino porque **vos reenviaste el historial**.
- **Los input tokens crecieron**: de 39 a 84. Cada turno del historial paga tokens. En un chatbot de 50 turnos, esto explota rápido — y por eso prompt caching en el system prompt y los primeros turnos vale oro.
- `stop_reason: "end_turn"` y una respuesta breve, como ordenó el system.

**Paso 2 — Prefill del assistant para forzar JSON válido**

En la Lección 04 vimos que un `system` que dice "responde solo con JSON sin ```" **falla**: Claude devolvió ```json ... ``` igual. Ahora el truco:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "temperature": 0,
    "system": "Extraes datos de protocolos de red en JSON con shape {\"language\": string, \"port\": number, \"secure\": boolean}.",
    "messages": [
      {"role": "user", "content": "Dame los datos de HTTPS."},
      {"role": "assistant", "content": "{"}
    ]
  }'
```

Respuesta real:

```json
{
  "content": [
    {
      "type": "text",
      "text": "\n  \"language\": \"HTTP\",\n  \"port\": 443,\n  \"secure\": true\n}"
    }
  ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 44, "output_tokens": 27, "...": "..." }
}
```

**Dos cosas críticas acá:**

**1. El prefill no viene en la respuesta.** `content[0].text` arranca con `"\n  \"language\""`, **sin** el `{` inicial. El `{` vive solo en tu request, no en la respuesta. Si querés reconstruir el JSON completo, hacélo vos:

```typescript
const prefill = "{";
const completion = resp.content[0].text;
const fullJson = prefill + completion;
// => '{\n  "language": "HTTP",\n  "port": 443,\n  "secure": true\n}'

const parsed = JSON.parse(fullJson);
// => { language: "HTTP", port: 443, secure: true }
```

`JSON.parse` tiene éxito. Sin el prefill, fallaba por los backticks de markdown. **Problema resuelto.**

**2. El contenido semántico se lee mal.** `"language": "HTTP"` es incorrecto: el campo se llamaba "language" (idioma) pero Claude lo interpretó como "protocolo base". Eso **no es culpa del prefill** — es ambigüedad en los nombres de campo que le pasamos. Lección paralela: **los nombres de campo en tu shape importan tanto como la instrucción**. Si hubiera sido `"protocol": "HTTPS"` hubiera respondido correcto. Este es material de prompt engineering del Módulo 3.

El prefill no te salva de prompts mal diseñados — te salva de formatos mal encuadrados.

**Paso 3 — Un prefill más corto: arranque forzado con una palabra**

Si querés que la respuesta empiece con "Sí," sin tener que rogarle en el system:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "¿Las tortugas marinas son reptiles?"},
      {"role": "assistant", "content": "Sí,"}
    ]
  }'
```

El output va a ser algo como `" son reptiles del orden Testudines..."`. Concatenás con `"Sí,"` y tenés `"Sí, son reptiles..."`. Útil cuando el pipeline río abajo espera una afirmación en el primer token.

## Anti-patterns

- ❌ **Enviar el mismo turno user dos veces consecutivas.** La API te tira 400. Si el usuario mandó dos mensajes, concatená en un solo turno.
- ❌ **Empezar `messages` con un turno `assistant`** sin que sea prefill intencional. Es un error de armado del array.
- ❌ **Asumir que el prefill viene en `content[0].text`.** No viene. Si lo necesitás, concatená en tu cliente. Perder de vista esto lleva a JSON inválido pese a que "funcionó".
- ❌ **Usar prefills muy largos**. Un prefill de media respuesta raya con mentirle al modelo y produce outputs incoherentes. Usalo como **arranque** (1-3 tokens, un `{`, un `"Sí,"`), no como medio-output.
- ❌ **No truncar el historial en chatbots de larga sesión.** Si tu conversación va por el turno 200, estás pagando input tokens por los 199 turnos anteriores en cada llamada. Sliding window o summarization — pero no dejar crecer sin control.
- ❌ **Confiar en que el modelo "se acuerda" fuera de `messages[]`.** No se acuerda. Si no está en el array que mandaste, no existe para este turno. Si ves que "Claude olvidó" algo, revisá qué estás metiendo en `messages`.
- ❌ **Prefillear texto y después tratar la respuesta como si el prefill estuviera incluido.** Gotcha recurrente: tu código hace `JSON.parse(resp.content[0].text)` y falla porque le faltaba el `{` del prefill. Tené el patrón `fullText = prefill + completion` siempre explícito.
- ❌ **Terminar turno `assistant` con espacio en blanco o salto de línea al final del prefill.** Algunos modelos se ponen raros con trailing whitespace. Si tu prefill es `"{"`, no `"{ "` ni `"{\n"`.

## Recap

- **La Messages API es stateless** — tú sos dueño del historial y lo reenvías entero cada llamada. Cada turno paga input tokens por toda la historia.
- **`messages` alterna user/assistant** y empieza con user. Dos turnos consecutivos del mismo role = 400.
- **Pattern de chatbot**: loop que hace `push(user)` → llamar API → `push(assistant)` con la respuesta → repetir.
- **Resetear el historial** cuando crece: sliding window, summarization, o hard reset. En el Módulo 9 veremos context management automático.
- **Prefill del assistant**: si terminás `messages[]` con `{ "role": "assistant", "content": "..." }`, Claude continúa desde ahí. La respuesta **no incluye** el prefill — concatenalo vos.
- **Uso canónico del prefill**: forzar JSON válido arrancando con `"{"`. Soluciona el caso de la Lección 04 donde el `system` solo no alcanzaba.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** (esta lección no tiene ejercicio propio — el patrón multi-turno se ejercita en el lab `ex-01-07-chat-cli`)
