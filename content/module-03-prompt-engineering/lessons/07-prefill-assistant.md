# Prefill del assistant

## Objetivo

Al terminar sabrás **qué es el prefill (pre-llenar el turno `assistant`)**, cómo se usa en la Messages API, por qué es la técnica más confiable para **forzar formato de output** (más que pedir "devolvé JSON" en el prompt), cuáles son los 3 casos de uso clásicos (JSON forzado, idioma forzado, formato forzado), y cuándo **no** usarlo.

## Concepto

### ¿Qué es el prefill?

**Prefill** es mandar en el array `messages` un turno `assistant` como **último mensaje**, con contenido parcial. Claude lo interpreta como "mi respuesta ya empezó con esto, continuá desde acá". El API **no repite el prefill** en la respuesta — devuelve solo **la continuación**.

```json
{
  "messages": [
    { "role": "user", "content": "Extraé nombre y empresa como JSON." },
    { "role": "assistant", "content": "{" }
  ]
}
```

Claude ve que el turno `assistant` ya empieza con `{` y **continúa** generando JSON válido desde el `{` en adelante. La respuesta que recibís no incluye el `{` — solo lo que generó después. Para reconstruir el JSON completo, concatenás:

```ts
const fullJson = "{" + resp.content[0].text;
JSON.parse(fullJson); // funciona
```

### Regla clave: el último message debe ser `assistant`

En la API de Anthropic, normalmente el último message es `user` y el modelo genera un `assistant` completo. Con prefill, invertís eso: el último message es un `assistant` parcial, y Claude lo continúa. **Esto es una feature documentada**, no un hack.

### ¿Por qué prefill supera a "devolvé JSON" en el system prompt?

Ya viste este fenómeno en el Módulo 1 (Lección 04): si el system dice `"responde solo con JSON, sin markdown, sin backticks"`, Claude a menudo **devuelve JSON envuelto en un bloque ` ```json ... ``` `** igual. El system prompt es hint, no garantía.

El prefill soluciona esto mecánicamente: si ya empezaste con `{`, el modelo **tiene que continuar un JSON** que empiece con `{`. No tiene opción de agregar preámbulo, backticks, o "¡Claro!". Está forzado por la posición.

Es la técnica más barata y confiable para forzar formato hasta que llegues a structured outputs (que son la garantía absoluta del lado server, pero requieren JSON schema y no todos los payloads lo justifican).

### Los 3 casos de uso clásicos

<terminology>
**1. Forzar JSON válido**: prefill con `{` o `[`. Claude continúa con JSON válido. Concatená el prefill con la respuesta para tener el JSON completo.

**2. Forzar idioma**: prefill con el inicio de una frase en el idioma deseado. Ej: `"Acá está la respuesta:"` fuerza español, `"Here is the answer:"` fuerza inglés. El modelo continúa en el mismo idioma.

**3. Forzar estructura de output**: prefill con el inicio del formato. Ej: `"| Nombre | Empresa | Monto |\n|"` fuerza tabla markdown. `"1."` fuerza lista numerada. `"<result>"` fuerza que el output empiece con un tag XML.
</terminology>

### ¿Qué pasa con el prefill en la respuesta?

La API **no incluye el prefill** en `content[0].text`. Solo devuelve lo que el modelo generó. Si prefillás con `{` y el modelo genera:

```
\n  "nombre": "Ana García",\n  "empresa": "TechCorp"\n}
```

...tu JSON completo es `{` + eso. **Siempre concatená el prefill con la respuesta** para tener el output final. Es un paso extra trivial pero olvidarlo es un bug común.

### Prefill y streaming

Prefill funciona normalmente con streaming. Los SSE events empiezan después del prefill — el primer chunk es la continuación, no el prefill. La misma regla aplica: concatená el prefill antes.

### Prefill y extended thinking

**Prefill no es compatible con extended thinking activado**. Si mandás `thinking: { type: "enabled" }` junto con un turno `assistant` como último message, la API puede rechazar el request o ignorar el prefill. Esto es porque el modelo necesita generar bloques `thinking` **antes** del output, y el prefill fuerza que el output empiece inmediatamente.

Si necesitás ambos (razonamiento + formato forzado), usá extended thinking sin prefill y validá el formato post-generación, o usá structured outputs.

## Ejecución real

**Paso 1 — Sin prefill: JSON envuelto en markdown**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "messages": [{
      "role": "user",
      "content": "Extraé el nombre, empresa y monto de este texto y devolvé JSON.\n\nHola, soy Ana García de TechCorp. La factura es por USD 4850."
    }]
  }'
```

Output real:

```
```json
{
  "nombre": "Ana García",
  "empresa": "TechCorp",
  "monto": "USD 4850"
}
```

