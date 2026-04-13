# Familia de modelos 4.x y cómo elegir

## Objetivo

Al terminar sabrás **cuándo usar Haiku 4.5, Sonnet 4.6 u Opus 4.6**, cómo comparar su costo por token, por qué conviene pasar siempre el **alias estable** en vez del snapshot con fecha, y cómo validar tu decisión con una prueba directa contra la API.

## Concepto

### Los tres modelos vivos de la familia 4.x

En la generación actual (4.x) hay **tres modelos que vas a usar en el día a día**, y cada uno está optimizado para un punto distinto del triángulo inteligencia/velocidad/costo:

<terminology>

**`claude-haiku-4-5`** — el más rápido y barato. Descrito oficialmente como "el modelo más veloz con inteligencia cercana a frontier". Es tu **default mental**: arranca todo prototipo y toda lección con Haiku, y solo sube si el resultado no alcanza.

**`claude-sonnet-4-6`** — el balance entre velocidad e inteligencia. Pensado para agents y coding en producción cuando Haiku se queda corto pero no necesitas lo máximo. Mismo precio que Sonnet 4.5 y Sonnet 4, pero más capaz que ambos.

**`claude-opus-4-6`** — el modelo más inteligente de la familia, pensado para **building agents and coding** complejos. También es el único que soporta **fast mode** (output ~6x más rápido a 6x el precio) como research preview.

</terminology>

Hay modelos previos (4.5, 4.1, 4.0, 3.7, 3.5, etc.) todavía disponibles por compatibilidad, pero no los vas a elegir para proyectos nuevos salvo razón específica de reproducibilidad. Son los 4.6/4.5 los que debés tener en la cabeza.

### Precios reales (por millón de tokens)

Los precios actuales del Claude API (1P, global routing) según [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing):

| Modelo | Input | Output | Cache write 5m | Cache read |
|---|---|---|---|---|
| `claude-haiku-4-5` | $1 / MTok | $5 / MTok | $1.25 / MTok | $0.10 / MTok |
| `claude-sonnet-4-6` | $3 / MTok | $15 / MTok | $3.75 / MTok | $0.30 / MTok |
| `claude-opus-4-6` | $5 / MTok | $25 / MTok | $6.25 / MTok | $0.50 / MTok |

Dos observaciones cruciales:

1. **Output es siempre 5x más caro que input.** Esto es casi constante en toda la familia 4.x y es la razón principal por la que `max_tokens` importa: cada token que Claude genera cuesta cinco veces más que cada token que vos pasaste.
2. **Los saltos no son lineales.** Pasar de Haiku a Sonnet es **3x**; pasar de Haiku a Opus es **5x**. Antes (Opus 4.1 y anteriores) Opus era 15x más caro — 4.6 cerró mucho esa brecha, pero sigue siendo 5x y eso suma rápido en volumen.

### Ventanas de contexto

Los tres modelos 4.x de la generación actual soportan **1M tokens de contexto** (Opus 4.6 y Sonnet 4.6 lo exponen vía *Claude Mythos Preview* al mismo precio; Haiku 4.5 lo ofrece también). La práctica: **casi nunca es el límite**. Si un prompt no entra en 1M tokens, el problema no es el modelo, es el diseño.

### Aliases vs snapshots con fecha

Cada modelo tiene **dos nombres** que podés pasar en el campo `model` del request:

- **Alias estable**: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`. Apuntan siempre a la versión "current" de esa familia.
- **Snapshot con fecha**: `claude-haiku-4-5-20251001`, `claude-opus-4-5-20251101`, etc. Congelan la versión exacta.

**Regla operativa del curso**: en código de aplicación, pasá siempre el **alias**. Si Anthropic publica una versión nueva de Haiku 4.5, tu código se beneficia automáticamente, y como el modelo es API-compatible, no te rompe nada. Reservá los snapshots con fecha para:

- Evaluaciones offline donde necesitás resultados reproducibles exactos.
- Cuando detectaste una regresión en la versión nueva y querés pinear temporalmente la anterior mientras reportás el bug.
- La lección específica del curso donde se explica versioning (esta).

Nota importante: cuando pasás un alias, la respuesta de la API puede devolverte **o el mismo alias o el snapshot al que resolvió**, dependiendo del modelo. Lo vas a ver en la ejecución real de abajo: en nuestra prueba, Haiku devolvió `claude-haiku-4-5-20251001` (resolvió al snapshot), mientras que Sonnet y Opus devolvieron el alias sin expandir. **No te confíes** en que el campo `model` de la respuesta siempre sea el alias ni siempre el snapshot — es información, no contrato.

### El modelo mental del arquitecto

La decisión de modelo no es "cuál es el más inteligente" — eso siempre sería Opus. La decisión es:

> **¿Cuál es el modelo más barato que resuelve bien mi tarea a mi tolerancia de latencia?**

Regla mental que va a aparecer en todo el curso:

1. **Empezá siempre con Haiku.** Si el resultado es aceptable, ganaste: tenés lo mismo a 1/3 del precio de Sonnet y 1/5 de Opus.
2. **Subí a Sonnet** cuando Haiku falla en razonamiento de varios pasos, seguir instrucciones complejas, o precisión en generación de código.
3. **Subí a Opus solo con justificación explícita**: tareas de código muy complejas, agentes largos donde la calidad del razonamiento compone a lo largo de muchos turnos, o evaluaciones donde necesitás el techo.

Subir sin justificar es el error más caro que vas a cometer construyendo con la API.

## Ejecución real

Mandemos **exactamente el mismo prompt** a los tres modelos y comparemos output y usage. Esto es lo único que te va a curar del "en teoría Opus es mejor".

**El prompt neutro:**

```
Explica en 2 frases qué es TCP y en qué se diferencia de UDP. Responde en español.
```

**Paso 1 — Correr el mismo curl contra los tres modelos**

```bash
PROMPT='Explica en 2 frases qué es TCP y en qué se diferencia de UDP. Responde en español.'
for MODEL in claude-haiku-4-5 claude-sonnet-4-6 claude-opus-4-6; do
  echo "=== $MODEL ==="
  curl -s https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "{\"model\":\"$MODEL\",\"max_tokens\":256,\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}"
  echo
done
```

**Paso 2 — Lee las respuestas reales**

Cuando lo corrí al escribir esta lección obtuve (resumido, `id` y algunos campos omitidos por brevedad):

```
=== claude-haiku-4-5 ===
model: claude-haiku-4-5-20251001
usage: input_tokens=36, output_tokens=131, inference_geo=not_available
text (primeras líneas):
  **TCP (Transmission Control Protocol)** es un protocolo de comunicación
  que garantiza la entrega ordenada y completa de datos mediante una
  conexión establecida entre dos dispositivos...

=== claude-sonnet-4-6 ===
model: claude-sonnet-4-6
usage: input_tokens=36, output_tokens=149, inference_geo=global
text (primeras líneas):
  **TCP (Transmission Control Protocol)** es un protocolo de comunicación
  orientado a la conexión que garantiza la entrega ordenada y confiable
  de los datos, verificando que cada paquete llegue correctamente a su
  destino mediante acuses de recibo (acknowledgments)...

=== claude-opus-4-6 ===
model: claude-opus-4-6
usage: input_tokens=36, output_tokens=167, inference_geo=global
text (primeras líneas):
  **TCP (Transmission Control Protocol)** es un protocolo de comunicación
  orientado a conexión que garantiza la entrega fiable, ordenada y sin
  errores de los datos entre dos dispositivos, estableciendo una
  conexión previa mediante un proceso conocido como three-way handshake...
