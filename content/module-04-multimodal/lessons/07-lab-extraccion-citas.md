# Lab: pipeline de extracción con citas

## Objetivo

Al terminar este lab habrás construido **un pipeline end-to-end** que sube múltiples documentos a Files API, hace preguntas que cruzan información entre ellos, obtiene respuestas con citations nativas, y renderiza el resultado como markdown con footnotes verificables. Es el patrón base de un mini-RAG verificable.

## Concepto

### El problema del RAG clásico

En un RAG tradicional armás tu propio pipeline:

```
1. Chunking: partir documentos en fragmentos
2. Embeddings: generar vectores por chunk
3. Vector store: indexar para búsqueda semántica
4. Retrieval: buscar los top-k chunks relevantes
5. Generation: pasarle los chunks al modelo con la pregunta
```

Es potente pero complejo: tenés que elegir chunking strategy, embedding model, vector DB, tuning, etc. Y las "citas" que devolvés son los chunks que le pasaste — no un fragmento preciso que el modelo realmente usó.

### El patrón "long context + citations"

Claude 4.x tiene context window grande (200K por default, 1M beta). Esto habilita un approach simpler:

```
1. Subir documentos completos (Files API o embebidos)
2. Pasarlos todos en una sola llamada con citations.enabled
3. Hacer la pregunta
4. Claude cita fragmentos precisos — no chunks artificiales
```

**Trade-offs**:

| Aspecto | RAG clásico | Long context + citations |
|---|---|---|
| Tamaño de corpus | Ilimitado (vector DB) | Limitado al context window |
| Precisión de citas | Chunk completo | Fragmento exacto que el modelo usó |
| Complejidad | Alta (pipeline custom) | Baja (una API call) |
| Costo por query | Bajo (solo top-k chunks) | Alto (todo el contexto cada vez) |
| Prompt caching | Manual | Automático (con `cache_control`) |

**Regla práctica**: para corpus chicos-medianos (≤ 10-20 documentos, total ≤ 100K tokens), long context + citations. Para corpus grandes, RAG clásico — o combinar ambos (retrieval + citations).

### Arquitectura del lab

Este lab construye el pipeline mínimo:

```
[3 PDFs/textos locales]
        ↓
   Files API upload
        ↓
[3 file_ids]
        ↓
messages.create con:
  - 3 document blocks (file_id, citations enabled)
  - 1 text block con la pregunta
        ↓
[respuesta con texto + citations]
        ↓
Parser: texto + footnotes
        ↓
[markdown renderizable]
        ↓
   cleanup (delete files)
```

## Ejecución real

**Paso 1 — Preparar 3 documentos de prueba**

```typescript
import { writeFileSync } from "node:fs";

// Doc 1: Paper sobre transformers
writeFileSync("/tmp/paper1.txt", `
Attention Is All You Need (Vaswani et al., 2017)

The Transformer architecture relies entirely on attention mechanisms,
dispensing with recurrence and convolutions. The model uses multi-head
self-attention with 8 heads in the base configuration. Training was done
on 8 NVIDIA P100 GPUs for 12 hours.

Key results: 28.4 BLEU on WMT 2014 English-to-German, and 41.8 BLEU on
WMT 2014 English-to-French, both state-of-the-art at publication.

The encoder stack has 6 identical layers. Each layer has two sub-layers:
multi-head self-attention, and a position-wise feed-forward network.
`);

// Doc 2: Paper sobre scaling
writeFileSync("/tmp/paper2.txt", `
Scaling Laws for Neural Language Models (Kaplan et al., 2020)

Performance of language models scales as a power law with model size,
dataset size, and compute. The three factors are not independent —
optimal compute allocation requires balancing all three.

For a fixed compute budget, the optimal model size grows slowly with
compute (approximately C^0.73), while training tokens grow more slowly
(C^0.27). This informs decisions like "should I train a bigger model
or train longer?"

The study used decoder-only transformer architectures similar to GPT-2,
ranging from 768 to 1.5B parameters.
`);

// Doc 3: Paper sobre instruction tuning
writeFileSync("/tmp/paper3.txt", `
Training Language Models to Follow Instructions (Ouyang et al., 2022)

InstructGPT was trained using reinforcement learning from human feedback
(RLHF). The process has three phases: supervised fine-tuning on
demonstration data, reward model training on human preference data, and
PPO optimization against the reward model.

Human evaluators preferred InstructGPT outputs over GPT-3 baseline 85%
of the time in head-to-head comparisons, despite InstructGPT being 100x
smaller (1.3B vs 175B parameters).

The paper found that instruction tuning significantly reduces toxic
outputs and improves truthfulness, at a small cost to traditional NLP
benchmarks.
`);
```

**Paso 2 — El pipeline completo**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic();

// Helper para extraer texto y formatear citas
function renderResponseAsMarkdown(resp: any): string {
  let body = "";
  const footnotes: string[] = [];
  let idx = 1;

  for (const block of resp.content) {
    if (block.type !== "text") continue;
    body += block.text;

    if (block.citations && block.citations.length > 0) {
      for (const cite of block.citations) {
        body += `[^${idx}]`;
        const title = cite.document_title || `doc-${cite.document_index}`;
        const snippet = cite.cited_text.trim().slice(0, 120);
        if (cite.type === "char_location") {
          footnotes.push(
            `[^${idx}]: **${title}** (chars ${cite.start_char_index}-${cite.end_char_index}): "${snippet}..."`,
          );
        } else if (cite.type === "page_location") {
          footnotes.push(
            `[^${idx}]: **${title}** (p. ${cite.start_page_number}): "${snippet}..."`,
          );
        }
        idx++;
      }
    }
  }

  return body + "\n\n---\n\n" + footnotes.join("\n");
}

