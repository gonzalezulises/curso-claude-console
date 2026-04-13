# Iterar un prompt efectivamente

## Objetivo

Al terminar sabrás **usar el ciclo edit-run-compare del Workbench** para iterar un prompt en segundos (no minutos), entenderás cómo el Workbench versiona automáticamente cada cambio, y vas a usar **variables `{{nombre}}`** y el tab **Evaluate** para testear el mismo prompt con distintos inputs sin reescribirlo.

## Concepto

### El ciclo de 30 segundos: edit → run → compare

El valor central del Workbench es la **velocidad de iteración**. El ciclo es:

1. **Edit**: escribís o modificás el prompt en el panel izquierdo.
2. **Run**: hacés click en ▶ Run (o `⌘ + ↵` en Mac).
3. **Compare**: leés la respuesta en el panel derecho. ¿Cumple? Si sí, avanzá. Si no, volvé al paso 1.

Ese ciclo tarda **~30 segundos** con Haiku 4.5 (modelos rápidos). Con Sonnet puede ser ~5-10 segundos. Compará eso con el ciclo "editar .ts → guardar → `npx tsx` → leer terminal → volver al editor" que tarda ~60-90 segundos mínimo. **El Workbench te da 2-3x más iteraciones por minuto.**

### Versionado automático

Cada vez que editás el prompt **o** cambiás un parámetro del modelo (temperature, max_tokens, thinking), el Workbench crea una **nueva versión** automáticamente. Podés navegar entre versiones con los íconos numerados al lado del selector de modelo.

Esto es poderoso para comparar: "la versión 3 con temperature 0.5 daba mejor resultado que la versión 4 con temperature 1". No necesitás git para el ciclo de exploración — el Workbench es tu version control de prototipado.

> **Importante**: las versiones del Workbench **no reemplazan git**. Cuando tu prompt está estable, exportalo con Get Code (Lección 06) y commitealo. El Workbench es para explorar; git es para commitear.

### Variables: `{{VARIABLE_NAME}}`

En vez de reescribir el prompt completo cada vez que querés probar con un input distinto, usás **variables**:

```
Clasificá el siguiente ticket en: billing, technical, account, other.
Responde solo con la categoría.

Ticket: {{TICKET_TEXT}}
```

Cuando corrés ese prompt, el Workbench te pide el valor de `{{TICKET_TEXT}}`. Podés cambiar el valor y re-correr sin tocar el prompt base. Es la diferencia entre "editar todo" y "cambiar solo el input".

### El tab Evaluate: Test Cases

El tab **Evaluate** (visible al lado de "Prompt" en la barra superior) te lleva a un panel de **Test Case** donde podés definir múltiples valores para tus variables y correr el prompt contra cada uno. Es few-shot testing sin código.

El panel de Test Case muestra el estado vacío: "No variables. Use variables to test the prompt across different scenarios. You can create a variable inline like this: `{{variable_name}}`".

Para usarlo:

1. Definí variables en tu prompt (`{{TICKET_TEXT}}`).
2. Hacé click en el tab **Evaluate**.
3. Creá test cases con distintos valores.
4. Corré y compará las respuestas.

Es la forma más rápida de validar que un prompt funciona sobre un rango de inputs antes de llevarlo a código.

### El botón "Generate Prompt"

El Workbench tiene un botón **Generate Prompt** (con ícono ✦) en la sección User. Hace lo que dice: genera un prompt inicial basado en una descripción breve que vos escribís. Es útil como punto de partida si no sabés cómo empezar, pero **nunca uses un prompt generado sin refinarlo** — es un borrador, no un producto.

### Examples

Al lado del selector de modelo, el botón **Examples** permite agregar ejemplos de input/output (few-shot) directamente desde la UI. Es el equivalente visual de los few-shot que construiste a mano en el Módulo 3, Lección 02. Anthropic recomienda usarlo después de draftar el prompt base.

### Pre-fill response

