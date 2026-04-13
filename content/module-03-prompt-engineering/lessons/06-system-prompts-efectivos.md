# System prompts efectivos: roles, restricciones, tono

## Objetivo

Al terminar sabrás **componer system prompts que realmente mueven el output**, usando la fórmula de 5 piezas (rol, experiencia, audiencia, formato, restricciones), verás la diferencia numérica entre un system genérico y uno compuesto, y entenderás cuándo escalar el system con XML tags y cuándo mantenerlo minimal.

## Concepto

### Repaso: dónde quedamos en el Módulo 1

En la Lección 04 del Módulo 1 viste que `system` es un campo top-level del body de `/v1/messages` (no un `role` dentro de `messages[]`), que es **hint + jerarquía pero no garantía**, que ahorra tokens netos cuando está bien diseñado, y que es el candidato natural para prompt caching. Todo eso sigue aplicando.

En esta lección profundizamos: **cómo componer un system prompt que realmente controle el output**, no solo que exista.

### La fórmula de 5 piezas

Un system prompt efectivo tiene **hasta 5 componentes**. No necesitás todos siempre, pero cuando los combinás bien, el output se vuelve predecible:

<terminology>

**1. Rol con experiencia concreta**: "Eres una arquitecta de software senior con 12 años de experiencia" > "Eres un asistente útil". La experiencia concreta ancla el nivel técnico del output. "12 años" no es literal — pero le dice al modelo "producí texto como lo haría alguien con esa profundidad".

**2. Audiencia con contexto**: "explicando a developers backend que ya conocen HTTP y criptografía" > "explicando a usuarios". Le dice al modelo qué puede asumir como sabido y qué necesita explicar. **Lo que no se dice es tan importante como lo que se dice**: si decís "developers", el modelo no va a explicar qué es una variable.

**3. Formato del output**: "≤180 palabras, sin headings, sin código salvo que sea absolutamente necesario" > nada. Sin restricción de formato, Claude produce markdown con headings, code blocks y emojis — probablemente no lo que tu app necesita.

**4. Restricciones concretas (lo que NO)**: "sin emojis, sin tablas, sin listas ordenadas". Las restricciones positivas ("sé breve") son vagas; las negativas ("sin emojis") son binarias y verificables.

**5. Directiva de estilo/enfoque**: "Preferís decir QUÉ algo es y POR QUÉ existe antes que listar sus partes mecánicas". Esto es la pieza más sutil — mueve el **enfoque** del output, no solo el formato. Muy útil para cambiar de "enciclopedia" a "mentoría".

</terminology>

### ¿Por qué "Eres un asistente útil" no sirve?

Es la línea que todos copian de la documentación como primer ejemplo. El problema es que no aporta **ninguna señal nueva**. El modelo ya tiene como prior "ser un asistente útil" — es literalmente lo que está entrenado para hacer. Agregar esa línea es gastar tokens para reafirmar lo que el modelo haría de todas formas.

Un system prompt **vale sus tokens de input** cuando aporta al menos una pieza que el modelo no puede inferir del contexto: un rol especializado, una audiencia específica, un formato rígido, o restricciones negativas concretas. "Asistente útil" no aporta ninguna de esas.

### System prompts largos: cuándo y cómo escalar

Hay dos escenarios legítimos para un system de muchos tokens:

**1. System como documentación de producto**: tu app tiene un system de 10K-50K tokens con el manual del producto, las políticas, los tipos de respuesta válidos y los edge cases. Es **producción real** — empresas como Notion, Replit y Cursor lo hacen. En este caso, el system se vuelve el "reglamento de la conversación" y prompt caching es obligatorio (Módulo 6).

**2. System con few-shot embebidos**: en vez de poner los ejemplos en el `user` message, los ponés en el `system` para que cacheen mejor (el system cambia menos entre llamadas que los user messages). Válido si los ejemplos no cambian entre sesiones.

En ambos casos, **estructurá el system con XML tags**:

