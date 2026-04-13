# Server-side: web_search

## Objetivo

Al terminar esta lección sabrás **usar la tool server-side `web_search`** para que Claude consulte la web dentro del mismo turno sin que tu código implemente el runtime loop. Vas a entender qué son los bloques `server_tool_use` y `web_search_tool_result`, cómo leer las citations `web_search_result_location`, y cuándo `web_search` es la opción correcta vs implementar la búsqueda vos mismo.

## Concepto

### Client-side vs server-side, recordatorio

En las lecciones 01-05 vimos **client-side tools**: definís la tool, Claude propone, tu código ejecuta, devolvés el result. Ahora vamos al otro lado:

**Server-side tool (`web_search`)**: Anthropic ejecuta la búsqueda en su propia infraestructura. El modelo invoca la tool, recibe el resultado internamente, y te devuelve la respuesta final en **un solo turno** — **sin que tu código participe del loop**.

```
Tu código                              Anthropic
  │                                       │
  ├─ POST con tools:[web_search] ─────────▶
  │                                       │── internal: run query ──▶ Google/Brave
  │                                       │◀── results ──────────────
  │                                       │
  │◀──── respuesta final con citations ───┤
  │                                       │
```

**Implicación de arquitectura**: no hay loop, no hay `tool_result` que devolver. El response ya contiene la respuesta con citations.

### La forma del request

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "tools": [{
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 3
  }],
  "messages": [
    {"role": "user", "content": "¿Cuál es la última versión estable de Python 3?"}
  ]
}
```

<terminology>

**`type: "web_search_20250305"`**: versión de la server-side tool. El `_20250305` es el date de release — usalo tal cual.

**`name: "web_search"`**: nombre fijo; el modelo lo invoca con ese nombre.

**`max_uses`**: tope de búsquedas por turno. Limita costo y latencia. Default: ilimitado dentro de `max_tokens`; sea explícito (3-5 típico).

</terminology>

### La forma del response — 4 content blocks

Cuando web_search se usa, el response trae varios content blocks en orden:

1. **`type: "text"`** — razonamiento preliminar del modelo ("voy a buscar…").
2. **`type: "server_tool_use"`** — la query que Claude decidió buscar. Tiene `id`, `name: "web_search"`, `input: {query: "..."}`.
3. **`type: "web_search_tool_result"`** — los resultados. Lista de `{title, url, page_age, encrypted_content}`.
4. **`type: "text"`** con citations — la respuesta final, con bloques `citations[]` que apuntan a los resultados consultados.

**`stop_reason: "end_turn"`**, no `"tool_use"`. Todo ocurrió dentro del mismo turno del modelo.

### Citations de web_search

Los bloques `text` finales tienen `citations[]` con entries del tipo:

```json
{
  "type": "web_search_result_location",
  "url": "https://www.python.org/downloads/",
  "title": "Python.org — Python 3.14.4 release",
  "encrypted_index": "abc123...",
  "cited_text": "Python 3.14.4 was released on April 7, 2026"
}
```

Estas citations son **verificables**: el usuario puede hacer click en la URL y confirmar. Es el patrón canónico para respuestas con respaldo factual.

### Parámetros opcionales

- **`max_uses`**: `integer` — tope de invocaciones (def. ilimitado).
- **`allowed_domains`**: `string[]` — restringir búsqueda a dominios específicos (ej. `["docs.python.org", "python.org"]`).
- **`blocked_domains`**: `string[]` — excluir dominios.
- **`user_location`**: `{type: "approximate", city, region, country, timezone}` — contextualizar resultados por geografía.

**Nota**: `allowed_domains` y `blocked_domains` son mutuamente excluyentes por request.

### Costo

`web_search` cuenta tokens extra por los resultados inyectados al contexto del modelo (a menudo 5-20k input_tokens por búsqueda — ver la ejecución real debajo). Si tu use case no requiere web actualizada, **no prendas la tool**.

## Ejecución real

**Request:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 512,
    "tools": [{
      "type": "web_search_20250305",
      "name": "web_search",
      "max_uses": 2
    }],
    "messages": [
      {"role": "user", "content": "¿Cuál es la última versión estable de Python 3?"}
    ]
  }'
```