El checkbox **Pre-fill response** en la parte inferior del panel izquierdo activa el prefill del turno assistant — la misma técnica de la Lección 07 del Módulo 3. Cuando lo activás, aparece un campo donde escribís el inicio de la respuesta (ej: `{` para forzar JSON). El Workbench lo manda como turno `assistant` parcial.

### Cuándo bajar temperature y cuándo subirla

Para la fase de **exploración** (estás buscando el tono, el formato, el approach), usá temperature alta (0.8-1.0) para ver el rango de outputs posibles.

Para la fase de **estabilización** (ya encontraste el approach y querés que sea reproducible), bajá a 0.0-0.3. Con temperature 0, el output es casi determinístico — ideal para validar que el prompt produce resultados consistentes.

El slider de temperature está en el panel Model (icono ⚙). El default es 1.

### Comparación: Workbench vs REPL vs código

El ciclo de iteración del Workbench no es el único disponible. Vale la pena tener explícita la matriz de trade-offs antes de elegir:

| Ciclo | Tiempo por iteración | Versionado | Costo mental | Cuándo usarlo |
|-------|----------------------|------------|--------------|---------------|
| **Workbench** | ~5-30 s | Automático (Anthropic) | Bajo | Exploración y estabilización del prompt |
| **REPL / notebook** | ~10-60 s | Manual (célula por célula) | Medio | Pegar el snippet de Get Code y seguir iterando con datos reales |
| **Archivo `.ts` + `npx tsx`** | ~60-90 s | Git | Alto | Prompt ya estable + lógica productiva alrededor |
| **CI/CD + eval suite** | Minutos | Git + runs persistidos | Alto | Validación antes de deploy, golden set |

La regla: **empezás arriba y bajás conforme el prompt se estabiliza**. Subir antes de tiempo (pasarse a `.ts` con un prompt todavía vago) te cuesta velocidad; quedarse en Workbench cuando ya hay datos reales y lógica te cuesta rigor.

### Conceptos de arquitecto

Tres cosas que este loop rápido habilita — y una que oculta:

- **Calibración del modelo correcto**: con el ciclo de 30 s podés correr el mismo prompt en Haiku, Sonnet y Opus y ver con tus propios ojos el salto de calidad/costo. Es el único test honesto para decidir qué modelo va en prod.
- **Detección de sobre-prompting**: si iterás 8 veces y las respuestas mejoran poco, probablemente el problema no es el prompt sino el modelo (Haiku cuando necesitabas Sonnet) o la tarea (falta de few-shot, falta de contexto).
- **Data-driven few-shot**: cuando entrás a Evaluate con 10 casos, los que fallan son exactamente los ejemplos que deberías agregar como few-shot. El ciclo te da los datos de training gratis.
- **Lo que el Workbench NO captura**: latencia real con tu red, retries, fallbacks, caching, errores 429. Un prompt "perfecto" en el Workbench puede romperse en prod por factores que la UI no simula. El Workbench valida calidad del output, no robustez del sistema.

## Ejecución real

Vamos a hacer una iteración completa en el Workbench: un prompt de clasificación de tickets, desde versión vaga hasta versión estable.

**Paso 1 — Prompt inicial (vago)**

En el Workbench, escribí en el campo **User**:

```
Decime qué tipo de ticket es: "No me llegó la factura de marzo"
```

Click en **▶ Run**. Observá la respuesta: probablemente larga, con explicación, quizás con heading.

**Paso 2 — Refinar (directo)**

Sin borrar el anterior, editá el prompt:

```
Clasificá el siguiente ticket en: billing, technical, account, other.
Responde solo con la categoría en minúscula.

Ticket: No me llegó la factura de marzo.
```

Click en **▶ Run**. La respuesta debería ser `billing` — una sola palabra. Mirá cómo el versionado automático creó una nueva versión.

**Paso 3 — Parametrizar con variables**

Reescribí el prompt con variable:

```
Clasificá el siguiente ticket en: billing, technical, account, other.
Responde solo con la categoría en minúscula.

Ticket: {{TICKET}}
```

