# Ejemplos (few-shot) que realmente enseñan

## Objetivo

Al terminar sabrás **por qué un prompt con 3 ejemplos bien elegidos vale más que uno con 10 mal elegidos**, cuándo few-shot te ahorra output tokens (y no solo calidad), cómo cubrir edge cases sin sesgar al modelo, y cuál es el formato canónico para few-shot en la Messages API de Anthropic (spoiler: no es `role: "example"` como en otros stacks).

## Concepto

### ¿Qué es few-shot exactamente?

**Few-shot prompting** es pasarle al modelo unos pocos ejemplos `(input, output)` antes del caso real que te importa, para que infiera el shape y las reglas del output sin que tengas que explicarlas. El nombre viene del contraste con:

- **Zero-shot**: cero ejemplos. Solo la instrucción. "Clasificá este ticket en: billing, technical, account, other."
- **One-shot**: un ejemplo antes del caso real.
- **Few-shot**: 2-10 ejemplos (típicamente 3-5).
- **Fine-tuning**: cientos o miles de ejemplos cargados en los pesos del modelo. Fuera del scope de prompt engineering.

Anthropic documenta few-shot como **la segunda técnica más efectiva** después de "ser directo", y por una razón específica: el modelo **ancla el formato de salida observando los outputs de los ejemplos**. No hace falta describir el shape; lo copia.

### Por qué funciona: imitar es más preciso que describir

Imaginate que querés que Claude clasifique tickets en 4 categorías **y responda solo con la palabra de la categoría** (para que tu parser haga `if (response === "billing")`). Podés describirlo:

> "Responde únicamente con la palabra de la categoría, en minúscula, sin explicación, sin puntos, sin prefijo."

Funciona, pero el modelo a veces agrega "." al final, a veces escribe `Billing` en Capitalizado, a veces prefija `Categoría: billing`. La descripción deja márgenes de interpretación.

Ahora imitá:

```
Ticket: Mi contraseña no me deja entrar desde ayer.
Categoría: account

Ticket: La app se cierra sola cuando abro el dashboard.
Categoría: technical
```

El modelo ve **el shape literal**: minúscula, sin punto, sin prefijo. Cuando llega al ticket real, copia ese mismo shape — no por una regla lingüística que entendió, sino por **pattern matching sobre los ejemplos**. Es mucho más estable.

### Cómo se estructura few-shot en la Messages API

No hay un `role: "example"` en Anthropic. Los ejemplos viven como **texto dentro del mismo `user` message**, con un separador visual claro. El patrón canónico:

```
<instrucción general>

Ejemplo 1:
<input>
<output>

Ejemplo 2:
<input>
<output>

<input real>
<prompt para que complete el output>
```

Alternativa más formal, con XML tags (vas a verlo en profundidad en la Lección 05):

```xml
<instrucciones>Clasificá en billing/technical/account/other.</instrucciones>

<examples>
  <example>
    <ticket>Mi contraseña no me deja entrar.</ticket>
    <category>account</category>
  </example>
  <example>
    <ticket>La app se cierra sola.</ticket>
    <category>technical</category>
  </example>
</examples>

<ticket>No me llegó la factura de marzo.</ticket>
<category>
```

Las dos funcionan. La segunda escala mejor cuando tenés más de 5 ejemplos o inputs complejos. En esta lección usamos la primera.

### ¿Cuántos ejemplos hace falta?

La respuesta honesta de Anthropic: **depende de cuántas categorías o patrones distintos necesitás cubrir**. Reglas operativas:

<terminology>
**Regla del "un ejemplo por caso distintivo"**: si tu tarea tiene 4 categorías, mínimo 1 ejemplo por categoría = 4 ejemplos. Menos y el modelo podría no considerar las categorías que nunca vio usadas.

**Regla del techo en 5-8**: pasar de 8 ejemplos raramente mejora el output y sí infla tokens. Si 8 no alcanzan, el problema no es few-shot — necesitás mejor definición de la tarea, o fine-tuning.