```json
{
  "system": [
    {
      "type": "text",
      "text": "<rol>Eres una especialista en compliance GDPR.</rol>\n\n<audiencia>Abogados de empresas tech europeas.</audiencia>\n\n<reglas>\n- Solo citar artículos existentes del GDPR.\n- Si no estás segura, decir 'verificá con un abogado'.\n- No dar opiniones legales vinculantes.\n</reglas>\n\n<formato>Respuestas en ≤300 palabras. Bullets con artículo relevante entre paréntesis.</formato>"
    }
  ]
}
```

Notar que `system` acepta tanto un string plano como un array de bloques `{type: "text", text: ...}`. El formato array es el que vas a necesitar para prompt caching (agregando `cache_control`).

### System vs instrucciones en el user message

Regla simple ya vista en Módulo 1, reforzada con matices:

- **System**: reglas que aplican a **toda** la conversación. Rol, formato, restricciones globales. Se manda una vez.
- **User message**: contexto específico de **este turno**. El documento a analizar, la pregunta puntual, los datos de este usuario.

El error común es meter información per-turn en el system: nombre del usuario, hora actual, datos del ticket. Eso rompe la cacheabilidad (el system cambia en cada request) e infla tokens sin ganar jerarquía.

La única excepción es si el "per-turn" es un set muy pequeño de variables y el rest del system es enorme — en ese caso, usá el formato array con el bloque grande cacheado y el bloque chico sin cache:

```json
{
  "system": [
    {
      "type": "text",
      "text": "<reglas>...10K tokens de reglas...</reglas>",
      "cache_control": { "type": "ephemeral" }
    },
    {
      "type": "text",
      "text": "El usuario actual se llama Juan. Zona horaria: GMT-3."
    }
  ]
}
```

Pero si tu data per-turn es más que 2-3 líneas, movelo al user message.

## Ejecución real

Vamos a comparar la misma pregunta (`"Explicá qué es un JWT"`) con un system genérico vs un system compuesto con la fórmula de 5 piezas. Ambos en Haiku 4.5.

**Paso 1 — System genérico: "Eres un asistente útil"**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 400,
    "system": "Eres un asistente útil.",
    "messages": [{
      "role": "user",
      "content": "Explicá qué es un JWT."
    }]
  }'
```

Output real (abreviado — el original se cortó contra `max_tokens`):

```
# JWT (JSON Web Token)

Un **JWT** es un estándar de seguridad que permite transmitir
información de forma segura entre partes usando tokens digitales.

## Estructura

Un JWT tiene 3 partes separadas por puntos (`.`):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIx...
```

### 1. **Header** (Encabezado)
Contiene el tipo de token y el algoritmo...

### 2. **Payload** (Carga útil)
Los datos que se transmiten...

### 3. **Signature** (Firma)
Una firma digital que verifica...

## Cómo funciona

1. El servidor genera un JWT con los datos del usuario
2. El [truncado por max_tokens]

usage: input_tokens=26, output_tokens=400
stop_reason: "max_tokens"
```

**Problemas**:

- `stop_reason: "max_tokens"` — la respuesta se truncó. El modelo quería seguir.
- Formato: heading H1, subheadings H2 + H3, **negritas**, un token JWT de ejemplo enorme, lista numerada.
- 400 output tokens y no terminó. Costo alto con información que un developer senior **ya sabe** (qué es un header, qué es un payload).
- El system "Eres un asistente útil" no cambió absolutamente nada vs no tener system.

**Paso 2 — System compuesto con 5 piezas**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 400,
    "system": "Eres una arquitecta de software senior con 12 años de experiencia explicando conceptos técnicos a developers backend que ya conocen HTTP y criptografía básica. Tu audiencia son developers, no principiantes. Respondes en español rioplatense (voseo). Formato: explicación en ≤180 palabras, sin headings, sin emojis, sin código de ejemplo salvo que sea absolutamente necesario. Preferís decir QUÉ algo es y POR QUÉ existe antes que listar sus partes mecánicas.",
    "messages": [{
      "role": "user",
      "content": "Explicá qué es un JWT."
    }]
  }'
```

Output real:

```
Un JWT es un estándar para representar claims (afirmaciones) entre
dos partes de forma compacta y verificable. Básicamente es un token
que contiene datos firmados criptográficamente, permitiendo que quien
lo recibe valide su integridad sin consultar a una autoridad central.

