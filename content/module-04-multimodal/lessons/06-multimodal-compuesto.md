# Multimodal compuesto: imagen + texto + PDF

## Objetivo

Al terminar esta lección sabrás **cómo combinar múltiples modalidades en una sola llamada** a Claude — imágenes, PDFs, plain text, y pregunta de texto todos en el mismo `content` array. Vas a entender el orden recomendado, cómo gestionar el budget de tokens, y los patrones de composición más comunes.

## Concepto

### El content array es heterogéneo

Ya viste que `content` acepta un array de bloques. Hasta ahora usaste imagen+texto o documento+texto. Pero **podés mezclar todos los tipos en una sola llamada**:

```json
"content": [
  { "type": "image", "source": { ... } },
  { "type": "document", "source": { ... }, "citations": { "enabled": true } },
  { "type": "document", "source": { ... } },
  { "type": "text", "text": "Pregunta final..." }
]
```

Esto es multimodal compuesto: una llamada procesa múltiples fuentes de información y genera una respuesta unificada.

### Orden recomendado

No hay orden obligatorio, pero esta heurística funciona bien:

```
1. Documentos (PDFs, plain text) — "el material de referencia"
2. Imágenes — "lo que querés que vea específicamente"
3. Texto de instrucción/pregunta — al final
```

<terminology>

**Por qué en este orden**: Claude lee los bloques en secuencia. Si ponés la pregunta primero, el modelo aún no tiene el contexto (documentos + imágenes). Al ponerla al final, el modelo llega a la pregunta ya habiendo "procesado" todo el material.

**Excepción**: si tu prompt tiene instrucciones muy específicas sobre cómo leer los documentos, podés poner una breve instrucción al principio y la pregunta concreta al final — es el mismo patrón de "pre-instrucción + material + post-pregunta" que usás en documentos largos.

</terminology>

### Casos de uso típicos

**1. Comparar imagen con documento**
```
[image: screenshot de UI actual]
[document: design spec en PDF]
[text: "¿Qué diferencias hay entre la UI y el spec?"]
```

**2. Cruzar información entre múltiples PDFs**
```
[document: paper_1.pdf con citations]
[document: paper_2.pdf con citations]
[text: "¿Qué coinciden y qué contradicen los dos papers sobre X?"]
```

**3. Analizar gráfico + contexto textual**
```
[document: informe anual en texto plano]
[image: screenshot del gráfico de ventas del informe]
[text: "Basado en el informe y el gráfico, ¿cuál fue la tendencia?"]
```

**4. Multi-documento con citations**
```
[document: regulación_A.pdf title:"Regulación A" citations:enabled]
[document: regulación_B.pdf title:"Regulación B" citations:enabled]
[text: "¿La propuesta X cumple ambas regulaciones? Cita cada requerimiento."]
```

Las citas incluyen `document_title`, así la UI puede agrupar citas por documento.

### Budget de tokens

Cada modalidad consume tokens — sumalos antes de armar un request pesado:

| Componente | Tokens típicos |
|---|---|
| Imagen 800×600 | ~1,000 |
| Imagen HD | ~1,500-2,500 |
| PDF de 1 página | ~2,000-3,000 |
| PDF de 10 páginas | ~20,000-30,000 |
| Texto plano (por página ~500 palabras) | ~700 |
| Pregunta (50 palabras) | ~70 |

Un request con 2 imágenes + PDF de 5 páginas + pregunta: ~15,000-20,000 input tokens. Para contexto, claude-sonnet-4-6 maneja hasta 200K tokens por default (1M con beta `context-1m-2025-08-07`).

<warning>

**Regla de composición**: antes de armar un request multimodal grande, preguntate "¿puedo resolver esto con menos contexto?" A veces un resumen en texto del PDF basta en vez del PDF entero. Menos tokens = menos costo, menos latencia, mejor foco del modelo.

</warning>

### Patrones de composición que fallan (y sus fixes)

| Anti-patrón | Qué pasa | Fix |
|-------------|----------|-----|
| Pregunta antes que documentos | El modelo no tiene contexto al procesar la pregunta | Pregunta siempre al final |
| 5 PDFs sin `title` | Citations con `document_index` pelados, ininterpretables | `title` obligatorio con ≥2 docs |
| Imagen **dentro** del PDF + la imagen suelta | Duplicás tokens visuales de la misma cosa | Elegí uno: o el PDF o la imagen suelta |
| Texto largo pegado como `type: "text"` | El modelo puede perder atención a la mitad | Envolvelo en `type: "document"` con `source.type: "text"` (+ citations si querés trazabilidad) |
| Instrucción larga + pregunta concreta mezcladas | El modelo responde a la instrucción, no a la pregunta | Partí: system prompt (instrucción) + user con pregunta al final |

### Conceptos de arquitecto

- **El request multimodal es un prompt con "anexos"**: pensalo como un email. El body (pregunta) va corto y claro; los anexos (documentos + imágenes) van antes. Nadie lee un email que arranca "aquí va mi pregunta" con 10 adjuntos abajo — el modelo tampoco.
- **Presupuestá en tokens antes de enviar**: un request con 3 PDFs + 2 imágenes + pregunta puede sumar 30-50k tokens fácilmente. Con Sonnet a los precios actuales, cada request es ~$0.10-$0.15. Si lo corrés 10k veces/día, son $1.5k/día. Priorizá reducir tokens antes de optimizar prompts.
- **Multimodal compuesto + Files API + caching es la tríada de RAG-light**: subís los PDFs una vez, los referenciás por `file_id`, activás `cache_control` en el bloque donde matchean — próximas consultas pagan ~10% del input. Ese patrón aguanta cientos de queries por día sobre corpus de 20-50 docs sin montar vector store.

