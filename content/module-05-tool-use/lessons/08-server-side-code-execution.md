# Server-side: code_execution (Python sandbox)

## Objetivo

Al terminar esta lección sabrás **usar la tool server-side `code_execution`** — un sandbox Python administrado por Anthropic donde el modelo puede ejecutar código para análisis de datos, cálculos determinísticos, transformaciones y gráficos. Vas a entender su shape en request/response, qué casos de uso la vuelven insustituible, sus limitaciones y su modelo de costos.

## Concepto

### El problema que resuelve

Los LLMs son notoriamente **malos en aritmética multi-paso, parsing estructurado, y cálculos determinísticos**. Ejemplos:

- "Calculá la desviación estándar de estos 500 números."
- "Parseá este CSV y devolveme el top 5 por columna X."
- "Resolvé este sistema de ecuaciones."

Pedir eso por texto libre = el modelo alucina resultados plausibles. La solución: **ejecutar Python real**.

`code_execution` es la server-side tool que expone un intérprete Python aislado. El modelo genera código, Anthropic lo ejecuta en sandbox, recupera stdout/stderr/artifacts, y sintetiza la respuesta final — todo dentro del mismo turno.

### La forma del request

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 2048,
  "tools": [{
    "type": "code_execution_20250522",
    "name": "code_execution"
  }],
  "messages": [
    {"role": "user", "content": "Calculá la desviación estándar de [1,2,3,4,5,6,7,8,9,10]."}
  ]
}
```

<terminology>

**`type: "code_execution_20250522"`**: versión actual. Revisá la docs oficial — puede haber versiones nuevas con más features (ej. soporte de archivos, librerías extra).

**`name: "code_execution"`**: nombre fijo.

**Beta header requerido**: `anthropic-beta: code-execution-2025-05-22` (o equivalente actual).

</terminology>

### La forma del response

Similar a `web_search`, el response trae bloques:

1. `text` — razonamiento ("voy a calcular con numpy…").
2. `server_tool_use` — el código Python que el modelo decidió ejecutar.
3. `code_execution_tool_result` — el output (stdout, stderr, return value, errores).
4. `text` — respuesta final sintetizada.

```json
{
  "content": [
    { "type": "text", "text": "Voy a calcular la desviación estándar." },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_...",
      "name": "code_execution",
      "input": { "code": "import statistics\nprint(statistics.stdev([1,2,3,4,5,6,7,8,9,10]))" }
    },
    {
      "type": "code_execution_tool_result",
      "tool_use_id": "srvtoolu_...",
      "content": [{
        "type": "code_execution_output",
        "stdout": "3.0276503540974917\n",
        "stderr": "",
        "return_code": 0
      }]
    },
    {
      "type": "text",
      "text": "La desviación estándar es aproximadamente 3.03."
    }
  ],
  "stop_reason": "end_turn"
}
```

### Qué hay en el sandbox

- **Python 3.11+** con librerías estándar.
- **Librerías populares preinstaladas**: `numpy`, `pandas`, `scipy`, `matplotlib`, `pillow`, `sklearn`, etc. (consultá la docs — el set cambia).
- **Sin red** (no podés hacer `requests.get(...)`).
- **Filesystem efímero**: archivos creados durante el turno se pierden después.
- **Timeout**: ~60s típico.

### Casos de uso donde `code_execution` gana

**Análisis de datos numéricos**:
```
user: "Tengo estas 300 ventas mensuales [...]. Detectá outliers con IQR y graficá."
→ modelo ejecuta pandas + matplotlib → devuelve figura y explicación.
```

**Validación y transformación de datos**:
```
user: "Convertí este JSON deeply nested en CSV plano."
→ modelo ejecuta script de transformación → devuelve el CSV.
```

**Cálculos financieros y estadísticos**:
```
user: "Calculá la TIR de este flujo de caja."
→ modelo usa numpy-financial o scipy.optimize → devuelve resultado numérico exacto.
```

**Validación de razonamiento matemático**:
```
user: "¿Mi fórmula X=... es correcta? Probala con estos inputs."
→ modelo codea la fórmula, corre los inputs, compara outputs.
```

### Costo y consideraciones

- Cada ejecución suma tokens (el código + output se inyectan al contexto para que el modelo redacte la respuesta final).
- Se factura también el **tiempo de sandbox** aparte (según tiering de Anthropic — consultá billing).
- Para una pregunta simple de chat, **no uses `code_execution`**. Solo cuando haya razón clara para cómputo determinístico.

## Ejecución real

> **Nota:** output basado en la estructura oficial del response descrita en la docs. Verifica beta header y versión antes de correr en producción.

**Request:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: code-execution-2025-05-22" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "tools": [{
      "type": "code_execution_20250522",
      "name": "code_execution"
    }],
    "messages": [
      {"role": "user", "content": "Calculá la media, mediana y desvío estándar de [12, 15, 14, 10, 18, 19, 22, 17, 16, 14]."}
    ]
  }'
```

