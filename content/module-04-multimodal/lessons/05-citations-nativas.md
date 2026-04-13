# Citations nativas

## Objetivo

Al terminar esta lección sabrás **cómo activar citations nativas con `citations.enabled: true`**, cómo parsear los 4 tipos de citation location (`char_location`, `page_location`, `content_block_location`, `search_result_location`), y cómo renderizar las citas como referencias verificables en tu UI.

## Concepto

### Por qué citations

Cuando le pedís a Claude que responda sobre un documento, hay dos modos posibles:

**Sin citations** (modo default):
```
P: ¿Cuál fue el revenue?
R: El revenue del Q1 fue USD 2.4M, un aumento del 15% vs Q4.
```

El problema: **no sabés si esa respuesta está en el documento o si Claude la inventó**. La alucinación existe y es verificable solo manualmente.

**Con citations**:
```
P: ¿Cuál fue el revenue?
R: [TextBlock con citations]
   text: "El revenue del Q1 fue USD 2.4M, un aumento del 15% vs Q4."
   citations: [{
     type: "page_location",
     cited_text: "Total revenue: USD 2.4M, up 15 percent from Q4 2024.",
     document_title: "Revenue Report Q1 2025",
     start_page_number: 1,
     end_page_number: 1
   }]
```

Ahora tenés **la cita exacta del documento que respalda cada afirmación**. Convierte la alucinación de "invisible" a "falsificable": si la cita no existe en el documento o no dice lo que el modelo afirmó, tenés evidencia concreta.

### Activar citations

Se activa en el bloque del documento:

```json
{
  "type": "document",
  "source": { ... },
  "title": "Revenue Report Q1 2025",
  "citations": { "enabled": true }
}
```

<terminology>

**Obligatorio**: `citations.enabled: true` en cada documento del que querés citas. Omitido o `false` → no hay citas.

**Efecto**: los `content` blocks de tipo `text` en la respuesta incluyen un array `citations` con las referencias usadas para cada porción de texto generado.

</terminology>

### Los 4 tipos de citation location

El tipo de citation depende del documento:

| Tipo | Documento | Campos clave |
|---|---|---|
| `char_location` | Plain text | `start_char_index`, `end_char_index` |
| `page_location` | PDF | `start_page_number`, `end_page_number` |
| `content_block_location` | Content blocks | `start_block_index`, `end_block_index` |
| `search_result_location` | Search results (tool) | `search_result_index`, `start_block_index`, `end_block_index` |

Todos incluyen además:
- `cited_text`: el fragmento exacto del documento citado.
- `document_index`: posición del documento en el array de sources (0 si solo hay uno).
- `document_title`: el `title` que pusiste al documento (útil con múltiples docs).

### Anatomía de la respuesta

Cuando citations está activado, los `content` blocks de tipo `text` cambian:

```json
{
  "content": [
    {
      "type": "text",
      "text": "El revenue total fue USD 2.4M.",
      "citations": [
        {
          "type": "page_location",
          "cited_text": "Total revenue: USD 2.4M, up 15 percent from Q4 2024.",
          "document_index": 0,
          "document_title": "Revenue Report Q1 2025",
          "start_page_number": 1,
          "end_page_number": 1
        }
      ]
    }
  ]
}
```

Claude puede devolver **varios bloques de texto**, cada uno con sus propias citas. Esto es porque intercala texto generado con referencias fuente — podés renderizarlo como texto con footnotes o inline links.

## Ejecución real

**Paso 1 — Citations con plain text (char_location)**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 400,
    "messages": [{
      "role": "user",
      "content": [
        {
          "type": "document",
          "source": {
            "type": "text",
            "media_type": "text/plain",
            "data": "Anthropic was founded in 2021 by Dario Amodei and Daniela Amodei. The company is based in San Francisco. Claude is their flagship AI assistant. Claude 4.5 was released in 2025 with improved reasoning capabilities."
          },
          "title": "About Anthropic",
          "citations": {"enabled": true}
        },
        {
          "type": "text",
          "text": "What year was Anthropic founded and who founded it? Cite your sources."
        }
      ]
    }]
  }'
```

Respuesta:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Anthropic was founded in 2021 by Dario Amodei and Daniela Amodei.",
      "citations": [
        {
          "type": "char_location",
          "cited_text": "Anthropic was founded in 2021 by Dario Amodei and Daniela Amodei. ",
          "document_index": 0,
          "document_title": "About Anthropic",
          "start_char_index": 0,
          "end_char_index": 66
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 681,
    "output_tokens": 46
  }
}
```

Con plain text, citations usa `char_location` con índices de caracteres exactos (0 a 66).

