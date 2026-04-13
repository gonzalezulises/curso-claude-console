# Diseñar prompts cacheables

## Objetivo

Al terminar esta lección sabrás **cómo estructurar un prompt desde el diseño para ser máximamente cacheable** — qué va al principio (estable) y qué va al final (variable), dónde poner el breakpoint, cómo combinar `tools` + `system` + `messages` para aprovechar el cache, y los anti-patterns que invalidan silenciosamente el cache.

## Concepto

### La regla fundamental: estable primero, variable después

El cache es un **prefix match**: todo lo que está antes del `cache_control` debe ser idéntico byte-a-byte entre requests. Todo lo que está después es variable libre.

**Layout canónico de un request optimizado para cache:**

```
┌──────────────────────────────────────┐
│ tools[]       ← estable              │
│                                      │
│ system[]      ← estable              │
│   instrucciones, ejemplos, reglas    │
│   ── cache_control ──────────────── ┐│ breakpoint
│                                     ││
│ messages[]    ← puede ser variable  ││
│   conversación actual del usuario   ││
└──────────────────────────────────────┘
```

Todo lo arriba del breakpoint se cachea. Todo lo abajo es fresh cada request.

### Orden dentro del prompt

Cuando el prefix tiene varias piezas, ordenalas de **más estable a más variable**:

```
1. Identidad y rol del asistente (estable siempre)
2. Políticas / constraints (cambia raro)
3. Formato de salida (estable)
4. Ejemplos few-shot (estable — sale de un repo)
5. Documentos de referencia / contexto (estable por sesión)
   ── cache_control ──────────────────────────
6. Historial de conversación (acumula)
7. Mensaje actual del usuario (siempre variable)
```

Poniendo lo más estable arriba maximizás lo que es cacheable.

### Dónde poner el breakpoint exactamente

**Patrón típico: al final del bloque estable del system prompt.**

```json
{
  "system": [
    {
      "type": "text",
      "text": "<todo el contenido estable>",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    { "role": "user", "content": "pregunta del turno" }
  ]
}
```

**Variante con ejemplos + documentos separados:**

```json
{
  "system": [
    { "type": "text", "text": "<rol + políticas>" },
    { "type": "text", "text": "<ejemplos few-shot>" },
    {
      "type": "text",
      "text": "<document largo de referencia>",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [...]
}
```

Todo el system es cacheado (el breakpoint cierra en el último block del array).

### Cachear tools también

Si tenés muchas tools (ver módulo 5), poné el breakpoint en la **última tool**:

```json
{
  "tools": [
    { "name": "tool_a", ... },
    { "name": "tool_b", ... },
    {
      "name": "tool_c",
      ...,
      "cache_control": {"type": "ephemeral"}
    }
  ]
}
```

Cachea toda la lista de tools. Combinable con un breakpoint en system para dos niveles de cache.

### Conversational caching — history creciente

En conversaciones largas, querés cachear todo el historial **hasta el turno anterior**. Patrón:

```
turn 1: system (cached) + "hola"               → write
turn 2: system (cached) + [hola, buenas] + "2da pregunta"  ← poner breakpoint antes del último user
turn 3: system (cached) + [hola, buenas, ..., respuesta2] + "3ra pregunta"
```

Estrategia:
- Breakpoint 1: al final del system (estable siempre).
- Breakpoint 2: al final del **último turn completo** de la conversación, **antes** del turno nuevo.

Cada turno nuevo, tu breakpoint 2 avanza (nuevo final del history). El primer request del turno n+1 hace cache write del history; turnos n+2, n+3... con el mismo history hacen hits.

### El anti-pattern #1: timestamp al inicio

```json
{
  "system": "Current date: 2026-04-12 14:23:01 UTC. You are an assistant..."
}
```
Cache miss **garantizado** cada request, porque el timestamp cambia. Si necesitás dar la fecha al modelo:

**Opción A** — al final, en el user message:
```json
{
  "system": "You are an assistant. <cacheable>",
  "messages": [{ "role": "user", "content": "Today is 2026-04-12. My question is..." }]
}
```

**Opción B** — normalizá a fecha día (estable por 24h):
```json
{
  "system": "Current date: 2026-04-12. <cacheable>"
}
```
Buena para apps donde la "hora exacta" no importa.

### El anti-pattern #2: IDs de sesión/usuario en el prefix

```json
{
  "system": "You are helping user_id=abc123, session=xyz789. <instrucciones>"
}
```
Cache por-usuario fragmenta brutalmente. Mové ids al user message:

```json
{
  "system": "You are a support assistant. <instrucciones cacheables>",
  "messages": [{ "role": "user", "content": "[context: user_id=abc123] Tengo un problema con..." }]
}
```

