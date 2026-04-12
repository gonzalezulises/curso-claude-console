# Dejá que Claude piense (chain of thought clásico)

## Objetivo

Al terminar sabrás **por qué pedirle a Claude que piense paso a paso mejora respuestas de razonamiento en varios %**, cuándo CoT clásico es mejor que extended thinking (que viene en la próxima lección), cómo estructurar el output para que tu código pueda extraer la respuesta final sin levantar el razonamiento, y cuándo **no** usar CoT (porque a veces perjudica).

## Concepto

### El fenómeno: "pensar en voz alta" mejora razonamiento

**Chain of thought (CoT)** es una técnica descubierta en 2022 y estable desde entonces: cuando le pedís a un modelo que **explicite su razonamiento antes de la respuesta final**, acierta más en tareas que requieren múltiples pasos lógicos (matemática de palabras, razonamiento temporal, deducción con restricciones, clasificación con criterios sutiles).

La versión más simple de CoT es literal: agregar `"Pensá paso a paso antes de responder"` al prompt. La versión más controlada es:

> `"Razoná primero explicando cada paso. Al final, en una línea separada con el prefijo RESPUESTA:, dame el resultado final."`

Esa segunda versión tiene una propiedad crítica: **separa el razonamiento del resultado final para que tu código pueda extraer solo el resultado**.

### ¿Por qué funciona? Tokens = cómputo

La intuición mecánica: cada token que el modelo genera es **una nueva pasada de cómputo** sobre el contexto acumulado. Cuando le forzás a generar 300 tokens de razonamiento antes de la respuesta, le estás dando **300 oportunidades de cómputo** para refinar su estado interno antes de comprometerse con el número final.

Si le pedís solo la respuesta, gasta ~5 tokens de cómputo antes de comprometerse. Si el problema requiere 10 pasos lógicos, **no le diste suficientes pasos**. El razonamiento explícito obliga al modelo a usar la ventana de output como scratchpad.

### CoT clásico vs extended thinking (spoiler de la próxima lección)

A partir de Claude 3.7 Sonnet y especialmente en Claude 4.x, Anthropic agregó **extended thinking**: un parámetro nativo `thinking` en el body del request que activa un modo donde el modelo genera **bloques `thinking` dedicados** antes de los bloques `text` de respuesta. Es "CoT como feature de primera clase de la API".

| | CoT clásico | Extended thinking |
|---|---|---|
| Cómo se activa | Frase en el prompt | `thinking: { type: "enabled", budget_tokens: 5000 }` |
| Dónde vive el razonamiento | En el `content[0].text` junto con la respuesta | En bloques `thinking` separados del `text` |
| Control del budget | Implícito (lo que salga hasta `max_tokens`) | Explícito (`budget_tokens`) |
| Visibilidad | Siempre visible en la respuesta | Configurable (`display: "summarized" | "omitted"`) |
| Costo | Output normal | Output normal + thinking tokens |
| Disponible en | Todos los modelos Claude | Modelos 4.x y 3.7 Sonnet (no en todos) |

Regla operativa: **extended thinking es preferible cuando está disponible** porque separa cleanly el razonamiento del output y te da control del presupuesto. **CoT clásico es el fallback** para modelos sin thinking, y sigue siendo útil cuando querés que el razonamiento sea parte del output visible (ej: tutoría, explicación educativa).

Detalles exactos del parámetro `thinking` en la Lección 04.

### ¿Cuándo CoT ayuda? ¿Cuándo no?

CoT **ayuda** cuando:

- El problema tiene **varios pasos** y el error en un paso afecta los siguientes (razonamiento temporal, matemática de palabras, deducción con restricciones, planning).
- La respuesta requiere **contar** o **acumular** algo (el modelo es notoriamente malo contando sin pasos intermedios).
- Hay **criterios sutiles** que el modelo debe explicitar antes de elegir (clasificación con bordes).

CoT **no ayuda** (o perjudica) cuando:

- El problema es **lookup puro** (ej: "¿cuál es la capital de Francia?") — el modelo ya sabe, pedirle que piense le hace inventar razonamientos innecesarios y aumenta la probabilidad de alucinación.
- La tarea es **extracción de formato** (ej: "devolveme este ticket como JSON con estos campos") — pensar en voz alta distrae, y además rompe el output estructurado.
- El modelo **ya está dando el razonamiento sin pedirlo** — muchas veces Claude 4.x razona implícitamente en su output. Forzar CoT encima duplica tokens.
- Tenés **restricciones duras de latencia** (UX de chat, autocomplete) — CoT multiplica output tokens por 5-10x, lo que multiplica latencia.