// 1. Upload los 3 documentos
const files = [];
for (const path of ["/tmp/paper1.txt", "/tmp/paper2.txt", "/tmp/paper3.txt"]) {
  const f = await client.beta.files.upload({
    file: new File(
      [readFileSync(path)],
      path.split("/").pop()!,
      { type: "text/plain" },
    ),
    purpose: "vision",
  });
  files.push(f);
  console.log(`Uploaded: ${f.id} (${path.split("/").pop()})`);
}

// 2. Llamada multimodal con citations
const titles = [
  "Attention Is All You Need (2017)",
  "Scaling Laws (2020)",
  "InstructGPT (2022)",
];

const resp = await client.beta.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1500,
  betas: ["files-api-2025-04-14"],
  messages: [{
    role: "user",
    content: [
      ...files.map((f, i) => ({
        type: "document" as const,
        source: { type: "file" as const, file_id: f.id },
        title: titles[i],
        citations: { enabled: true },
      })),
      {
        type: "text",
        text: `Basado SOLO en los 3 papers, responde:

1. ¿Cuál fue la arquitectura base introducida en el primer paper, y cuántas capas tiene su encoder?
2. Según el segundo paper, ¿cómo crece el tamaño óptimo del modelo con el compute?
3. ¿Qué ventaja concreta mostró InstructGPT sobre GPT-3 según el tercer paper?

Cita cada afirmación con referencia al paper específico.`,
      },
    ],
  }],
});

// 3. Renderizar con footnotes
const markdown = renderResponseAsMarkdown(resp);
console.log("\n=== RESPUESTA ===\n");
console.log(markdown);
console.log(`\n[Tokens: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}]`);

// 4. Cleanup
for (const f of files) {
  await client.beta.files.delete(f.id);
}
console.log(`\nCleaned up ${files.length} files.`);
```

**Output esperado** (ejemplo):
```markdown
La arquitectura introducida es el Transformer, que depende enteramente de
mecanismos de attention.[^1] El encoder stack tiene 6 capas idénticas.[^2]

Según Scaling Laws, el tamaño óptimo del modelo crece como C^0.73 donde C
es el compute.[^3]

InstructGPT fue preferido por evaluadores humanos 85% de las veces sobre
GPT-3, a pesar de ser 100x más chico (1.3B vs 175B parámetros).[^4]

---

[^1]: **Attention Is All You Need (2017)** (chars 52-178): "The Transformer architecture relies entirely on attention mechanisms, dispensing with recurrence and convolutions..."
[^2]: **Attention Is All You Need (2017)** (chars 380-420): "The encoder stack has 6 identical layers..."
[^3]: **Scaling Laws (2020)** (chars 220-340): "optimal compute allocation requires... the optimal model size grows slowly with compute (approximately C^0.73)..."
[^4]: **InstructGPT (2022)** (chars 310-450): "Human evaluators preferred InstructGPT outputs over GPT-3 baseline 85% of the time... despite InstructGPT being 100x smaller..."
```

### Extensiones sugeridas

Una vez que el pipeline base funciona, podés extenderlo:

1. **PDFs reales**: reemplazá los `.txt` por PDFs de research papers (Semantic Scholar, ArXiv).
2. **Prompt caching**: agregá `cache_control: { type: "ephemeral" }` a los documentos — próxima query paga ~10% del costo de input.
3. **Long context beta**: con corpus ≥200K tokens, agregá el beta header `context-1m-2025-08-07`.
4. **UI de citas hoverables**: en una web, cada footnote puede hacer highlight del cited_text en el PDF original.

## Anti-patterns

- ❌ **Llamar al pipeline con documentos que cambian seguido sin cleanup**. Files API acumula archivos — siempre borrá al terminar si son temporales.
- ❌ **Asumir que todos los documentos caben en el contexto**. Verificá el total de tokens antes de armar el request — con 10+ PDFs grandes, puede exceder el límite.
- ❌ **No diferenciar titles de documentos**. Si los 3 papers se llaman "paper.txt", las citations son indistinguibles. Siempre títulos descriptivos.
- ❌ **Usar este patrón para corpus masivo (100+ docs)**. No escala. Ahí sí necesitás RAG con vector store — citations te sirve dentro del subconjunto retrieval-seleccionado.
- ❌ **Mostrar el resumen sin citas al usuario**. Si activaste citations, muéstralas. Sino pagaste tokens extra sin valor para el end-user.

## Recap

- Long context + citations permite un mini-RAG **sin pipeline custom**: subís documentos, preguntás, obtenés respuesta con citas precisas.
- **Pattern**: Files API upload → document blocks con `citations.enabled` → parser → markdown con footnotes → cleanup.
- Citations te da **fragmentos exactos** que el modelo realmente usó, no chunks artificiales como en RAG clásico.
- Escala bien hasta corpus medianos (≤ 200K tokens). Para más grande: RAG + citations combinados.
- **Siempre cleanup** de Files API — sino acumulás storage.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/citations](https://platform.claude.com/docs/en/build-with-claude/citations)
**Ejercicio:** <!-- exercise:ex-04-05-lab-extraction -->