**Paso 2 — Citations con PDF (page_location)**

Mismo PDF de la lección anterior:

```bash
PDF_B64=$(base64 -i /tmp/test-report.pdf)

curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "{
    \"model\": \"claude-haiku-4-5\",
    \"max_tokens\": 400,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": [
        {
          \"type\": \"document\",
          \"source\": {
            \"type\": \"base64\",
            \"media_type\": \"application/pdf\",
            \"data\": \"$PDF_B64\"
          },
          \"title\": \"Revenue Report Q1 2025\",
          \"citations\": {\"enabled\": true}
        },
        {
          \"type\": \"text\",
          \"text\": \"What was the total revenue? Cite the source.\"
        }
      ]
    }]
  }"
```

Respuesta (real):
```json
{
  "content": [
    {
      "type": "text",
      "text": "The total revenue in Q1 2025 was USD 2.4M, up 15 percent from Q4 2024.",
      "citations": [
        {
          "type": "page_location",
          "cited_text": "Revenue Report Q1 2025\r\nTotal revenue: USD 2.4M, up 15 percent from Q4 2024.\r\n",
          "document_index": 0,
          "document_title": "Revenue Report Q1 2025",
          "start_page_number": 1,
          "end_page_number": 2
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 2232,
    "output_tokens": 49
  }
}
```

Con PDFs, citations usa `page_location` con números de página.

**Paso 3 — Parsear y renderizar citations en TypeScript**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 500,
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        source: {
          type: "text",
          media_type: "text/plain",
          data: "Anthropic was founded in 2021 by Dario Amodei and Daniela Amodei.",
        },
        title: "About Anthropic",
        citations: { enabled: true },
      },
      {
        type: "text",
        text: "When was Anthropic founded?",
      },
    ],
  }],
});

// Renderizar texto + citas como markdown con footnotes
let markdown = "";
let footnoteIdx = 1;
const footnotes: string[] = [];

for (const block of resp.content) {
  if (block.type !== "text") continue;
  markdown += block.text;

  if ("citations" in block && block.citations && block.citations.length > 0) {
    for (const cite of block.citations) {
      markdown += `[^${footnoteIdx}]`;
      if (cite.type === "char_location") {
        footnotes.push(
          `[^${footnoteIdx}]: ${cite.document_title} (chars ${cite.start_char_index}-${cite.end_char_index}): "${cite.cited_text.trim()}"`,
        );
      } else if (cite.type === "page_location") {
        footnotes.push(
          `[^${footnoteIdx}]: ${cite.document_title} (p. ${cite.start_page_number}): "${cite.cited_text.trim()}"`,
        );
      }
      footnoteIdx++;
    }
  }
}

console.log(markdown);
console.log("\n---\n");
console.log(footnotes.join("\n"));
```

Output esperado:
```
Anthropic was founded in 2021 by Dario Amodei and Daniela Amodei.[^1]

---

[^1]: About Anthropic (chars 0-66): "Anthropic was founded in 2021 by Dario Amodei and Daniela Amodei."
```

## Anti-patterns

- ❌ **Creer que citations elimina la alucinación**. No la elimina — la hace **verificable**. El modelo puede citar incorrectamente (muy raro) o seleccionar una cita no óptima. Citations es una herramienta de verificación, no una garantía.
- ❌ **Activar citations sin parsear las citas en la UI**. Si pediste citations, mostralas al usuario — sino estás pagando tokens extra sin beneficio.
- ❌ **Usar citations para documentos triviales**. Para un chat casual no las necesitás. Úsalo cuando el usuario debe verificar la respuesta (legal, médico, financiero, research).
- ❌ **Ignorar `document_title`**. Cuando tenés múltiples documentos, el título es la única forma human-readable de saber de cuál vino la cita.
- ❌ **Asumir que todas las afirmaciones llevan citation**. Claude cita cuando el texto se apoya en el documento. Frases de transición o resúmenes pueden no tener citation asociada.

## Recap

- `citations: { enabled: true }` en el bloque `document` activa citas nativas.
- 4 tipos de citation location: `char_location` (plain text), `page_location` (PDF), `content_block_location` (content blocks), `search_result_location` (tool search).
- Cada cita incluye `cited_text`, `document_index`, `document_title`, y los índices específicos del tipo.
- La respuesta tiene múltiples bloques de texto, cada uno con su propio array `citations`.
- Citations **convierte alucinación en falsificable** — no la elimina.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/citations](https://platform.claude.com/docs/en/build-with-claude/citations)
**Ejercicio:** <!-- exercise:ex-04-04-citations -->