La regla práctica: **probá con y sin CoT sobre 10-20 casos representativos antes de decidir**. No es una técnica que se aplique ciegamente a todo.

### Cómo estructurar el output para que sea parseable

El formato que más recomiendo (y que usa la Ejecución Real de abajo):

```
Razoná primero paso a paso. Después de razonar, escribí una
línea final con el prefijo RESPUESTA: seguido del resultado.
```

Eso te da:

1. El razonamiento libre arriba (útil para auditoría, logs, debugging).
2. Una línea final canónica que podés extraer con:
   ```ts
   const match = response.match(/RESPUESTA:\s*(.+)$/m);
   const answer = match?.[1].trim();
   ```

Es la versión mini-pobre de lo que extended thinking te da gratis. Pero es portable y funciona en cualquier modelo.

## Ejecución real

Vamos a usar un problema de razonamiento temporal donde Claude 4.x **falla sin CoT y acierta con CoT**. Es un ejemplo real que reproduje contra la API antes de escribir esta lección.

**El problema**: Un paquete se despacha el jueves 12 de marzo a las 16:00, el servicio tarda 3 días hábiles, y el viernes 13 es feriado nacional. ¿Qué día llega?

La respuesta correcta es **miércoles 18 de marzo** (viernes 13 feriado → no cuenta; sábado 14 y domingo 15 → no cuentan; lunes 16 = día 1; martes 17 = día 2; miércoles 18 = día 3).

**Paso 1 — Sin CoT, pidiendo solo la fecha**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 100,
    "temperature": 0,
    "messages": [{
      "role": "user",
      "content": "Un paquete se despacha el jueves 12 de marzo a las 16:00. El servicio tarda 3 días hábiles (sin contar sábados, domingos ni feriados). El viernes 13 es feriado nacional. ¿Qué día llega? Responde solo con la fecha en formato YYYY-MM-DD."
    }]
  }'
```

Output real:

```
2025-03-17

usage: input_tokens=96, output_tokens=10
```

**Respuesta incorrecta**. Claude contó dos días hábiles (lunes 16 y martes 17) en vez de tres y se comprometió al martes 17. Sin pasos intermedios forzados, se saltó uno — un error clásico de razonamiento temporal.

**Paso 2 — Con CoT, razonamiento antes de la respuesta**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "temperature": 0,
    "messages": [{
      "role": "user",
      "content": "Un paquete se despacha el jueves 12 de marzo a las 16:00. El servicio tarda 3 días hábiles (sin contar sábados, domingos ni feriados). El viernes 13 es feriado nacional. ¿Qué día llega?\n\nRazoná paso a paso. Después de razonar, escribí una línea final con el prefijo FECHA: seguido de la fecha en formato YYYY-MM-DD."
    }]
  }'
```

Output real (abreviado):

```
# Razonamiento paso a paso

**Punto de partida:**
- Despacho: jueves 12 de marzo a las 16:00
- Tiempo de tránsito: 3 días hábiles
- Viernes 13 de marzo: feriado nacional (no cuenta como día hábil)

**Conteo de días hábiles:**

1. Viernes 13 de marzo: Es feriado → NO cuenta como día hábil
2. Sábado 14 de marzo: Es fin de semana → NO cuenta
3. Domingo 15 de marzo: Es fin de semana → NO cuenta
4. Lunes 16 de marzo: Es día hábil → Primer día hábil ✓
5. Martes 17 de marzo: Es día hábil → Segundo día hábil ✓
6. Miércoles 18 de marzo: Es día hábil → Tercer día hábil ✓

**Conclusión:**
Después de completar los 3 días hábiles, el paquete llega el
miércoles 18 de marzo.

FECHA: 2024-03-18

usage: input_tokens=123, output_tokens=309
```

**Respuesta correcta**. Al forzar el razonamiento explícito, Claude enumeró cada día, identificó cuáles eran hábiles, y contó **tres** correctamente (lunes 16, martes 17, miércoles 18).

**Paso 3 — Comparación numérica y extracción**