usage: input_tokens=51, output_tokens=43
```

El JSON está **correcto** pero envuelto en ` ```json ... ``` `. Si hacés `JSON.parse(response)`, **falla** por los backticks. Tendrías que stripear con regex — frágil.

**Paso 2 — Con prefill `{`: JSON limpio**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "messages": [
      {
        "role": "user",
        "content": "Extraé el nombre, empresa y monto de este texto y devolvé JSON.\n\nHola, soy Ana García de TechCorp. La factura es por USD 4850."
      },
      {
        "role": "assistant",
        "content": "{"
      }
    ]
  }'
```

Output real:

```

  "nombre": "Ana García",
  "empresa": "TechCorp",
  "monto": "USD 4850"
}

usage: input_tokens=52, output_tokens=37
```

Sin backticks, sin preámbulo. Concatenás `{` + respuesta → JSON parseable:

```ts
const prefill = "{";
const continuation = resp.content[0].text;
const data = JSON.parse(prefill + continuation);
// { nombre: "Ana García", empresa: "TechCorp", monto: "USD 4850" }
```

**Paso 3 — Comparación numérica**

| | Sin prefill | Con prefill | Delta |
|---|---|---|---|
| `input_tokens` | 51 | 52 | +1 (el `{`) |
| `output_tokens` | 43 | 37 | −6 (sin backticks) |
| `JSON.parse()` directo | ❌ (backticks) | ✅ | |
| Costo extra del prefill | — | ~0 | |

El prefill cuesta **1 input token extra** y ahorra 6 output tokens + la necesidad de strip con regex. Es la técnica con mejor ratio costo/beneficio de todo el módulo.

**Paso 4 — Prefill en TypeScript con el SDK**

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const prefill = "{";

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 200,
  messages: [
    {
      role: "user",
      content: "Extraé nombre, empresa y monto como JSON.\n\nHola, soy Ana García de TechCorp. La factura es por USD 4850.",
    },
    {
      role: "assistant",
      content: prefill,
    },
  ],
});

const text = resp.content[0].type === "text" ? resp.content[0].text : "";
const data = JSON.parse(prefill + text);

console.log(data);
// { nombre: "Ana García", empresa: "TechCorp", monto: "USD 4850" }
```

Patrón reusable: `const prefill` como constante, concatenar en el parse. Si el modelo genera JSON inválido por otro motivo (campo cortado por `max_tokens`, alucinación), el `JSON.parse()` falla y lo atrapás con try/catch como corresponde.

## Anti-patterns

- ❌ **Olvidarte de concatenar el prefill con la respuesta**. El error más común: el JSON empieza con `\n  "nombre":` y `JSON.parse()` falla porque falta el `{` inicial. Siempre: `prefill + resp.content[0].text`.
- ❌ **Prefill demasiado largo**. Mandar 500 tokens de prefill es un smell — estás escribiendo la respuesta vos mismo en vez de dejar que el modelo la genere. El prefill ideal es 1-10 tokens: `{`, `[`, `<result>`, `"Acá va:"`, etc.
- ❌ **Combinar prefill con extended thinking**. No son compatibles — el modelo necesita generar bloques thinking antes del output. Usá uno u otro, no ambos.
- ❌ **Asumir que prefill garantiza JSON válido**. Prefill garantiza que la respuesta **empieza** como JSON. Pero si el modelo genera un campo y se corta por `max_tokens`, el JSON resultante es inválido. Siempre `try/catch` al parsear.
- ❌ **Prefill con caracteres que el modelo no puede continuar coherentemente**. Si prefillás con `"RESPUESTA FINAL:"` pero la instrucción pide JSON, creás una contradicción. El prefill debe ser coherente con la instrucción.
- ❌ **Usar prefill cuando structured outputs está disponible**. Si tu caso de uso es "garantizar que el output cumple un JSON schema exacto", `output_config.format: { type: "json_schema", json_schema: ... }` es la solución robusta. Prefill es el atajo liviano para cuando no querés definir un schema completo.
- ❌ **No usar prefill en producción para extracción de datos**. Si tu pipeline hace extracción y parsea JSON del output, **siempre** usá prefill o structured outputs. Confiar en que el modelo "no va a agregar backticks" es apostar contra la probabilidad.

## Recap

- **Prefill** = mandar un turno `assistant` parcial como último message. Claude lo continúa en vez de empezar de cero.
- **La API no incluye el prefill en la respuesta** — siempre concatená `prefill + response` para el output completo.
- **Prefill `{`** es el patrón canónico para forzar JSON sin backticks — cuesta 1 input token extra, ahorra regex y dolor.
- **Otros prefills útiles**: `[` para arrays, `<result>` para XML, inicio de frase para forzar idioma.
- **No combinar con extended thinking** — son incompatibles.
- **Structured outputs** es la alternativa robusta cuando necesitás garantía de schema; prefill es el atajo liviano cuando solo querés controlar el inicio del formato.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/prefill-claudes-response](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prefill-claudes-response)
**Ejercicio:** <!-- exercise:ex-03-04-prefill-json -->
