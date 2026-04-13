# Exportar a código: Get Code

## Objetivo

Al terminar sabrás **cómo el botón Get Code del Workbench genera un snippet listo para copiar**, qué lenguajes soporta (Python, TypeScript, curl), qué partes del snippet son boilerplate y cuáles son tu prompt real, y **qué tenés que cambiar obligatoriamente** antes de usar el snippet en producción.

## Concepto

### El botón Get Code

En la barra superior del Workbench, a la derecha, hay un botón **Get Code**. Al hacer click, abre un modal **"Code for Claude API"** con:

- **Selector de lenguaje** (dropdown): Python, TypeScript, curl, y posiblemente otros.
- **El snippet generado**: código completo que reproduce exactamente la configuración actual del Workbench (modelo, parámetros, system prompt, messages, tools).
- **Botón Copy Code**: copia el snippet al clipboard.
- **Botón View Docs**: enlace a la documentación de la API.

El snippet incluye **todo** lo que configuraste en el Workbench: el modelo con su snapshot, la temperature, max_tokens, thinking, el system prompt, y los mensajes. Es una "foto" exacta de tu configuración actual convertida a código ejecutable.

### Anatomía del snippet generado (Python)

Así se ve el snippet generado para un Workbench vacío con parámetros default:

```python
import anthropic

client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
    api_key="my_api_key",
)

message = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=20000,
    temperature=1,
    messages=[],
    thinking={
        "type": "disabled"
    }
)
print(message.content)
```

### Las 5 cosas que tenés que cambiar para producción

El snippet exportado es un **punto de partida**, no un producto terminado. Estos son los cambios obligatorios:

<terminology>

**1. La API key hardcodeada**: el snippet genera `api_key="my_api_key"` como placeholder. En producción, **nunca hardcodeés la key**. Usá `process.env.ANTHROPIC_API_KEY` (TS) o `os.environ.get("ANTHROPIC_API_KEY")` (Python). El SDK lee la variable de entorno por defecto si no le pasás nada — omití el parámetro directamente.

**2. El snapshot del modelo**: el snippet usa el snapshot exacto del Workbench (ej: `claude-sonnet-4-5-20250929`). En producción, **cambiá al alias estable** (`claude-sonnet-4-6`). Los aliases apuntan al snapshot más reciente del modelo, así recibís mejoras automáticas.

**3. max_tokens**: el default del Workbench es 20000, que es generoso para prototipado. En producción, **bajalo al rango real de tu output** (50 para clasificación, 500 para resúmenes, etc.). Es tu freno de mano contra aluciones largas.

**4. Retries y error handling**: el snippet no tiene ningún manejo de errores. En producción, **agregá retries con exponential backoff** (que ya aprendiste en el Módulo 1, Lección 09) y handling de errores 429/500/529.

**5. Logging**: el snippet hace `print(message.content)`. En producción, **loggeá** `usage.input_tokens`, `usage.output_tokens`, `stop_reason`, y el costo estimado. Es la base de observabilidad que vas a ver en el Módulo 6.

</terminology>

### El snippet como "contrato" entre UI y código

El valor real de Get Code no es ahorrarte tipeo (es código trivial). Es que te da un **contrato verificable**: si el prompt funcionaba en el Workbench con esos parámetros exactos, el snippet exportado debería dar el mismo resultado. Cualquier diferencia entre "funciona en el Workbench" y "no funciona en mi código" se reduce a una de las 5 cosas de arriba (key, modelo, max_tokens, retries, logging).

Si después de cambiar esas 5 cosas el resultado difiere, el problema es probablemente la **temperature**: el Workbench y tu código pueden estar usando temperature distintas.

### Workflow recomendado: Workbench → Get Code → Git

El workflow completo de un prompt desde idea hasta producción:

```
1. Idea → Workbench (iterar rápido con edit-run-compare)
2. Estable → Get Code (exportar snippet)
3. Adaptar → cambiar las 5 cosas para producción
4. Validar → correr localmente y verificar output equivalente
5. Commit → commitear el código adaptado a git
6. Repetir → si necesitás iterar de nuevo, volvé al Workbench
```

No saltees el paso 4: corré el código adaptado y compará con lo que veías en el Workbench. Cualquier diferencia es un bug que hay que resolver ahora, no en producción.

### Config Workbench vs config producción (lado a lado)

Esta tabla resume lo que suele diferir entre el snippet exportado y el código que termina commiteado:

| Campo | Workbench (snippet crudo) | Producción (adaptado) |
|-------|---------------------------|------------------------|
| API key | Hardcodeada como `"my_api_key"` | Omitida; el SDK lee `ANTHROPIC_API_KEY` del env |
| `model` | Snapshot fechado (`claude-sonnet-4-5-20250929`) | Alias estable (`claude-sonnet-4-6`) |
| `max_tokens` | 20000 (default amplio) | Ajustado al rango real (50-2000) |
| `temperature` | 1 (o lo que tocaste) | Valor decidido (0 para extracción, 0.3 para clasificación, 0.7 para redacción) |
| Retries | Ninguno | Exponential backoff con límite de reintentos |
| Logging | `print(message.content)` | `usage.input_tokens`, `output_tokens`, `stop_reason`, cost |
| Manejo de errores | Ninguno | try/catch con handling distinto para 429, 500, 529 |
| Validación de output | Ninguna | Parser/schema check del output (si el prompt genera JSON) |

Si tu PR tiene el snippet pegado tal cual, el reviewer debería rechazarlo por todas estas razones.

