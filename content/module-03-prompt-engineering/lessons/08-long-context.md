# Long context (hasta 1M con beta)

## Objetivo

Al terminar sabrás **cómo activar la ventana de 1M tokens con el beta header `context-1m-2025-08-07`**, cuál es la estructura óptima de un prompt largo para que Claude use el material de forma confiable (no solo lo reciba), qué patrones de "document ordering" maximizan la extracción, y cuánto cuesta realmente operar con contextos de 200K-1M tokens.

## Concepto

### Los tres pisos de contexto

Claude 4.x soporta tres niveles de ventana de contexto según la configuración:

| Configuración | Ventana | Cómo se activa |
|---|---|---|
| Default | **200K tokens** | Sin header especial. Todos los modelos Claude 4.x. |
| Beta 1M | **1M tokens** (1,048,576) | Header `anthropic-beta: context-1m-2025-08-07` |
| Extended cache + 1M | 1M + cache por 1h | Combinar ambos betas |

200K tokens ya es enorme: ~150K palabras en inglés, ~130K en español. Eso equivale a un libro técnico completo. **La mayoría de los casos de uso quedan cubiertos con la ventana default** — pero hay escenarios legítimos de 1M: repos de código completos, bases de documentación de producto, transcripciones de días de meetings, RAG con muchos chunks.

### Activar la ventana de 1M tokens

Para activar context 1M, agregás el beta header al request:

**curl:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: context-1m-2025-08-07" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 4096,
    "messages": [{
      "role": "user",
      "content": "... prompt de hasta 1M tokens ..."
    }]
  }'
```

**TypeScript SDK:**

```ts
const resp = await client.beta.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  betas: ["context-1m-2025-08-07"],
  messages: [{ role: "user", content: longContent }],
});
```

> **Nota:** el costo de input tokens escala linealmente. Mandar 500K tokens de input a Sonnet 4.6 no es barato — verificá pricing actual antes de integrarlo en producción. Este beta header puede cambiar de nombre en el futuro; verificá la documentación oficial al momento de usar.

### El problema real de long context: no es "enviar" sino "usar"

La ventana de 1M tokens no garantiza que Claude **use** bien el material. Los modelos LLM tienen un fenómeno documentado llamado **"lost in the middle"**: tienden a prestar más atención al material del **principio** y del **final** del prompt, y menos atención al material del **medio**.

Anthropic ha trabajado específicamente en mitigar esto en Claude 4.x (sus benchmarks de needle-in-haystack muestran mejoras significativas), pero el efecto no desapareció completamente, especialmente en ventanas >500K tokens y con preguntas que requieren síntesis de múltiples secciones dispersas.

La buena noticia: **con prompt engineering adecuado, la degradación se minimiza enormemente**.

### Las 5 reglas de long context

<terminology>
**1. Documentos primero, pregunta al final**: poné todo el material (documentos, código, transcripciones) **antes** de la instrucción/pregunta. Claude 4.x está optimizado para este patrón: leer material → recibir pregunta → responder con lo leído fresco en el contexto reciente.

```
<documentos>
[...500K tokens de documentación...]
</documentos>

<pregunta>
Basándote únicamente en los documentos anteriores, ¿cuáles son las
3 inconsistencias más graves en la especificación?
</pregunta>
```

**2. Índice explícito al principio**: si mandás múltiples documentos, un índice al principio ayuda al modelo a saber **qué buscar y dónde**. Funciona como una "tabla de contenidos" que activa la atención hacia las secciones relevantes.

```
<índice>
Los siguientes documentos están incluidos en orden:
1. Especificación de API v3.2 (120K tokens)
2. Guía de migración v2→v3 (45K tokens)
3. Registro de bugs conocidos (15K tokens)
</índice>

