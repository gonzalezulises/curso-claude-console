# System prompts

## Objetivo

Al terminar sabrás **cuándo usar `system` vs meter la misma instrucción en el primer turno `user`**, cómo escribir un system prompt que realmente cambie el comportamiento, por qué a veces un system prompt **falla en silencio**, y vas a tener una vista previa de cómo el `system` se vuelve el candidato natural a ser **cacheado** cuando crece (Módulo 6).

## Concepto

### ¿Qué es un system prompt?

El `system` es un **campo top-level** del body de `/v1/messages` que acepta una string o un array de bloques `text`. Funcionalmente es "instrucciones que persisten fuera de los turnos de conversación":

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "system": "Eres un traductor al español de México. Traduces manteniendo registro formal.",
  "messages": [
    { "role": "user", "content": "Translate: 'See you tomorrow'" }
  ]
}
```

Claude trata al `system` como "el contrato de este rol": reglas que deben aplicar a **todos** los turnos futuros, no solo al primero.

### `system` top-level vs "role: system" de OpenAI

Si venís de la API de OpenAI, atención: **Anthropic no tiene un `role: "system"` dentro del array `messages`**. Los roles válidos en `messages[]` son `"user"` y `"assistant"`, y punto. Todo lo que en OpenAI iría como `{ "role": "system", "content": ... }` en Anthropic va como el **campo top-level `system`** del body.

Es el error más común de quienes migran. Si lo metés como turno dentro de `messages[]`, la API te devuelve un 400.

### System vs primer user turn — ¿qué cambia?

Técnicamente, un system prompt es *un lugar privilegiado para instrucciones*. Ambos enfoques — `system` vs `user` — pueden producir resultados similares, pero hay diferencias operativas:

1. **Persistencia.** El `system` queda fuera del array de turnos, así que en conversaciones multi-turno no tenés que reinyectarlo en cada turno nuevo. Se manda una vez y sigue aplicando.
2. **Caching.** Cuando prompt caching entra en juego (Módulo 6), el lugar ideal para cachear contenido grande e inmutable (instrucciones largas, manuales de producto, documentación) es el `system`. Ponerlo como primer `user` hace el cacheado más incómodo.
3. **Jerarquía implícita.** Los modelos Claude están entrenados para interpretar el `system` como **reglas del rol**, más difíciles de "desactivar" con un turno de usuario posterior que intente contradecirlas. No es prompt injection-proof, pero ayuda.

Regla operativa: **si la instrucción aplica a toda la conversación, va en `system`. Si es contexto específico de un turno (un documento que se comenta una sola vez, una pregunta puntual), va dentro del `user`**.

### Anatomía de un system prompt efectivo

Los elementos que importan para que el system realmente mueva la aguja:

<terminology>

**Rol explícito**: "Eres un X con Y experiencia". Da al modelo un ancla semántica. "Eres un asistente" no sirve — demasiado genérico. "Eres un ingeniero de redes con 15 años de experiencia explicando a pares técnicos" mueve el registro y la jerga.

**Audiencia explícita**: "respondes a developers senior", "explicas a estudiantes de secundaria", "redactas para equipo legal". Cambia el vocabulario y el nivel de detalle.

**Formato de salida explícito**: "respondes en 3 bullets máximo", "en JSON con este shape", "sin saludos ni preámbulos". Es donde vas a ver los mayores cambios medibles en el output.

**Restricciones explícitas**: "no uses emojis", "no uses tablas", "no incluyas disclaimers". Las restricciones negativas funcionan bien cuando son específicas; las genéricas ("sé breve") no mueven tanto.

**Idioma**: si tu audiencia es hispanohablante, poné *"respondes en español"* en el `system` aunque el modelo ya entienda el idioma del user turn. Eso ancla el registro y reduce variabilidad.

</terminology>

### Los system prompts fallan en silencio (spoiler importante)

Un system prompt **no es un contrato ejecutable**. Es una instrucción que el modelo usa como fuerte prior, pero puede ignorar si los incentivos del prompt del usuario empujan en otra dirección, o si la instrucción está mal redactada. Un ejemplo típico:

> *System:* "Responde solo con JSON, sin ```, sin markdown, sin preámbulos."