### Debugging: "funciona en el Workbench, falla en código"

El 90% de estos casos se reduce a una de estas cinco causas. Revisalas **en este orden** antes de buscar cosas más raras:

1. **Modelo distinto**: el Workbench usa snapshot; tu código usa alias. Si el alias apuntó a una versión nueva, el comportamiento puede diferir. Probá pineando el mismo snapshot del Workbench en tu código como prueba.
2. **Temperature distinta**: el default del Workbench es 1; en tu código el default del SDK también es 1, pero si usaste el slider del Workbench a otro valor y no lo reflejaste en el código, hay discrepancia.
3. **System prompt distinto**: revisá que copiaste exactamente el system del Workbench, sin espacios de más o saltos de línea cortados.
4. **Orden de messages**: el Workbench preserva el orden visual; en tu código revisá que el array de `messages` esté en la misma secuencia (primer user, asistente si hay, user final).
5. **Max tokens recortando la respuesta**: si bajaste `max_tokens` para producción y tu output real es más largo, el `stop_reason` va a ser `"max_tokens"`. Mirá ese campo antes de asumir que el modelo falló.

### Conceptos de arquitecto

- **Get Code documenta tu prompt mejor que cualquier comentario**: el snippet muestra exactamente la configuración que funcionó. Pegalo como comentario de referencia en el código productivo (o en un fixture de test), y cuando alguien pregunte "¿qué prompt usamos?" la respuesta es literal.
- **El snippet exportado es un test de regresión gratis**: si lo volvés a pegar dentro de 6 meses y el output difiere, algo cambió (modelo, prompt, datos de ejemplo, sampling). Ese test con 3 líneas vale más que cero tests.
- **Nunca inviertas el flujo**: editar el prompt en código y después "traerlo" al Workbench para iterar es penoso (tenés que reconstruir el estado). Siempre iterá en Workbench → exportá cuando esté estable.

## Ejecución real

**Paso 1 — Configurar un prompt en el Workbench**

1. Abrí el Workbench.
2. Escribí en **System Prompt**: `"Eres un clasificador de tickets. Respondés solo con la categoría: billing, technical, account, other."`.
3. Escribí en **User**: `"Ticket: No me llegó la factura de marzo."`.
4. Bajá **temperature a 0** y **max_tokens a 50** en el panel Model.
5. Hacé click en **▶ Run** y verificá que la respuesta es `billing`.

**Paso 2 — Exportar con Get Code**

1. Hacé click en **Get Code** (arriba a la derecha).
2. Seleccioná **Python** en el dropdown.
3. Observá el snippet generado: debería incluir tu system prompt, tu message, temperature 0, max_tokens 50.
4. Hacé click en **Copy Code**.

**Paso 3 — Adaptar para producción**

Pegá el snippet en un archivo local y hacé los 5 cambios:

```python
import anthropic

# 1. NO hardcodear key — el SDK lee ANTHROPIC_API_KEY del env
client = anthropic.Anthropic()

message = client.messages.create(
    # 2. Alias estable en vez de snapshot
    model="claude-haiku-4-5",
    # 3. max_tokens ajustado (50 está bien para clasificación)
    max_tokens=50,
    # 4. temperature explícita
    temperature=0,
    system="Eres un clasificador de tickets. Respondés solo con la categoría: billing, technical, account, other.",
    messages=[
        {"role": "user", "content": "Ticket: No me llegó la factura de marzo."}
    ],
)

# 5. Logging mínimo
print(f"Respuesta: {message.content[0].text}")
print(f"Tokens: in={message.usage.input_tokens}, out={message.usage.output_tokens}")
print(f"Stop: {message.stop_reason}")
```

**Paso 4 — Correr y comparar**

Corré el script. Si la respuesta es `billing` con `stop_reason: "end_turn"`, tu pipeline Workbench → código funciona.

## Anti-patterns

- ❌ **Copiar el snippet de Get Code sin modificar**. Tiene key hardcodeada, snapshot de modelo, max_tokens excesivo, sin retries, sin logging. Los 5 cambios son obligatorios.
- ❌ **Cambiar el prompt en el código sin volver al Workbench**. Si necesitás iterar el prompt, volvé al Workbench donde iterás 3x más rápido. No optimices prompts en un archivo .ts/.py.
- ❌ **Asumir que Get Code genera "best practices"**. Es un export literal de tu config, no un ejemplo de producción. Vos agregás retries, logging, error handling.
- ❌ **Usar el snippet generado como template para todo tu proyecto**. Cada prompt es distinto. No reutilices el boilerplate del snippet — creá abstracciones propias (wrappers, configs) cuando tengas 3+ prompts en producción.
- ❌ **No verificar que el output en código coincide con el del Workbench**. Siempre corré y compará antes de commitear.

## Recap

- **Get Code** exporta tu configuración actual del Workbench como snippet Python/TS/curl — es una "foto" exacta.
- **5 cambios obligatorios**: eliminar key hardcodeada, snapshot → alias estable, ajustar max_tokens, agregar retries, agregar logging.
- **El workflow completo**: Workbench (iterar) → Get Code (exportar) → adaptar → validar → commit.
- **El snippet no es production-ready** — es un punto de partida que vos adaptás.
- **Si difiere del Workbench**, revisá temperature y los 5 cambios antes de buscar bugs más exóticos.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
**Ejercicio:** <!-- exercise:ex-02-04-export-workbench -->