<doc1>...</doc1>
<doc2>...</doc2>
<doc3>...</doc3>
```

**3. XML tags para delimitar documentos**: separar los documentos con tags (`<doc1>`, `<doc2>`, o `<document title="spec">`) hace que Claude pueda referenciarlos con precisión en la respuesta. Sin tags, en un bloque de 500K tokens el modelo no sabe dónde termina un documento y empieza otro.

**4. Instrucciones de grounding**: decile explícitamente "basándote únicamente en los documentos proporcionados" o "citá la sección donde encontraste cada dato". Esto reduce alucinación — en lugar de completar con conocimiento general, el modelo se ancla en el material.

**5. Preguntas específicas sobre secciones**: "¿Qué dice el documento 2 sobre rate limits?" es mucho más fácil de responder correctamente que "Resumí todo". Si tu tarea final es un resumen, dividila en sub-preguntas por sección y combiná los resultados.
</terminology>

### Costo progresivo: la ecuación real

El costo de long context escala linealmente con los tokens. Acá van estimaciones con pricing de referencia (verificá pricing actual en la web de Anthropic):

| Tokens de input | Modelo | Costo estimado solo input |
|---|---|---|
| 10K (prompt normal) | Haiku 4.5 | ~$0.01 |
| 100K (documento largo) | Sonnet 4.6 | ~$0.30 |
| 200K (tope default) | Sonnet 4.6 | ~$0.60 |
| 500K (medio 1M) | Sonnet 4.6 | ~$1.50 |
| 1M (tope beta) | Sonnet 4.6 | ~$3.00 |

Más el output generado. **Una sola llamada de 1M tokens cuesta tanto como ~300 llamadas normales de 3K tokens**. Evaluá si realmente necesitás 1M o si un pre-procesamiento (chunking + summarization) reduce el contexto sin perder calidad.

### Long context + prompt caching = el patrón de producción

Si tu documento de 500K tokens **se repite entre llamadas** (ej: toda la documentación de producto, y diferentes usuarios preguntan sobre ella), prompt caching (Módulo 6) reduce el costo de la segunda llamada en adelante a ~10% del input. Eso transforma un patrón caro en uno viable.

El setup:

```json
{
  "system": [
    {
      "type": "text",
      "text": "<documentación>...500K tokens...</documentación>",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    { "role": "user", "content": "¿Qué dice la sección de rate limits?" }
  ]
}
```

Primera llamada: costo completo de write (500K tokens × 1.25x). Segunda llamada en adelante (dentro del TTL): 500K tokens × 0.1x. Es la diferencia entre "long context es inviable" y "long context es el patrón default".

### ¿Cuándo usar long context y cuándo usar RAG?

Decisión frecuente en arquitectura:

| Criterio | Long context | RAG (retrieval + chunks) |
|---|---|---|
| Corpus cambia poco | ✅ Cargar todo | ❌ Overhead de indexación para poco cambio |
| Corpus > 1M tokens | ❌ No entra | ✅ Busca solo los chunks relevantes |
| Pregunta requiere síntesis global | ✅ El modelo ve todo | ❌ Puede perderse chunks críticos no recuperados |
| Pregunta requiere un dato puntual | ❌ Pagar 1M tokens para un dato | ✅ Busca y entrega solo lo relevante |
| Latencia importa | ❌ Más tokens = más latencia | ✅ Menos tokens en el prompt |
| Costo por query | ❌ Alto (proporcional al corpus) | ✅ Bajo (proporcional a los chunks) |

**Regla práctica**: si el corpus cabe en 200K tokens (el tope default), **probá long context primero** — es más simple de implementar que RAG y te da acceso completo al material. Si el corpus es >1M o si la mayoría de queries son puntuales, RAG es mejor.

## Ejecución real

En vez de ejecutar una llamada de 500K tokens (que costaría ~$1.50), vamos a demostrar los patrones de long context con un ejemplo más chico pero representativo: múltiples documentos concatenados con XML tags, índice al principio, y pregunta al final.

**Paso 1 — Prompt con estructura de long context (3 documentos simulados)**

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
      "content": "<índice>\nDocumentos incluidos:\n1. Política de rate limits\n2. Guía de autenticación\n3. Changelog v3.2\n</índice>\n\n<doc1 title=\"Política de rate limits\">\nLos rate limits para el plan Free son 5 RPM y 25K TPM. Para el plan Team son 50 RPM y 300K TPM. Los rate limits se aplican por workspace, no por API key individual. Header de respuesta: anthropic-ratelimit-requests-remaining.\n</doc1>\n\n<doc2 title=\"Guía de autenticación\">\nLa autenticación usa el header x-api-key con una API key de workspace. Las Admin keys usan el header x-admin-api-key y solo están disponibles en el plan Enterprise. Todas las keys empiezan con sk-ant-.\n</doc2>\n\n<doc3 title=\"Changelog v3.2\">\nv3.2 (2025-12-01): Se agregó soporte para output_config con json_schema. Se deprecó el flag legacy_prefill. Se subió el rate limit del plan Team de 40 RPM a 50 RPM.\n</doc3>\n\n<pregunta>\nBasándote únicamente en los documentos anteriores, ¿cuál es el rate limit del plan Team y en qué documento se menciona que cambió recientemente?\n</pregunta>"
    }]
  }' | python3 -c "import sys, json; d=json.load(sys.stdin); print('---TEXT---'); print(d['content'][0]['text']); print('---USAGE---'); print(d['usage'])"
```

> **Nota:** los documentos de este ejemplo son **ficticios para la demostración**. En producción, los datos serían tu documentación real. Los rate limits reales de Anthropic pueden diferir — verificá en la web oficial.

Este patrón escala directamente a 200K-1M tokens: cambiás el contenido de los `<doc>` tags y la `<pregunta>`, pero la estructura es la misma.

**Paso 2 — Header beta para 1M tokens (estructura del request)**

Si necesitás más de 200K:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: context-1m-2025-08-07" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 4096,
    "messages": [{
      "role": "user",
      "content": "... hasta 1M tokens de documentos + pregunta ..."
    }]
  }'