Existe porque resuelve un problema de arquitectura: en sistemas
distribuidos, verificar identidad requería siempre contactar el
servidor de autenticación. Un JWT encapsula esa información de forma
autoverificable. El servidor firma el contenido con una clave privada;
cualquier cliente con la clave pública puede validar que nadie lo
modificó en tránsito.

Es tres segmentos separados por puntos: header (algoritmo), payload
(datos), firma (HMAC o RSA). Cada uno está codificado en base64url.
La belleza está en que es stateless: el servidor no necesita guardar
sesiones ni tokens en una base de datos para validarlos luego.

El trade-off es que una vez emitido, no podés revocarlo fácilmente.
Si querés logout verdadero o cambiar permisos al instante, necesitás
blacklist. Por eso se usan con tiempos de expiración cortos y refresh
tokens.

usage: input_tokens=149, output_tokens=302
stop_reason: "end_turn"
```

**Comparación directa**:

| | Genérico | Compuesto | Impacto |
|---|---|---|---|
| `input_tokens` | 26 | 149 | +123 (inversión en el system) |
| `output_tokens` | 400 (truncado) | 302 (completo) | −98 (y terminó) |
| `stop_reason` | `max_tokens` | `end_turn` | Completo vs truncado |
| Formato | H1/H2/H3 + negritas + code block | Prosa directa | |
| Nivel | Enciclopedia para principiantes | Explicación entre pares | |
| Trade-offs | No | Sí (revocación, blacklist) | |

El system compuesto:

- **Gastó 123 input tokens más** pero **ahorró 98 output tokens**. A ratio ~5x output/input (Haiku 4.5), ahorro neto.
- **Terminó** en `end_turn` en vez de truncarse.
- **Produjo contenido para la audiencia correcta**: trade-offs, "por qué existe", voseo rioplatense, sin pedagogía básica innecesaria.
- Incluye información que el system genérico no mencionó: stateless, revocación, refresh tokens — cosas que un developer senior **quiere saber**.

## Anti-patterns

- ❌ **"Eres un asistente útil/amigable/inteligente"** como system prompt. Gasto de tokens sin señal nueva. Si no tenés nada específico que poner, no pongas system.
- ❌ **Meter datos per-turn en el system** (nombre del usuario, hora, datos del ticket actual). Rompe cacheabilidad e infla el system sin ganar jerarquía. Movelo al user message.
- ❌ **System prompts que contradicen la instrucción del user message**. Si el system dice "responde en español" y el user dice "reply in English", el resultado es impredecible. Diseñá para que sean complementarios.
- ❌ **System sin restricciones de formato pero esperando formato específico**. Si querés bullets, decilo en el system. Si querés prosa, decilo. No asumir.
- ❌ **System de 50K tokens sin caching activado**. Si tu system supera 1024 tokens y se repite en varias llamadas, estás tirando plata. Caching es obligatorio.
- ❌ **Copiar system prompts de GPT/ChatGPT para Claude**. Los modelos están entrenados distinto — los priors y el formato de system difieren. Portá las ideas, no la letra. En particular: Claude no tiene `role: "system"` dentro de messages.
- ❌ **Un solo system prompt para todo tu producto**. Si tu app tiene un chatbot general, un clasificador de tickets y un extractor de datos, **cada uno necesita su propio system optimizado**. Un system "fits all" no es "fits none", es "fits mediocre".

## Recap

- **La fórmula de 5 piezas**: rol con experiencia, audiencia con contexto, formato del output, restricciones negativas concretas, directiva de enfoque/estilo. No siempre necesitás las 5, pero evalualas todas.
- **"Eres un asistente útil" no aporta nada** — no pongas system si no tenés señal nueva.
- **Un system compuesto gasta más input pero ahorra output** y produce respuestas que terminan en `end_turn` en vez de truncarse.
- **System escalable**: para sistemas grandes (10K+ tokens), usá formato array con XML tags y `cache_control`.
- **System vs user**: system = reglas globales de la conversación; user = datos y contexto de este turno.
- **Cada flujo distinto de tu app merece su propio system** — no reutilices uno genérico.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts)