Respuesta real (abreviada):
```json
{
  "content": [
    {
      "type": "text",
      "text": "Voy a buscar información actualizada sobre la última versión estable de Python 3."
    },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_01...",
      "name": "web_search",
      "input": { "query": "latest stable Python 3 version 2026" }
    },
    {
      "type": "web_search_tool_result",
      "tool_use_id": "srvtoolu_01...",
      "content": [
        {
          "type": "web_search_result",
          "url": "https://www.python.org/downloads/",
          "title": "Download Python | Python.org",
          "page_age": "2 days",
          "encrypted_content": "..."
        },
        { "...": "9 resultados más" }
      ]
    },
    {
      "type": "text",
      "text": "The latest stable version of Python 3 is 3.14.4, released on April 7, 2026.",
      "citations": [{
        "type": "web_search_result_location",
        "url": "https://www.python.org/downloads/",
        "title": "Download Python | Python.org",
        "encrypted_index": "...",
        "cited_text": "Python 3.14.4 - April 7, 2026"
      }]
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 16249,
    "output_tokens": 157,
    "server_tool_use": { "web_search_requests": 1 }
  }
}
```

Observá:
- `stop_reason: "end_turn"` — no hubo loop cliente.
- `usage.server_tool_use.web_search_requests: 1` — te facturan por búsqueda.
- `input_tokens: 16249` — los resultados se inyectaron al contexto (por eso cobra tanto).
- La respuesta final tiene `citations[]` con `web_search_result_location` — apuntan a la URL y al snippet exacto.

**TypeScript:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 512,
  tools: [{
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 2,
  } as any],
  messages: [
    { role: "user", content: "¿Cuál es la última versión estable de Python 3?" },
  ],
});

for (const block of resp.content) {
  if (block.type === "text") {
    console.log("TEXT:", (block as any).text);
    const cits = (block as any).citations;
    if (cits) {
      for (const c of cits) {
        console.log(`  → [${c.title}](${c.url})`);
        console.log(`    "${c.cited_text}"`);
      }
    }
  } else if (block.type === "server_tool_use") {
    console.log("SEARCH:", (block as any).input.query);
  } else if (block.type === "web_search_tool_result") {
    const results = (block as any).content;
    console.log(`RESULTS: ${results.length} links`);
  }
}
```

Output:
```
TEXT: Voy a buscar información actualizada sobre la última versión estable de Python 3.
SEARCH: latest stable Python 3 version 2026
RESULTS: 10 links
TEXT: The latest stable version of Python 3 is 3.14.4, released on April 7, 2026.
  → [Download Python | Python.org](https://www.python.org/downloads/)
    "Python 3.14.4 - April 7, 2026"
```

**Con `allowed_domains`:**

```json
{
  "type": "web_search_20250305",
  "name": "web_search",
  "max_uses": 3,
  "allowed_domains": ["docs.python.org", "python.org"]
}
```

Útil para enterprise: "búsqueda en knowledge base propia" o "solo documentación oficial".

## Anti-patterns

- ❌ **Usar `web_search` cuando tu modelo no necesita información reciente**. Inyecta 5-20k tokens por búsqueda; si la respuesta ya está en conocimiento del modelo, no prendas la tool.
- ❌ **No setear `max_uses`**. Sin límite, en preguntas complejas puede hacer 5-10 búsquedas. Costo + latencia crecen. Setea `max_uses: 3` o `5`.
- ❌ **Mezclar `allowed_domains` y `blocked_domains` en el mismo request**. Son mutuamente excluyentes; la API rechaza.
- ❌ **Parsear el `encrypted_content` de los resultados**. Es opaco — el modelo lo usa, vos no. Tu lado solo lee `title`, `url`, `page_age` y las citations del texto final.
- ❌ **Ignorar `citations`**. El valor principal de `web_search` es la citation verificable. Mostrala en tu UI — es lo que diferencia respuestas fundamentadas de alucinaciones.
- ❌ **Asumir que `stop_reason: "tool_use"` aparece**. No. Con server-side tools el stop_reason final es `end_turn`. Tu loop de cliente NO ve `"tool_use"` para web_search.

## Recap

- `web_search_20250305` es una **server-side tool**: Anthropic la ejecuta, vos no corrés runtime loop.
- El response trae 4 tipos de blocks: `text` → `server_tool_use` → `web_search_tool_result` → `text` con `citations`.
- `stop_reason: "end_turn"` (no `"tool_use"`). Un solo response devuelve todo.
- Las citations `web_search_result_location` son verificables — url + cited_text.
- Parámetros clave: `max_uses`, `allowed_domains`, `blocked_domains`, `user_location`.
- Facturación: cuenta tokens de los resultados inyectados + `server_tool_use.web_search_requests`.

---

**Fuente oficial:** [platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
**Ejercicio:** <!-- exercise:ex-05-05-web-search -->