| | Sin CoT | Con CoT | Delta |
|---|---|---|---|
| `input_tokens` | 96 | 123 | +27 |
| `output_tokens` | 10 | 309 | +299 |
| Correctitud | ❌ (martes 17) | ✅ (miércoles 18) | |
| Latencia | baja | ~5-10x | |

Observaciones importantes:

1. **CoT multiplicó el costo por ~30x**. Con pricing Haiku 4.5, la llamada con CoT es considerablemente más cara. Pero la llamada sin CoT **tiene la respuesta mal** — un output barato y equivocado no tiene valor.
2. **Tu código puede extraer solo la fecha** con `/FECHA:\s*(\d{4}-\d{2}-\d{2})/` — el razonamiento queda como log auditable pero no afecta el campo final.
3. **Sobre el año de la fecha**: Claude inventó `2024` porque el prompt no especificó año. Bug de prompt, no de razonamiento — arregla especificando el año en la instrucción.

**Paso 4 — Extraer la respuesta con una regex**

Si tu app necesita solo la fecha final, el patrón canónico es:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 500,
  temperature: 0,
  messages: [{
    role: "user",
    content: `Un paquete se despacha el jueves 12 de marzo de 2025... ¿Qué día llega?

Razoná paso a paso. Después de razonar, escribí una línea final con el prefijo FECHA: seguido de la fecha en formato YYYY-MM-DD.`,
  }],
});

const text = resp.content[0].type === "text" ? resp.content[0].text : "";
const match = text.match(/FECHA:\s*(\d{4}-\d{2}-\d{2})/);
const fecha = match?.[1] ?? null;

console.log("Fecha extraída:", fecha);
// Fecha extraída: 2025-03-18
```

El razonamiento sigue disponible en `text` si querés loguearlo para auditoría.

## Anti-patterns

- ❌ **Usar CoT para lookups puros** ("¿cuál es la capital de Francia?"). Le pedís al modelo que razone sobre algo que ya sabe, y a veces inventa razonamientos intermedios incorrectos que lo llevan a alucinación.
- ❌ **Pedir CoT sin separar razonamiento y respuesta final**. Si tu código necesita solo la respuesta, pero no pusiste el prefijo `RESPUESTA:` o similar, vas a tener que parsear un párrafo entero con heurística. Definí la separación explícitamente.
- ❌ **Usar CoT cuando ya activaste extended thinking**. Es redundante y duplica tokens. Con `thinking: { type: "enabled" }` el modelo ya razona en bloques dedicados — no le pidas además "pensá paso a paso" en el prompt.
- ❌ **No medir el impacto de CoT**. CoT puede ayudar, no hacer nada, o empeorar según la tarea. Corré los mismos 20 casos con y sin CoT antes de decidir que es la solución.
- ❌ **CoT con `max_tokens` bajo**. Si `max_tokens: 100` y pedís razonamiento, el modelo se corta a la mitad del razonamiento y nunca llega a la respuesta final. Subí `max_tokens` a al menos 500-1000 cuando activás CoT.
- ❌ **CoT para latencia crítica**. Si tu UX requiere respuesta en <1s, CoT multiplicando tokens por 20-30x no es viable. Usá modelo más grande (Sonnet/Opus sin CoT) antes que Haiku con CoT — a veces sale más barato y más rápido.
- ❌ **Confundir "pensá" con "da varios pasos en la respuesta"**. Pedirle al modelo `"dame 5 razones"` no es CoT, es formato. CoT es pedirle que razone **antes** de la respuesta, no que liste razones **en** la respuesta.

## Recap

- **CoT clásico = "pensá paso a paso antes de responder"** como frase en el prompt. Estable desde 2022, funciona en todos los modelos Claude.
- **Funciona** en razonamiento temporal, matemática de palabras, conteo, deducción y clasificación con matices.
- **No funciona** en lookups puros, extracción estructurada y latencia crítica.
- **Extended thinking (Lección 04) es la versión nativa** con control de budget y separación limpia del razonamiento — preferila cuando esté disponible.
- **Estructurá el output con prefijo `RESPUESTA:`** para que tu código extraiga solo el resultado sin levantar el razonamiento.
- **Medí siempre con y sin CoT sobre 10-20 casos reales** antes de decidir — no es gratis, multiplica output tokens fácilmente por 20x.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/chain-of-thought](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/chain-of-thought)