Response:
```json
{
  "content": [
    { "type": "text", "text": "Voy a calcularlo con Python." },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_01AB...",
      "name": "code_execution",
      "input": {
        "code": "import statistics\ndata = [12, 15, 14, 10, 18, 19, 22, 17, 16, 14]\nprint(f'Media: {statistics.mean(data)}')\nprint(f'Mediana: {statistics.median(data)}')\nprint(f'Desvío estándar: {statistics.stdev(data):.4f}')"
      }
    },
    {
      "type": "code_execution_tool_result",
      "tool_use_id": "srvtoolu_01AB...",
      "content": [{
        "type": "code_execution_output",
        "stdout": "Media: 15.7\nMediana: 15.5\nDesvío estándar: 3.5921\n",
        "stderr": "",
        "return_code": 0
      }]
    },
    {
      "type": "text",
      "text": "Los valores son:\n- Media: 15.7\n- Mediana: 15.5\n- Desvío estándar: 3.59"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "server_tool_use": { "code_execution_seconds": 0.8 }
  }
}
```

Observá:
- El modelo eligió `statistics` (stdlib) — no importó librerías pesadas innecesarias.
- El output numérico es exacto (no una "estimación plausible").
- `usage.server_tool_use.code_execution_seconds` te dice cuánto tiempo consumió.

**TypeScript:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  defaultHeaders: { "anthropic-beta": "code-execution-2025-05-22" },
});

const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  tools: [{
    type: "code_execution_20250522",
    name: "code_execution",
  } as any],
  messages: [
    { role: "user", content: "Calculá la media, mediana y desvío estándar de [12, 15, 14, 10, 18, 19, 22, 17, 16, 14]." },
  ],
});

for (const block of resp.content) {
  if (block.type === "server_tool_use") {
    console.log("CODE:\n" + (block as any).input.code);
  } else if (block.type === "code_execution_tool_result") {
    const out = (block as any).content?.[0];
    console.log("STDOUT:", out?.stdout);
  } else if (block.type === "text") {
    console.log("ANSWER:", (block as any).text);
  }
}
```

## Anti-patterns

- ❌ **Usar `code_execution` para preguntas conversacionales**. "¿Qué es la media?" no necesita Python. Solo prendela cuando haya cómputo determinístico.
- ❌ **Esperar acceso a internet desde el sandbox**. No hay `requests.get(...)`. Si necesitás datos externos, pasalos vos en el prompt.
- ❌ **Asumir persistencia entre turnos**. Cada ejecución es aislada; archivos creados no sobreviven.
- ❌ **Confiar ciegamente en el output sin validar**. El sandbox ejecuta lo que el modelo escribe — si el código está mal, el output está mal. Leé el `code` del `server_tool_use` en casos críticos.
- ❌ **No setear `max_tokens` suficiente**. La respuesta final incluye el output del sandbox + síntesis; quedarse corto trunca la explicación.
- ❌ **Mezclar `code_execution` con client-side tools redundantes**. Si ya tenés `code_execution`, no definas otra tool "run_python" client-side — el modelo se confunde.

## Recap

- `code_execution_20250522` expone un **sandbox Python** server-side con librerías comunes preinstaladas.
- Flujo: `text` → `server_tool_use` (código) → `code_execution_tool_result` (output) → `text` (síntesis). Un solo response.
- Requiere beta header `code-execution-2025-05-22`.
- Ideal para análisis numérico, validación de cálculos, transformaciones determinísticas.
- Sin red, filesystem efímero, timeout ~60s.
- Costo: tokens + segundos de sandbox (`usage.server_tool_use.code_execution_seconds`).

---

**Fuente oficial:** [platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)
**Ejercicio:** <!-- exercise:ex-05-06-code-execution -->
