# PDFs: el bloque document

## Objetivo

Al terminar esta lección sabrás **cómo mandar un PDF completo a Claude** usando el bloque `type: "document"`, qué hace el modelo con páginas vs texto extraído, cuánto cuesta en tokens, y cuándo conviene PDF vs extraer el texto vos primero.

## Concepto

### El bloque document

Para enviar un PDF, usás un bloque `type: "document"`:

```json
{
  "type": "document",
  "source": {
    "type": "base64",
    "media_type": "application/pdf",
    "data": "JVBERi0xLjQK..."
  },
  "title": "Informe trimestral Q1 2025",
  "citations": { "enabled": false }
}
```

<terminology>

**source.type**: tres opciones — `"base64"` (PDF embebido), `"text"` (plain text embebido), o `"file"` (referencia a Files API).

**source.media_type**: `"application/pdf"` para PDFs, `"text/plain"` para texto plano.

**title**: opcional pero recomendado. Aparece en los objetos de citation como `document_title` — útil cuando enviás varios documentos y querés distinguir de cuál vino cada cita.

**citations.enabled**: si `true`, Claude devuelve citas estructuradas con page/char location. Si `false` u omitido, responde sin citas (más barato y rápido).

</terminology>

### Cómo procesa Claude un PDF

Internamente, Claude procesa cada página del PDF como:
1. **Una imagen** (para capturar layout, tablas, figuras).
2. **El texto extraído** (para capturas semánticas precisas).

Esto significa que **un PDF de 10 páginas consume tokens como 10 imágenes + el texto total**. Es más caro que enviar solo el texto extraído, pero conserva:
- Tablas con su estructura visual.
- Figuras, gráficos, diagramas.
- Layout de columnas (contratos, papers científicos).
- Texto en imágenes (escaneos, screenshots dentro del PDF).

### Cuándo PDF vs texto plano

| Caso | PDF (binario) | Texto extraído |
|---|---|---|
| Documento con tablas complejas | ✅ Conserva estructura | ❌ Se pierde layout |
| Paper con gráficos/figuras | ✅ Claude los ve | ❌ Solo texto |
| PDF escaneado (imagen de texto) | ✅ Claude hace OCR visual | ❌ Necesitás OCR externo |
| Documento solo texto (novela, blog) | ⚠️ Overhead innecesario | ✅ Mucho más barato |
| Archivo muy grande (>100 páginas) | ❌ Tokens explotan | ✅ Solo lo relevante |

**Regla**: si el documento tiene estructura visual relevante (tablas, figuras, layout), PDF. Si es solo texto, extraé y enviá como `text/plain`.

### Diferencia de tokens: PDF vs texto

Un PDF de 1 página con 100 palabras consume ~2000-3000 tokens (procesa la imagen de la página). El mismo texto como plain text consume ~150 tokens.

El trade-off: **10-20× más tokens por la capacidad de ver la estructura visual**.

## Ejecución real

**Paso 1 — Enviar un PDF con curl**

Usamos un PDF mínimo creado con Python (ver Módulo 0 para setup):

```bash
# Crear un PDF de prueba
python3 <<'EOF'
import base64
pdf = b'''%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 178 >>
stream
BT
/F1 12 Tf
72 720 Td
(Revenue Report Q1 2025) Tj
0 -20 Td
(Total revenue: USD 2.4M, up 15 percent from Q4 2024.) Tj
0 -20 Td
(Operating costs: USD 1.8M. Net margin improved from 18 to 25 percent.) Tj
0 -20 Td
(New enterprise clients: 47 companies joined.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000496 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
574
%%EOF'''
with open('/tmp/test-report.pdf', 'wb') as f:
    f.write(pdf)
print(base64.b64encode(pdf).decode())
EOF
```

Después, enviarlo:

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
          \"title\": \"Revenue Report Q1 2025\"
        },
        {
          \"type\": \"text\",
          \"text\": \"What was the total revenue and what was the change from Q4 2024?\"
        }
      ]
    }]
  }"
```

Respuesta:
```json
{
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {
      "type": "text",
      "text": "The total revenue in Q1 2025 was USD 2.4M, up 15 percent from Q4 2024."
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 2232,
    "output_tokens": 49
  }
}
```

Observá: **2232 input tokens para un PDF de 1 página con ~50 palabras**. Si enviaras el mismo texto como `text/plain`, serían ~100 tokens.

**Paso 2 — Plain text con el mismo bloque document**

Cuando tu documento es solo texto (sin estructura visual), usá `source.type: "text"`:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 200,
    "messages": [{
      "role": "user",
      "content": [
        {
          "type": "document",
          "source": {
            "type": "text",
            "media_type": "text/plain",
            "data": "Revenue Report Q1 2025. Total revenue: USD 2.4M, up 15 percent from Q4 2024. Operating costs: USD 1.8M. Net margin improved from 18 to 25 percent."
          },
          "title": "Revenue Report Q1 2025"
        },
        {
          "type": "text",
          "text": "What was the total revenue?"
        }
      ]
    }]
  }'
```

Con plain text, los tokens bajan de 2232 a ~100 — el trade-off es que perdés layout visual.

**Paso 3 — PDF via Files API (para archivos grandes o reusables)**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic();

// Upload once
const file = await client.beta.files.upload({
  file: new File(
    [readFileSync("/tmp/research-paper.pdf")],
    "paper.pdf",
    { type: "application/pdf" },
  ),
  purpose: "vision",
});

// Reference multiple times sin re-uploadear
const resp = await client.beta.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  betas: ["files-api-2025-04-14"],
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        source: { type: "file", file_id: file.id },
        title: "Research Paper on Vision Transformers",
      },
      {
        type: "text",
        text: "What is the main contribution of this paper? Summarize in 3 bullets.",
      },
    ],
  }],
});
```

## Anti-patterns

- ❌ **Enviar PDFs de texto puro como PDF**. Si tu documento es solo párrafos de texto (un blog export, una novela), extraé el texto y enviá como `text/plain`. 20× más barato.
- ❌ **No poner `title` cuando enviás múltiples documentos**. Sin título, las citations usan `document_index` (0, 1, 2...) y es imposible saber qué documento es cuál.
- ❌ **Asumir que el PDF viaja completo**. Hay límites de tamaño (verificá docs actuales). PDFs muy grandes fallarán — partí en secciones o usá Files API.
- ❌ **Olvidar `citations.enabled: true` cuando querés citas**. Sin esto, Claude responde con texto plano sin referencias a página. Para respuestas verificables, siempre activalo (siguiente lección).
- ❌ **Usar PDF para hacer búsqueda por keyword**. Si necesitás buscar "todas las menciones de X" en un corpus grande, usá un search index, no pases todo el PDF al modelo.

## Recap

- El bloque `type: "document"` acepta PDF (`application/pdf`), texto plano (`text/plain`), o referencia a Files API.
- Los PDFs se procesan como **imagen + texto por página** — conservan layout pero cuestan más tokens.
- **1 página de PDF ≈ 2000-3000 tokens**; el mismo texto plano ≈ 100-300 tokens.
- `title` es opcional pero crítico al usar múltiples documentos o citations.
- **Regla**: estructura visual importa → PDF. Solo texto → plain text.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/pdf-support](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
**Ejercicio:** Sin ejercicio propio — cubierto junto con citations en ex-04-04.