Cuando corrés, el Workbench te pide el valor de `{{TICKET}}`. Probá con:

- `"No me llegó la factura de marzo"` → billing
- `"La app se cierra cuando abro el dashboard"` → technical
- `"No puedo cambiar mi contraseña"` → account
- `"¿Tienen descuentos para universidades?"` → other

Si las 4 clasifican correctamente, tu prompt es estable. Si alguna falla, iterás el prompt (quizás agregando few-shot examples).

**Paso 4 — Bajar temperature para estabilización**

Abrí el panel Model (icono ⚙), bajá temperature a **0**. Corré los mismos 4 tickets. Con temperature 0, el output debería ser idéntico en cada corrida — confirmá re-corriendo 2-3 veces.

**Paso 5 — Usar Evaluate con test cases**

Hacé click en el tab **Evaluate**. Creá test cases con los 4 tickets. Corré todos a la vez y compará las respuestas en una tabla.

Este flujo completo (pasos 1 a 5) debería llevarte **menos de 10 minutos**. El mismo flujo en código (editar .ts, correr, leer output, cambiar input, re-correr) llevaría 30-45 minutos. **Esa es la razón de existir del Workbench.**

## Anti-patterns

- ❌ **Saltar del primer prompt al código sin iterar**. Si tu primer prompt funciona "bien", probablemente no lo probaste con suficientes inputs. Usá variables y Evaluate antes de exportar.
- ❌ **Editar el prompt sin correr entre ediciones**. Cada cambio debe validarse inmediatamente. Acumular 5 cambios y correr una vez te deja sin saber cuál cambio causó qué efecto.
- ❌ **No usar variables para inputs que cambian**. Si estás copy-pasteando textos distintos en el prompt cada vez, parametrizá con `{{VARIABLE}}`. Es más rápido y más limpio.
- ❌ **Confiar en una sola corrida**. Un prompt que funciona 1/1 veces no es estable. Corré al menos 3-5 veces con distintos inputs. Usá Evaluate para sistematizar.
- ❌ **Dejar temperature en 1 para producción**. Temperature 1 es para explorar. Para estabilizar y validar, bajá a 0-0.3. No exportes un prompt como "estable" si solo lo probaste con temperature 1.
- ❌ **Usar "Generate Prompt" sin refinamiento**. El prompt generado es un borrador — nunca es production-ready. Siempre aplicá las técnicas del Módulo 3 (ser directo, formato, restricciones).
- ❌ **Considerar "estable" un prompt que solo probaste con Sonnet**. Si el plan es correr en prod con Haiku (más barato), validá en Haiku antes de cerrar. El salto de Sonnet a Haiku suele exponer un prompt que dependía de la inteligencia del modelo en vez de la especificidad del prompt.
- ❌ **Confundir "few-shot del Workbench" con el `content` del request**. Los ejemplos agregados vía el botón **Examples** se convierten en pares `user`/`assistant` en el array `messages` del snippet final. Si los copiás a mano en un `.ts` como system prompt, cambia el comportamiento — el modelo aprende mejor de pares conversacionales que de un bloque de texto con casos.

## Recap

- **Ciclo del Workbench**: edit → ▶ Run → compare. ~30 segundos por iteración, 2-3x más rápido que código.
- **Versionado automático**: cada cambio de prompt o parámetro crea una nueva versión navegable.
- **Variables `{{NOMBRE}}`**: parametrizá inputs para probar el mismo prompt con datos distintos sin reescribir.
- **Tab Evaluate + Test Case**: corré múltiples inputs a la vez y compará respuestas en tabla.
- **Temperature**: alta (0.8-1.0) para explorar, baja (0-0.3) para estabilizar.
- **El Workbench no reemplaza git** — es para exploración. Cuando el prompt es estable, exportá y commiteá.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
**Ejercicio:** <!-- exercise:ex-02-01-iteracion-prompt -->