```

**Paso 3 — Calcular el costo real de cada corrida**

| Modelo | Input | Output | Costo = input × rate_in + output × rate_out |
|---|---|---|---|
| Haiku 4.5 | 36 | 131 | 36 × $1 / 1M + 131 × $5 / 1M = **$0.000691** |
| Sonnet 4.6 | 36 | 149 | 36 × $3 / 1M + 149 × $15 / 1M = **$0.002343** |
| Opus 4.6 | 36 | 167 | 36 × $5 / 1M + 167 × $25 / 1M = **$0.004355** |

Extrapolá esto: para **esta tarea concreta** el ratio de costo real entre los tres modelos fue **aproximadamente 1 : 3.4 : 6.3**. Opus salió 6x más caro que Haiku no porque sea 5x en tarifa, sino porque **además generó más output tokens** (167 vs 131). Esta es una lección general: modelos más capaces tienden a producir respuestas más elaboradas si no les ponés límites, y eso amplifica el ratio de costo.

**Paso 4 — Leé las tres respuestas y hacete la pregunta de arquitecto**

¿La respuesta de Haiku resuelve tu necesidad? En la gran mayoría de los casos prácticos (una explicación técnica de 2 frases), la respuesta es **sí, de sobra**. Opus usa vocabulario más preciso (*"three-way handshake"*), pero si tu usuario final es un alumno de redes, Haiku ya le respondió bien. Usar Opus ahí es **pagar 6x por valor marginal**.

Cuando sí conviene subir: si el prompt fuera *"dame un análisis comparativo de 6 protocolos de transporte con pros/contras para un ambiente de IoT con packet loss"*, Opus te va a dar estructura y razonamiento que Haiku puede no cubrir. Esa es la pregunta que vale la pena hacerse, no "¿cuál es el mejor?".

## Anti-patterns

- ❌ **"Por las dudas uso Opus"**. El "por las dudas" te cuesta 5x en tarifa y más del 5x real por output más largo. Empezá con Haiku siempre.
- ❌ **Hardcodear `claude-haiku-4-5-20251001` en código de producción "para reproducibilidad"**. Reproducibilidad la querés en evaluaciones offline, no en la app viva. En producción, usá el alias y dejá que Anthropic te migre a la versión nueva cuando salga.
- ❌ **Mezclar modelos por capricho en un mismo proyecto.** Si tu pipeline usa 4 prompts, tener 2 en Haiku, 1 en Sonnet y 1 en Opus sin razón documentada es una deuda operativa: nadie va a saber por qué. Documentá la razón por prompt.
- ❌ **Comparar modelos solo por el texto**, sin mirar `usage`. La diferencia de costo real se manifiesta en output tokens, no en tarifas abstractas. Mirá `usage.output_tokens` en cada corrida que hagas para comparar.
- ❌ **Saltar de Haiku directo a Opus** sin probar Sonnet. Sonnet suele ser el sweet spot de producción (3x Haiku en tarifa pero diferencia de calidad sustancial). Opus es para cuando Sonnet tampoco alcanza.
- ❌ **Asumir que la API te va a devolver el snapshot expandido siempre.** Nuestra prueba mostró que Haiku devolvió el snapshot con fecha, pero Sonnet y Opus devolvieron el alias tal cual. No confíes en el campo `model` de la respuesta como fuente de verdad del snapshot — si necesitás pin exacto, pasálo vos en el request.

## Recap

- **Tres modelos para la vida diaria**: `claude-haiku-4-5` ($1/$5 per MTok), `claude-sonnet-4-6` ($3/$15) y `claude-opus-4-6` ($5/$25). Output es siempre 5x el input.
- **Default mental: Haiku.** Subí a Sonnet cuando Haiku falla, a Opus solo con justificación explícita. "Por las dudas" no es justificación.
- **Alias en producción, snapshot con fecha solo en evals reproducibles.** La respuesta puede devolverte cualquiera de los dos en el campo `model`; no te confíes.
- **El costo real no es solo la tarifa**, es tarifa × tokens. Modelos más grandes tienden a generar output más largo, amplificando el ratio. Medí con `usage`, no con intuición.

---

**Fuente oficial:** [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** <!-- exercise:ex-01-01-elegir-modelo -->