## Ejecución real

**Paso 1 — Imagen + documento + pregunta**

Supongamos que tenés un screenshot de un dashboard y un informe que lo explica:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic();

const screenshotB64 = readFileSync("/tmp/dashboard.png").toString("base64");
const reportText = readFileSync("/tmp/report.txt", "utf-8");

const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 800,
  messages: [{
    role: "user",
    content: [
      // 1. Documento primero (contexto)
      {
        type: "document",
        source: {
          type: "text",
          media_type: "text/plain",
          data: reportText,
        },
        title: "Q1 Revenue Report",
        citations: { enabled: true },
      },
      // 2. Imagen después (lo que querés que vea)
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: screenshotB64,
        },
      },
      // 3. Pregunta al final
      {
        type: "text",
        text: "El screenshot es el dashboard actual. Según el informe, ¿qué número del dashboard está desalineado con lo reportado? Cita el informe.",
      },
    ],
  }],
});

// Parsear respuesta
for (const block of resp.content) {
  if (block.type === "text") {
    console.log(block.text);
    if ("citations" in block && block.citations) {
      console.log("  Citations:", block.citations);
    }
  }
}

console.log(`\nTokens: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
```

**Paso 2 — Múltiples documentos con citations**

```typescript
const paper1 = readFileSync("/tmp/paper1.txt", "utf-8");
const paper2 = readFileSync("/tmp/paper2.txt", "utf-8");

const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1500,
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: paper1 },
        title: "Paper A: Transformer Architecture",
        citations: { enabled: true },
      },
      {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: paper2 },
        title: "Paper B: Attention Mechanisms",
        citations: { enabled: true },
      },
      {
        type: "text",
        text: "Comparar los enfoques de attention de ambos papers. Citar afirmaciones específicas de cada uno.",
      },
    ],
  }],
});

// Agrupar citas por documento
const citationsByDoc: Record<string, string[]> = {};

for (const block of resp.content) {
  if (block.type !== "text") continue;
  console.log(block.text);

  if ("citations" in block && block.citations) {
    for (const cite of block.citations) {
      const title = cite.document_title || `doc-${cite.document_index}`;
      if (!citationsByDoc[title]) citationsByDoc[title] = [];
      if (cite.type === "char_location") {
        citationsByDoc[title].push(
          `chars ${cite.start_char_index}-${cite.end_char_index}: "${cite.cited_text.trim()}"`,
        );
      }
    }
  }
}

console.log("\n--- Citas por documento ---");
for (const [doc, cites] of Object.entries(citationsByDoc)) {
  console.log(`\n## ${doc}`);
  cites.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
}
```

**Paso 3 — Imagen + PDF via Files API**

Para archivos recurrentes, Files API es ideal:

```typescript
// Subir PDF una vez
const pdfFile = await client.beta.files.upload({
  file: new File(
    [readFileSync("/tmp/contract.pdf")],
    "contract.pdf",
    { type: "application/pdf" },
  ),
  purpose: "vision",
});

// Enviar con imagen + PDF referenciado
const resp = await client.beta.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  betas: ["files-api-2025-04-14"],
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        source: { type: "file", file_id: pdfFile.id },
        title: "Service Agreement",
        citations: { enabled: true },
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: readFileSync("/tmp/signature.png").toString("base64"),
        },
      },
      {
        type: "text",
        text: "¿La firma en la imagen coincide con el nombre del firmante en el contrato?",
      },
    ],
  }],
});

await client.beta.files.delete(pdfFile.id);
```

## Anti-patterns

- ❌ **Poner la pregunta al principio del array**. El modelo llega a la pregunta sin haber "leído" los documentos. Siempre pregunta al final.
- ❌ **Mezclar docs con y sin `citations.enabled`**. Si querés citas, activá en todos los documentos. Sino la respuesta citará unos y otros no — confuso.
- ❌ **Enviar imágenes redundantes con el PDF**. Si el PDF ya contiene el gráfico, no mandes el gráfico por separado. Duplicás tokens.
- ❌ **No ponerle título a los documentos**. Con múltiples docs es imposible distinguir las citas sin `document_title`. Obligatorio cuando hay ≥2 documentos.
- ❌ **Requests multimodales gigantes "por si acaso"**. Más modalidades = más tokens = más costo. Incluí solo lo que realmente necesitás para responder.
- ❌ **Pasar la misma imagen dos veces (base64 y dentro del PDF)**. Dobla los tokens visuales de ese elemento. Si ya está en el PDF, no lo mandes suelto.
- ❌ **Hacer 10 requests paralelos con los mismos documentos sin caching**. Estás pagando N veces el procesamiento del mismo material. Activá `cache_control: {type: "ephemeral"}` en los bloques de documento del Módulo 6 y bajá ~90% el costo a partir del segundo request.

## Recap

- El array `content` es heterogéneo: podés mezclar image, document, y text en una sola llamada.
- **Orden recomendado**: documentos → imágenes → pregunta de texto al final.
- Los tokens suman — un request multimodal grande puede consumir decenas de miles de tokens.
- **Title obligatorio** cuando usás múltiples documentos con citations.
- Files API + multimodal funciona: referenciás PDFs por `file_id` y seguís pudiendo mezclar con imágenes base64 o URL.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/overview](https://platform.claude.com/docs/en/build-with-claude/overview)
**Ejercicio:** <!-- exercise:ex-04-05-lab-extraction -->