Y el modelo... te devuelve un bloque ```json ... ``` igual. Lo vas a ver en la Ejecución Real de abajo con un caso real de este mismo curso.

Cuando necesitás **garantía** de un formato, el curso te va a enseñar a combinar el `system` con:

1. **Prefill del turno `assistant`** — arrancar la respuesta por vos mismo con `{` para forzar al modelo a completar JSON válido (Lección 05).
2. **Structured outputs** — pasar `output_config.format` con un `json_schema` que la API valida del lado del servidor. Lo vas a ver en el Módulo 3.

Por ahora, mentalizate: el system prompt es **hint + jerarquía**, no **garantía**.

### Vista previa: el `system` como mejor candidato a cachear

En el Módulo 6 vas a aprender prompt caching. El patrón canónico es tener un `system` grande (instrucciones largas, documentación de producto, políticas legales) que **se repite idéntico en miles de llamadas**. Cacheándolo, pagás 0.1x el precio base cuando se lee en llamadas siguientes. Para eso, `system` acepta el formato array de bloques con `cache_control`:

```json
{
  "system": [
    {
      "type": "text",
      "text": "Eres un asistente experto en el manual de producto Foo v3.2. <texto largo>...",
      "cache_control": { "type": "ephemeral", "ttl": "5m" }
    }
  ]
}
```

No necesitás usar esto todavía — pero saber que el `system` **escala** a contenido enorme cacheable justifica por qué Anthropic lo separó del array `messages`.

## Ejecución real

Vamos a ver el mismo prompt (`"¿Qué es HTTPS?"`) con tres configuraciones del `system` y a observar qué cambia.

**Paso 1 — Sin `system` en absoluto**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "messages": [{"role": "user", "content": "¿Qué es HTTPS?"}]
  }'
```

Output real (abreviado):

```
# HTTPS

**HTTPS** (HyperText Transfer Protocol Secure) es la versión segura de HTTP...

## Características principales

### 🔒 Seguridad
- Encripta los datos transmitidos entre tu navegador y el servidor
- Protege información sensible...

### 🔑 Autenticación
- Verifica que estés conectado al sitio web legítimo
...

stop_reason: "max_tokens"
usage: input_tokens=17, output_tokens=200
```

Observaciones: Claude eligió **markdown con headings, bullets y emojis**, y **se cortó contra `max_tokens: 200`** (mirá el `stop_reason`). Sin reglas de formato, el modelo hace lo que "le parece" (que suele ser denso y bonito, pero no es lo que tu app necesita).

**Paso 2 — Con un `system` que define rol, audiencia y formato**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "system": "Eres un ingeniero de redes con 15 años de experiencia explicando a pares técnicos. Respondes en español, sin saludos ni preámbulos, en 3 bullets máximo.",
    "messages": [{"role": "user", "content": "¿Qué es HTTPS?"}]
  }'
```

Output real:

```
• Protocolo seguro: HTTP con capa de cifrado TLS/SSL que encripta la
  comunicación entre cliente y servidor, evitando que terceros
  intercepten datos sensibles.

• Autenticación y integridad: Valida la identidad del servidor
  mediante certificados digitales y garantiza que los datos no fueron
  alterados en tránsito.

• Obligatorio hoy: Es estándar en navegadores modernos (mostrado con
  candado), requerido por regulaciones como GDPR y esperado por
  usuarios; también mejora SEO.

stop_reason: "end_turn"
usage: input_tokens=67, output_tokens=134
```

Comparación con el Paso 1:

| | Sin system | Con system |
|---|---|---|
| `input_tokens` | 17 | 67 (+50 por el system) |
| `output_tokens` | 200 (**truncado**) | 134 (**limpio**) |
| `stop_reason` | `max_tokens` | `end_turn` |
| Formato | headings + emojis + tabla | 3 bullets planos |

Lecciones clave:

- El system gastó **50 input tokens extra** pero **ahorró 66 output tokens** y evitó truncado. Dado que output es 5x más caro que input, **salió más barato** agregar el system.
- El output quedó en un formato consumible por tu app (3 bullets), no un documento enciclopédico.
- El `stop_reason` pasó de `max_tokens` (bug) a `end_turn` (éxito).

**Paso 3 — System que intenta forzar JSON y falla sutilmente**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "temperature": 0,
    "system": "Eres un parser. Respondes EXCLUSIVAMENTE con un JSON válido que sigue este shape: {\"language\": string, \"port\": number, \"secure\": boolean}. Nada de markdown, ni ``` ni texto antes o después del JSON.",
    "messages": [{"role": "user", "content": "Dame los datos de HTTPS."}]
  }'
```

Output real:

```
```json
{"language": "es", "port": 443, "secure": true}
```
```

**Claude nos desobedeció.** Le dijimos explícitamente "nada de markdown, ni ```" y devolvió ``` igual. El JSON adentro es correcto, pero un `JSON.parse(resp.content[0].text)` **tira error de parseo** porque los backticks rompen el formato.

Esta es la lección sobre la cual se construye gran parte del Módulo 3 (prompt engineering): **cuando necesitás garantía de formato, el `system` solo no alcanza**. Opciones:

1. **Strip** manual de backticks en tu cliente (frágil pero funciona).
2. **Prefill** del turno `assistant` con `{` — arrancar la respuesta por vos mismo (Lección 05 de este módulo).
3. **Structured outputs** del API (`output_config.format: { type: "json_schema", json_schema: ... }`) — la API valida del lado del servidor (Módulo 3).

Por ahora solo memorizá: el system prompt es **fuerte**, pero **no es un contrato**.

## Anti-patterns

- ❌ **Meter `{ "role": "system", "content": "..." }` dentro de `messages[]`** como en OpenAI. En Anthropic eso es un 400. `system` es campo top-level del body.
- ❌ **System prompts genéricos del estilo "Eres un asistente útil"**. No cambian casi nada. Si no da una señal concreta (rol, audiencia, formato, restricciones), no lo pongas.
- ❌ **Dividir la misma instrucción entre `system` y el primer `user`**. Redundancia que infla tokens sin ganar nada. Elegí un lugar por instrucción.
- ❌ **Confiar en el `system` como garantía de formato.** Funciona bien para tono y estructura aproximada. Para JSON estricto o shapes específicos, necesitás prefill, structured outputs, o validación post-respuesta.
- ❌ **Escribir system prompts de miles de tokens sin activar caching.** Si tu system es > 1024 tokens y se repite en muchas llamadas, estás tirando dinero sin prompt caching. Activalo en el Módulo 6.
- ❌ **Meter información específica de un turno en el `system`.** Ejemplo: poner el nombre del usuario actual en el `system`. Eso es contexto por sesión, no "rol global". Va dentro del `user` o en una conversación multi-turno.
- ❌ **Usar `system` para reglas contradictorias con el user turn**. Si el system dice "responde en inglés" y el user dice "contestame en alemán", Claude va a tener que elegir — y no está definido de antemano cuál gana. Diseña `system` y user para que sean **complementarios**, no competidores.

## Recap

- **`system` es top-level del body**, no un role dentro de `messages[]`. Quienes vienen de OpenAI caen acá todo el tiempo.
- **Un system efectivo tiene 4 componentes**: rol explícito, audiencia, formato de salida, restricciones. Los genéricos no mueven la aguja.
- **El system prompt es hint + jerarquía, no garantía**. Para formatos estrictos vas a necesitar prefill o structured outputs (Módulo 3).
- **Agregar un buen `system` suele bajar el costo total** aunque agregue input tokens: reduce output mal enfocado y truncados.
- **Preview del Módulo 6**: cuando el `system` crece, se vuelve el mejor candidato para prompt caching (0.1x el precio base en lecturas subsiguientes).

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages) · [platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts)
**Ejercicio:** <!-- exercise:ex-01-02-system-prompt -->