**Regla del "edge case obvio"**: si tenés una categoría especial tipo `other` / `unknown` / `ambiguous`, **siempre** incluila con un ejemplo. Sin ejemplo de `other`, el modelo prefiere forzar el input en una de las otras categorías antes que usar la que nunca vio.

**Regla del orden importa poquito pero importa**: poné los ejemplos más representativos primero. El modelo pondera ligeramente más los primeros ejemplos.

**Regla del no-sesgo**: si tus 4 ejemplos son todos de la categoría `billing`, el modelo asume que "billing" es la respuesta por defecto. Balanceá: cubrí cada categoría al menos una vez antes de repetir ninguna.
</terminology>

### El costo real de few-shot: más input, menos output

Few-shot tiene un trade-off de tokens invertido respecto a zero-shot:

- **Zero-shot**: pocos input tokens, pero el modelo elige su propio formato → output largo y con varianza.
- **Few-shot**: muchos más input tokens, pero el output queda **forzado** al shape de los ejemplos → output cortísimo y estable.

Vas a ver en la Ejecución Real que, para clasificación, few-shot **sale más barato neto** aunque el prompt sea 4x más largo, porque output tokens pesan ~5x lo que input tokens (ver pricing de Haiku 4.5 / Sonnet 4.6).

### Few-shot y prompt caching: hermanos de sangre

Preview del Módulo 6: los ejemplos de few-shot son el candidato **perfecto** para prompt caching. Son grandes, inmutables, y se repiten en miles de llamadas. Poner tus ejemplos detrás de un `cache_control: { type: "ephemeral" }` significa que **pagás una vez** por esos 200-500 input tokens extra y después los reusás al 10% del precio. Con eso, la comparación zero-shot vs few-shot se vuelve un no-contest — few-shot cacheado siempre gana.

No lo uses todavía. Solo tenelo como vista previa: **los patrones que aprendés ahora se vuelven todavía mejores cuando agregamos caching**.

## Ejecución real

Vamos a clasificar el mismo ticket con zero-shot y con few-shot, y comparar qué cambia.

**Paso 1 — Zero-shot**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 300,
    "messages": [{
      "role": "user",
      "content": "Clasificá este ticket de soporte en: billing, technical, account, other.\n\nTicket: No me llegó la factura de marzo aunque sí se debitó el pago."
    }]
  }'
```

Output real:

```
**Clasificación: billing**

Este ticket corresponde a la categoría "billing" porque el usuario reporta
un problema relacionado con facturación: no recibió la factura de marzo
a pesar de que se realizó el débito del pago.

usage: input_tokens=49, output_tokens=60
```

El modelo clasificó correctamente. Pero observá **qué devolvió**:

- Prefijo `**Clasificación:**` en negrita
- La palabra con mayúscula (`billing` minúscula pero precedida por un título Capitalizado)
- Un párrafo de explicación que vos no pediste

Si tu código hace `if (response === "billing")`, este output **no matchea**. Tenés que parsear con regex, y en cada llamada el prefijo puede cambiar (a veces `Categoría:`, a veces `La respuesta es:`, a veces nada).

**Paso 2 — Few-shot con 4 ejemplos (uno por categoría)**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 300,
    "messages": [{
      "role": "user",
      "content": "Clasificá tickets de soporte en una de estas categorías: billing, technical, account, other. Responde únicamente con la palabra de la categoría, en minúscula, sin explicación.\n\nEjemplo 1:\nTicket: Mi contraseña no me deja entrar desde ayer.\nCategoría: account\n\nEjemplo 2:\nTicket: La app se cierra sola cuando abro el dashboard.\nCategoría: technical\n\nEjemplo 3:\nTicket: Me cobraron dos veces el plan de junio.\nCategoría: billing\n\nEjemplo 4:\nTicket: ¿Tienen partnerships para universidades?\nCategoría: other\n\nTicket: No me llegó la factura de marzo aunque sí se debitó el pago.\nCategoría:"
    }]
  }'
```

Output real:

```
billing

usage: input_tokens=195, output_tokens=4
```

