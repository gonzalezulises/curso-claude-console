# Parámetros en vivo: temperature, max_tokens, thinking

## Objetivo

Al terminar sabrás **qué hace cada parámetro expuesto en el panel Model del Workbench**, entenderás por qué el Workbench solo muestra 3 parámetros (y dónde están los demás), y tendrás intuiciones concretas sobre cuándo subir/bajar temperature y cuándo activar thinking.

## Concepto

### El panel Model: 3 parámetros + 1 link

Cuando hacés click en el icono ⚙ del panel derecho del Workbench, se abre el panel **Model** con:

1. **Model** (dropdown): selector del modelo. Muestra el nombre con snapshot (ej: `claude-sonnet-4-5-20250929`).
2. **Temperature** (slider): valor de 0 a 1, default 1.
3. **Max tokens** (input de texto): número máximo de tokens de output, default 20000.
4. **Thinking** (toggle): `Disabled` / `Enabled`.
5. **"View all API options"** (link): lleva a la documentación de la API con todos los parámetros.

### ¿Dónde están top_p, top_k y stop_sequences?

Si venís de otros modelos o de la documentación de la API, te preguntarás: ¿dónde están `top_p`, `top_k`, `stop_sequences`, `metadata`?

**No están en el Workbench.** El Workbench expone solo los 3 parámetros más usados. Los demás solo están disponibles via API directa (curl, SDK). Esto es un diseño intencional de Anthropic: el Workbench es para iterar prompts rápido, no para configuración exhaustiva.

Para experimentar con `top_p`, `top_k`, `stop_sequences` u otros parámetros, usá la API directa con curl o el SDK — que ya sabés hacer desde el Módulo 1.

### Temperature: el control de aleatoriedad

**Qué hace**: controla cuánta aleatoriedad hay en la selección de tokens. Es el parámetro que más cambia el "comportamiento percibido" del modelo.

| Temperature | Efecto | Cuándo usarlo |
|---|---|---|
| **0** | Casi determinístico. Misma respuesta en múltiples corridas. | Clasificación, extracción, código, tests de estabilidad |
| **0.3** | Muy poca variación. Preferencia por los tokens más probables. | Producción general donde querés consistencia |
| **0.7** | Variación moderada. Respuestas diversas pero coherentes. | Redacción, resúmenes, exploración inicial |
| **1.0** (default) | Máxima variación dentro de la distribución. | Brainstorming, creatividad, exploración de opciones |

**Intuición clave**: temperature NO afecta la "inteligencia" del modelo. Un modelo con temperature 0 no es más inteligente que con temperature 1 — es más **predecible**. El conocimiento es el mismo; lo que cambia es la estrategia de sampling.

**En el Workbench**: empezá con temperature 1 cuando estás explorando (querés ver el rango de outputs posibles). Cuando encontraste el approach correcto, bajá a 0-0.3 y validá que el output es estable corriendo 3-5 veces.

### Max tokens: cuánto output permitís

**Qué hace**: limita la cantidad de tokens que el modelo puede generar. Si la respuesta natural del modelo es más larga que `max_tokens`, se corta (`stop_reason: "max_tokens"` — bug del Módulo 1).

**En el Workbench**: el default es 20000, que es generoso para prototipado. Para producción, bajalo a lo que realmente necesitás:

- Clasificación: 10-50 tokens.
- Resumen corto: 200-500 tokens.
- Explicación larga: 1000-2000 tokens.
- Generación de código: 2000-8000 tokens.

¿Por qué importa? Cada token de output cuesta ~5x lo que un token de input. Poner `max_tokens: 20000` cuando tu output esperado es 50 tokens no te cobra 20000 — solo te cobra los tokens que el modelo genera efectivamente. Pero si el modelo alucina y genera una novela, **max_tokens es tu freno de mano**.

### Thinking: extended thinking desde la UI

**Qué hace**: el toggle `Disabled` / `Enabled` activa extended thinking, la misma feature del Módulo 3, Lección 04 (`thinking: { type: "enabled" }`).