### Mínimos de tokens — revisita

Si tu system estable mide 600 tokens, **no vas a cachear nada** con haiku-4-5 (mínimo ~2048). Dos opciones:

1. **Engordá el system**: agregá ejemplos few-shot, políticas detalladas, contexto de dominio. No es "padding" — es contenido que mejora la calidad.
2. **Subí de modelo**: Sonnet/Opus tienen mínimos ~1024. A veces el salto a sonnet + cache sale más barato que haiku sin cache.

## Ejecución real

**Prompt mal diseñado (no cacheable):**

```typescript
const systemText = `Current time: ${new Date().toISOString()}
You are a financial analyst...`;

// Cada call va a tener un timestamp distinto → cache miss perpetuo
```

Métrica:
```
call 1: write=5000 read=0
call 2: write=5001 read=0   ← cache miss por timestamp distinto
call 3: write=5002 read=0
```

**Prompt bien diseñado (cacheable):**

```typescript
const systemText = `You are a professional financial analyst. Rules:
1. Always check current ratio
2. Check quick ratio
3. <... 20K tokens de reglas y ejemplos estables ...>`;

for (let i = 0; i < 5; i++) {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{
      role: "user",
      content: `Today is ${new Date().toISOString()}. Analiza el balance X${i}...`
    }],
  });
  const u: any = resp.usage;
  console.log(`call ${i}: input=${u.input_tokens} write=${u.cache_creation_input_tokens} read=${u.cache_read_input_tokens}`);
}
```

Resultado real con 5400-token system:
```
call 0: input=25 write=5409 read=0
call 1: input=25 write=0 read=5409   ← HIT
call 2: input=25 write=0 read=5409   ← HIT
call 3: input=25 write=0 read=5409   ← HIT
call 4: input=25 write=0 read=5409   ← HIT
```

El timestamp y el "X${i}" están en el user message (variable), no en el prefix cacheable. La cache permanece válida.

**Dos niveles de cache — tools + system:**

```typescript
const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 500,
  tools: [
    { name: "search", description: "...", input_schema: {...} },
    {
      name: "fetch",
      description: "...",
      input_schema: {...},
      cache_control: { type: "ephemeral" },  // breakpoint 1: tools
    },
  ],
  system: [
    {
      type: "text",
      text: longSystemText,
      cache_control: { type: "ephemeral" },  // breakpoint 2: system
    },
  ],
  messages: [ ... ],
});
```

Tools estables cachean aparte del system. Cambiar el system no invalida el cache de tools (si el prefix completo hasta bp1 coincide).


## Probalo con tu API key

Tu propia API key queda en el `localStorage` de tu navegador. Los requests los paga tu workspace y podés ajustar el prompt libremente.

<LivePlayground id="m06-playground" />

## Anti-patterns

- ❌ **Timestamp o UUID al inicio del prompt**. Invalida cache siempre. Movelo al user message o normalizá a granularidad estable (fecha día).
- ❌ **IDs de usuario/sesión en el system**. Fragmentá por-usuario. Ponelos en el user message como `[context: ...]`.
- ❌ **Cachear cosas que cambian**. `cache_control` en un bloque que varía = 1.25x cost sin hit. Mirá el `cache_read_input_tokens` — si siempre es 0, no estás aprovechando.
- ❌ **Poner el breakpoint mal ubicado** (ej. en medio del system, dejando 100 tokens post-breakpoint que son estables). El prefix cacheado se corta antes de lo que podrías aprovechar.
- ❌ **Cachear bloques debajo del mínimo**. 500 tokens en haiku = cache ignorado silenciosamente. Medí con `cache_creation_input_tokens` en la primera call — si es 0, estás debajo del mínimo.
- ❌ **Rotar few-shots aleatoriamente entre requests**. "Para diversidad" — noble idea, pero destruye el cache. Si necesitás diversidad, rotá al final del user message, no en el system.

## Recap

- **Prefix estable primero, variable después**. Esa sola regla te cubre el 80%.
- El `cache_control` va en el último block del bloque estable (típicamente al final de `system`).
- Para conversaciones, mantené un segundo breakpoint al final del history hasta el turno anterior.
- Variables sensibles al timestamp (fecha, ids, nombres de usuario) van al **user message**, no al system.
- Medí con `cache_read_input_tokens`. Si siempre es 0 después del primer call, hay un byte variable en el prefix — encontralo.
- El mínimo de tokens para activar cache (1024 Sonnet/Opus, 2048 Haiku) es un piso, no un target — engordá el system con contenido útil, no padding.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
**Ejercicio:** <!-- exercise:ex-06-02-cache-breakpoint -->