**Exactamente una palabra**. En minúscula. Sin prefijo. Sin explicación. `response.trim() === "billing"` matchea directo.

**Paso 3 — La comparación numérica**

| | Zero-shot | Few-shot | Delta |
|---|---|---|---|
| `input_tokens` | 49 | 195 | **+146** |
| `output_tokens` | 60 | 4 | **−56** |
| Formato | `**Clasificación:** billing\n\nExplicación...` | `billing` | |
| Parseable con `===` | ❌ | ✅ | |
| Varianza | alta | casi cero | |

Un ejercicio de costo: asumí que 1 output token cuesta 5 unidades y 1 input token cuesta 1 unidad (ratio cercano a Haiku 4.5 / Sonnet 4.6).

- **Zero-shot**: `49 × 1 + 60 × 5 = 49 + 300 = 349` unidades
- **Few-shot**: `195 × 1 + 4 × 5 = 195 + 20 = 215` unidades

**Few-shot sale ~38% más barato** aunque el prompt sea 4x más largo. La razón es que few-shot fuerza al output a ser corto. Es la razón por la que clasificación en producción **siempre** se hace con few-shot — no por calidad, por costo.

Y eso es sin prompt caching. Con caching, los 150 input tokens extra del few-shot se reusan al 10% del precio — el delta se vuelve casi gratis.

## Anti-patterns

- ❌ **Ejemplos mal balanceados**: 4 ejemplos, 3 de `billing`, 1 de `technical`, 0 de `account`, 0 de `other`. El modelo aprende "billing es la respuesta más probable" y sesga. **Cubrí cada categoría al menos una vez antes de repetir.**
- ❌ **Omitir el ejemplo de la categoría "catch-all"** (`other`, `unknown`, `ambiguous`). Sin ese ejemplo, el modelo evita usar esa categoría aunque la instrucción la liste. Resultado: inputs ambiguos se fuerzan en categorías incorrectas.
- ❌ **Ejemplos demasiado parecidos entre sí**. Si tus 5 ejemplos son todos tickets sobre contraseñas, el modelo aprende "esta tarea es sobre contraseñas" y falla en tickets sobre facturación. **Los ejemplos deben ser diversos**, no bonitos.
- ❌ **Poner el `response:` o `answer:` dentro del input en vez de afuera**. Patrón incorrecto: `Ticket: foo → bar. Ticket: baz → ?`. Patrón correcto: separá claramente input y output, usando newlines o XML tags.
- ❌ **Few-shot con instrucciones contradictorias a los ejemplos**. Si escribís "responde en JSON" pero tus ejemplos muestran texto plano, **el modelo imita los ejemplos**, no la instrucción. La instrucción pierde. Revisá que la instrucción y los ejemplos digan lo mismo.
- ❌ **Usar few-shot para tareas que no son paramétricas**. Si cada caso que te importa es único (preguntas abiertas, resúmenes de documentos distintos), few-shot ayuda menos. Reservalo para tareas donde el **shape** es repetitivo: clasificación, extracción, formato fijo, transformaciones estructuradas.
- ❌ **Nunca probar el mismo ejemplo con y sin few-shot**. Es el experimento más barato que podés correr (2 curls) y te muestra directamente cuánto vale en tu caso. Hacelo antes de optimizar a ciegas.

## Recap

- **Few-shot es "enseñar por imitación"**: el modelo copia el shape de los outputs de los ejemplos, más preciso que cualquier descripción verbal del formato.
- **Cubrí cada categoría al menos una vez**, especialmente la catch-all (`other`). Balance > cantidad.
- **3-5 ejemplos suele ser el sweet spot**. Pasar de 8 raramente mejora y sí infla tokens.
- **Few-shot suele salir más barato neto** aunque el prompt sea 3-4x más largo, porque forzás outputs cortos y estables.
- **En la Messages API los ejemplos van como texto dentro del `user` message** — no hay `role: "example"`. Podés usar plain text con separadores o XML tags (Lección 05).
- **Preview Módulo 6**: prompt caching + few-shot es la combinación canónica para clasificación en producción.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting)