Cuando lo activás:

- El modelo genera **bloques `thinking` internos** antes de responder.
- En el Workbench, podés ver el razonamiento en la respuesta.
- Consume tokens de output extra (los bloques thinking se cobran).
- Mejora calidad en problemas de razonamiento multi-paso.

**Cuándo activarlo en el Workbench**:

- Cuando iterás un prompt que requiere razonamiento complejo y querés ver **cómo** el modelo llega a la respuesta.
- Para debugging: si el modelo da una respuesta incorrecta, activá thinking y leé su razonamiento interno para entender dónde se equivoca.
- Para calibrar: ¿el modelo necesita thinking para tu tarea, o funciona bien sin él? Probá ambos en el Workbench antes de decidir.

**Cuándo NO activarlo**:

- Clasificación simple, extracción, formato — thinking agrega costo sin beneficio.
- Cuando usás prefill (Pre-fill response) — no son compatibles.

### ¿Qué modelo elegir en el dropdown?

El Workbench muestra modelos con **snapshot** (ej: `claude-sonnet-4-5-20250929`) en vez de aliases estables (ej: `claude-sonnet-4-6`). Esto es porque el Workbench quiere reproducibilidad exacta: el mismo snapshot da el mismo comportamiento en el tiempo.

Para **iterar prompts** (que es lo que hacés en el Workbench), usá cualquier modelo disponible. La regla del curso sigue: **Haiku 4.5 para desarrollo rápido y barato, Sonnet 4.6 para calidad**, Opus 4.6 para razonamiento profundo.

Cuando exportes con Get Code (Lección 06), cambiá el snapshot por el **alias estable** en tu código de producción.

### Temperature y thinking: la interacción que sorprende

No son parámetros ortogonales. Algunas combinaciones tienen más sentido que otras:

| `temperature` | `thinking` | Caso típico |
|---------------|------------|-------------|
| 0 | Disabled | Extracción, clasificación, parseo — determinismo estricto |
| 0 | Enabled | Razonamiento multi-paso que debe ser reproducible (evals, tests de regresión) |
| 0.7 | Disabled | Redacción general, resúmenes, explicaciones |
| 0.7 | Enabled | Análisis cualitativo donde querés ver el razonamiento sin forzar determinismo |
| 1.0 | Disabled | Brainstorming, generación creativa, ideación de nombres |
| 1.0 | Enabled | Raro — la varianza alta diluye el beneficio del razonamiento paso a paso |

La intuición: thinking funciona mejor con temperaturas bajas porque el razonamiento se apoya en cadenas consistentes. Con temperature 1 y thinking activo, el modelo explora ramas que luego descarta — gastás tokens de thinking sin mucha ganancia.

### Conceptos de arquitecto

- **Los 3 parámetros del Workbench son los únicos que mueven la aguja en el 99% de los casos**. Si estás tentado de tocar `top_p` o `top_k`, pará: probablemente el problema real es el prompt, no el sampling. Anthropic intencionalmente no los expone en el Workbench para evitar que devs gasten horas debuggeando el parámetro equivocado.
- **Max tokens como contrato económico**: es la única variable que te protege de un bill inesperado si el modelo alucina o entra en un loop. Ponela siempre ajustada al rango esperado, no al máximo del modelo.
- **Thinking no es un "mejorador" universal**: para tareas atómicas (extraer un campo, clasificar en 4 clases) thinking suele empeorar el output — el modelo razona cuando no hace falta y puede introducir segundas adivinadas. Activalo solo cuando haya varios pasos encadenados.
- **Reproducibilidad real**: temperature 0 no garantiza determinismo absoluto entre corridas (hay factores de infra). Si necesitás reproducibilidad forense (ej: una respuesta auditable), guardá el request Y la response — temperature 0 es necesaria pero no suficiente.

## Ejecución real

**Paso 1 — Experimentar con temperature**

En el Workbench, escribí este prompt:

```
Generá un nombre creativo para una startup de seguridad en APIs.
Solo el nombre, sin explicación.
```

1. Con temperature **1.0**: correlo 5 veces. Anotá los 5 nombres — deberían ser todos distintos.
2. Con temperature **0.0**: correlo 5 veces. Anotá los 5 nombres — deberían ser casi todos iguales.

Esa es la intuición: temperature controla el **rango de outputs**, no la calidad.

**Paso 2 — Experimentar con max_tokens**

Cambiá el prompt a:

```
Explicá qué es OAuth 2.0.
```

1. Con max_tokens **50**: la respuesta se corta brutalmente.
2. Con max_tokens **500**: la respuesta es completa y concisa.
3. Con max_tokens **20000**: la respuesta es la misma que con 500 — el modelo no genera de más solo porque tiene espacio. Pero si el modelo alucina, 20000 no lo frena.

La lección: max_tokens es un **techo de seguridad**, no un objetivo.

**Paso 3 — Experimentar con thinking**

Cambiá el prompt a un problema de razonamiento:

```
Si un tren sale a las 14:30 a 90km/h y otro sale a las 15:00 a 120km/h
del mismo punto en la misma dirección, ¿a qué hora se encuentran?
Responde solo con la hora en formato HH:MM.
```

1. Con thinking **Disabled**: mirá si acierta (debería dar 16:00).
2. Con thinking **Enabled**: mirá el razonamiento interno. ¿Usó las ecuaciones correctas?

Si el modelo falla sin thinking pero acierta con él, tenés un caso donde thinking vale el costo extra.

## Anti-patterns

- ❌ **Dejar temperature en 1 para producción de clasificación**. Temperature 1 es para creatividad. Para tareas determinísticas (clasificación, extracción, parseo), bajá a 0.
- ❌ **No ajustar max_tokens**. Dejar 20000 en producción cuando tu output debería ser 50 tokens no te cobra extra *si el modelo se porta bien*, pero si alucina, no hay freno. Ajustá al rango esperado + margen.
- ❌ **Activar thinking para todo**. Thinking consume tokens de output extras. Solo activalo cuando el problema lo requiere (razonamiento, debugging de lógica).
- ❌ **Confundir temperature con "inteligencia"**. Temperature 0 no es más inteligente que 1. Es más predecible. La calidad depende del modelo (Haiku vs Sonnet vs Opus), no de la temperature.
- ❌ **Usar snapshots en tu código de producción**. El Workbench muestra `claude-sonnet-4-5-20250929` — no copies eso a tu código. Usá aliases estables (`claude-sonnet-4-6`).
- ❌ **Buscar top_p/top_k en el Workbench**. No están. Usá la API directa si realmente los necesitás (en la práctica, temperature solo cubre el 99% de los casos).
- ❌ **Dejar thinking activo "por las dudas" en un prompt productivo**. Duplica o triplica el output_tokens. Medí con y sin thinking sobre 10 casos: si la calidad no mejora de forma consistente, apagalo.
- ❌ **Mover temperature de 1 a 0.5 esperando menos varianza y seguir sorprendiéndote**. El cambio grande es de 1 → 0 (o 0.2). Entre 0.5 y 1.0 la varianza es similar en la práctica para la mayoría de tasks.

## Recap

- **El panel Model del Workbench expone 3 parámetros**: temperature (slider 0-1), max tokens (input numérico), thinking (toggle).
- **Los demás parámetros** (top_p, top_k, stop_sequences, metadata) solo están disponibles via API directa.
- **Temperature** controla varianza, no calidad: 0 para determinismo, 1 para exploración.
- **Max tokens** es un techo de seguridad, no un objetivo. Ajustalo al rango esperado.
- **Thinking** activa extended thinking desde la UI — útil para debugging y razonamiento, caro para tareas simples.
- **Los modelos del dropdown usan snapshots** — cambiá a aliases estables cuando exportes a código.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** <!-- exercise:ex-02-02-parametros-efecto -->
