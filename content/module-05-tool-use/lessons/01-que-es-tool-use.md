# ¿Qué es tool use y por qué cambia todo?

## Objetivo

Al terminar esta lección sabrás **qué es tool use en términos del modelo mental**, por qué "Claude no ejecuta código — propone llamadas y tu código ejecuta", y por qué este cambio conceptual es el pivote entre un chatbot y un agente. También vas a entender por qué MCP, Skills, Managed Agents y Claude Code son todas abstracciones sobre este mismo primitivo.

## Concepto

### Antes de tool use: Claude es un generador de tokens

Hasta ahora usaste la API de esta manera:

```
user: "¿Cuál es el clima en Tokio?"
↓
Claude: "No tengo acceso a datos en tiempo real..."
```

Claude puede razonar sobre el mundo, pero **no puede consultarlo**. No tiene API calls, no tiene DB, no tiene bash. Solo texto que entra y texto que sale.

### Con tool use: Claude propone, tu código ejecuta

Tool use invierte el flujo: vos le decís qué "herramientas" tenés disponibles (funciones reales de tu programa), y Claude **decide cuándo invocarlas** y **con qué argumentos**.

```
user: "¿Cuál es el clima en Tokio?"
↓
Claude (turno 1): "Voy a usar la tool get_weather con city=Tokio"
                   [tool_use: {name: 'get_weather', input: {city: 'Tokio'}}]
↓
Tu código ejecuta get_weather('Tokio') → {"temp": 22, "conditions": "soleado"}
↓
Tu código le devuelve el resultado a Claude
                   [tool_result: '{"temp": 22, "conditions": "soleado"}']
↓
Claude (turno 2): "En Tokio hay 22°C con condiciones soleadas."
```

<terminology>

**Principio clave**: Claude **NUNCA ejecuta código**. Solo genera JSON estructurado que dice "quiero usar esta tool con estos argumentos". Es tu runtime (TypeScript, Python, Go) el que ejecuta la función y le devuelve el resultado.

Esta separación es **la única razón por la que tool use es seguro**: Claude no tiene acceso directo a tu DB, tu bash, tu red. Todo pasa por tu código, que puede validar, auditar, loguear, o rechazar.

</terminology>

### Por qué esto cambia todo

Sin tool use, Claude es un asistente de escritura inteligente. Con tool use:

- **Leer el mundo**: APIs REST, bases de datos, archivos, sensores.
- **Escribir en el mundo**: enviar emails, crear tickets, ejecutar transacciones.
- **Encadenar pasos**: "busca X, luego con ese resultado calcula Y, luego envíame un Slack."
- **Reaccionar a errores**: si una tool falla, el modelo puede intentar otra estrategia.

Esto es **un agente**. No porque Claude sea "más inteligente" — sino porque ahora tiene manos.

### Tool use es el primitivo más importante del ecosistema

Todo lo que vas a aprender después se construye sobre esto:

- **MCP (Módulo 7)**: servidores externos que exponen tools a Claude via un protocolo estándar. MCP server = tools remotos.
- **Skills (Módulo 8)**: paquetes portables de tools + prompts + recursos.
- **Managed Agents (Módulo 9)**: Anthropic orquesta el loop por vos.
- **Claude Code (Módulo 10)**: CLI que implementa un agente completo con tools de filesystem, bash, git, etc.

Si entendés tool use a fondo, todo el resto es "lo mismo con UX diferente".

### Client-side vs server-side tools

Hay dos tipos de tools:

**Client-side (tus tools)**: definís una función en tu código, Claude propone llamarla, vos ejecutás, devolvés el result. Control total, pero cargás con el runtime loop.

**Server-side (tools de Anthropic)**: Claude las ejecuta en su propia infraestructura. Ejemplos: `web_search`, `code_execution`, `bash`, `text_editor`. Menos flexibilidad, pero menos código que mantener.

Este módulo cubre ambos, empezando por client-side (el patrón base) y después server-side (comodidades prefabricadas).

## Ejecución real

Este módulo arranca con teoría, pero para que veas lo concreto, acá va una llamada real a la API pidiéndole a Claude que use una tool:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 500,
    "tools": [{
      "name": "get_weather",
      "description": "Get current weather for a city.",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": {"type": "string"}
        },
        "required": ["city"]
      }
    }],
    "messages": [
      {"role": "user", "content": "¿Cómo está el clima en Buenos Aires ahora?"}
    ]
  }'
```

Respuesta (real):
```json
{
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01XmVphSH9SgDsFPKD29oHWQ",
      "name": "get_weather",
      "input": { "city": "Buenos Aires" }
    }
  ],
  "stop_reason": "tool_use",
  "usage": { "input_tokens": 621, "output_tokens": 55 }
}
```

Observá **el cambio respecto a lo que ya sabías**:

1. En el request hay un campo nuevo: `tools[]`.
2. En la respuesta, `stop_reason` es `"tool_use"` (no `"end_turn"`).
3. El `content` NO tiene un bloque `type: "text"` — tiene un bloque `type: "tool_use"` con un `id`, `name`, y `input`.

**Esto no es "Claude ejecutando get_weather"**. Es Claude diciendo: "quiero que ejecutes get_weather con estos argumentos". Tu código ahora tiene que:

1. Leer el `tool_use` block.
2. Ejecutar realmente `get_weather("Buenos Aires")` (una función tuya o una API real).
3. Devolver el resultado al modelo en un segundo request.

Ese loop lo vas a implementar en las próximas lecciones.

## Anti-patterns

- ❌ **Creer que Claude "llama" la API por vos**. No lo hace. Claude solo genera el JSON que describe la llamada. Tu código la ejecuta.
- ❌ **Pasarle herramientas peligrosas sin capa de validación**. Si definís una tool `delete_user(id)`, Claude puede proponerla. Tu código debe validar antes de ejecutar (¿este usuario tiene permiso? ¿el ID existe? ¿hay confirmación?).
- ❌ **Asumir que Claude siempre usa la tool**. Con `tool_choice: "auto"` (default), el modelo decide si la necesita. Si no la necesita, responde directo con texto. Saltar ese caso es un bug clásico.
- ❌ **Exponer 50 tools "por si acaso"**. Cada tool aparece en el system prompt — muchas tools = prompt inflado = costo + peor razonamiento. Empezá con 3-5, crece cuando sea necesario.
- ❌ **No distinguir client-side de server-side**. Si uno de tus "tools" es en realidad `web_search` de Anthropic, no estás ejecutando nada — Anthropic lo hace. Mezclar los dos tipos confunde el mental model.

## Recap

- Tool use es el pivote del curso: convierte a Claude de "chatbot" en "agente".
- **Claude propone, tu código ejecuta**. Esta separación es la base de seguridad.
- El loop es: `user → tool_use (Claude) → tool_result (tu código) → respuesta final`.
- **Client-side tools**: las definís vos, ejecutás vos.
- **Server-side tools** (web_search, code_execution, bash, text_editor): Anthropic las ejecuta en su sandbox.
- MCP, Skills, Managed Agents y Claude Code son todas abstracciones sobre este primitivo.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use](https://platform.claude.com/docs/en/build-with-claude/tool-use)
**Ejercicio:** Sin ejercicio propio — la lección es conceptual; la práctica arranca en ex-05-01.