```

> **Nota:** ejecutar una llamada de 1M tokens es caro (~$3 solo en input con Sonnet 4.6). No lo incluimos como "Ejecución real" por esa razón, pero el header es exactamente ese. El ejercicio asociado a esta lección (ex-03-05-long-context) usa un prompt de ~100K tokens para que practiques el patrón con un costo controlado.

## Anti-patterns

- ❌ **Pregunta primero, documentos después**. Claude procesa secuencialmente; si la pregunta va primero, "olvida" detalles del material que viene después. Documentos → pregunta, siempre.
- ❌ **500K tokens sin XML tags ni índice**. Un bloque de texto de medio millón de tokens sin estructura es como un libro sin capítulos. El modelo navega peor y la calidad baja.
- ❌ **Usar 1M tokens por default "porque se puede"**. Cada token de input cuesta. Si tu tarea puede hacerse con 10K tokens de contexto relevante pre-filtrado (RAG), no mandés 1M.
- ❌ **Long context sin caching en producción**. Si el mismo documento se manda N veces, sin caching pagás N veces. Con caching, pagás ~1.25x la primera vez y ~0.1x las siguientes. En producción, caching es obligatorio.
- ❌ **Preguntas genéricas sobre corpus enormes** ("resumí todo"). Cuanto más largo el corpus, más específica debe ser la pregunta. "Resumí los cambios de rate limits entre v3.1 y v3.2" funciona mucho mejor que "resumí todo" sobre 500K tokens.
- ❌ **Asumir que "lost in the middle" no existe**. Claude 4.x mejoró mucho, pero en ventanas >500K con preguntas que requieren info del medio del corpus, la precisión puede bajar. Probá con needle-in-haystack tests sobre tu corpus real.
- ❌ **Long context sin grounding instructions**. Si no decís "basándote únicamente en los documentos", el modelo puede completar con conocimiento general. Para extracción fiel, grounding es obligatorio.
- ❌ **Mandar código fuente sin filtrar**. Si tu repo tiene 2M tokens de código y solo necesitás los 50K tokens de un módulo específico, mandá ese módulo. `node_modules/` en el prompt es un anti-pattern caro.

## Recap

- **Claude 4.x soporta 200K tokens por default y 1M con el beta header `context-1m-2025-08-07`**.
- **5 reglas de long context**: documentos primero + pregunta al final, índice explícito, XML tags entre documentos, instrucciones de grounding, preguntas específicas.
- **El costo escala linealmente**: 1M tokens de input ~$3 con Sonnet 4.6. Evaluá si long context vs RAG para tu caso de uso.
- **Prompt caching es obligatorio** para long context en producción — reduce el costo de reusar el mismo corpus a ~10% del original.
- **"Lost in the middle"** es real pero mitigable con buena estructura y preguntas específicas.
- **200K tokens es suficiente para la mayoría de los casos** — no actives el beta de 1M salvo que realmente necesites más.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips)
**Ejercicio:** <!-- exercise:ex-03-05-long-context -->
