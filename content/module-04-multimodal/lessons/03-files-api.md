# Files API: subir una vez, referenciar N veces

## Objetivo

Al terminar esta lección sabrás **cómo subir archivos a Anthropic con la Files API** (PDFs, imágenes, texto), obtener un `file_id`, y referenciarlo en múltiples mensajes sin re-enviar el binario. También aprenderás el beta header requerido, el lifecycle de los archivos, y cuándo conviene Files API vs base64 embebido.

## Concepto

### El problema que resuelve Files API

Si tenés un PDF de 5MB y querés hacerle 10 preguntas distintas, **embeber el PDF en base64 en cada request** significa:

- 10 requests × 5MB = 50MB de ancho de banda
- Cada request parsea el PDF desde cero
- Latencia alta por transferencia en cada llamada

Con Files API: **subís el archivo una vez** y recibís un `file_id`. Después referenciás ese ID en cada mensaje. El archivo queda en servidores de Anthropic y se procesa mucho más rápido.

### El endpoint /v1/files

Files API tiene dos operaciones principales:

```
POST /v1/files      # Subir un archivo
DELETE /v1/files/:id # Borrar un archivo
```

<terminology>

**Beta header requerido**: Files API requiere el header `anthropic-beta: files-api-2025-04-14` en todas las llamadas relacionadas (upload, delete, y mensajes que referencian el file_id). Al ser beta, puede cambiar sin previo aviso.

**Purposes**: al subir, declarás el `purpose` del archivo. `"vision"` para imágenes y PDFs que vas a pasar al modelo. El purpose informa a Anthropic cómo validar y almacenar el archivo.

**file_id**: string con prefijo `file-` (ej: `file-abc123def456`). Es la referencia que usás en los mensajes.

</terminology>

### El flujo upload → reference → cleanup

El patrón completo tiene 3 fases:

```
1. Upload   → client.beta.files.upload({ file, purpose })
              → recibís { id: "file-xyz", ... }

2. Reference → messages.create con content:
              [{ type: "document"|"image", source: { type: "file", file_id: "file-xyz" } }]

3. Cleanup  → client.beta.files.delete("file-xyz")
              (obligatorio al terminar — los archivos consumen storage)
```

### Lifecycle: cuánto dura un archivo

Un archivo subido queda disponible hasta que:
1. Lo borrás explícitamente con `files.delete`.
2. Expira automáticamente (política de retención — consultá docs).

<warning>

**Siempre cleanup**: no dejes archivos colgando. Si tu pipeline procesa documentos temporales, borrá al terminar. Si es un documento que vas a reusar, mantenelo. Pero nunca "subí y me olvidé".

</warning>

### Cuándo usar Files API vs base64

| Caso | Files API | base64 embebido |
|---|---|---|
| PDF de 10MB, 1 sola pregunta | ⚠️ Overhead de upload | ✅ Directo |
| PDF de 10MB, 20 preguntas | ✅ Subís una vez | ❌ 20 × 10MB |
| Imagen generada al vuelo | ❌ Overhead sin beneficio | ✅ Directo |
| Biblioteca de documentos recurrentes | ✅ Ideal | ❌ Re-upload redundante |
| Script de prueba único | ❌ Overhead innecesario | ✅ Más simple |

**Regla**: si el archivo se va a referenciar 3+ veces, Files API. Si es one-shot, base64.

### Errores típicos del upload (y qué significan)

| Código | Mensaje típico | Causa | Fix |
|--------|----------------|-------|-----|
| `400` | `invalid purpose` | Faltó o es incorrecto el campo `purpose` | Usar `purpose=vision` |
| `400` | `unsupported file type` | MIME type no soportado | Chequear que sea PDF, imagen soportada, o text/plain |
| `401` | `authentication_error` | Falta header `x-api-key` o es inválido | Verificar `ANTHROPIC_API_KEY` |
| `403` | Sin acceso al beta | El workspace no tiene el beta habilitado | Activar el beta en Settings o pedirlo a Support |
| `413` | `payload too large` | Archivo excede el límite de tamaño | Partir el archivo o redimensionar imágenes |
| `429` | `rate_limit_exceeded` | Demasiados uploads simultáneos | Backoff + batch secuencial |

El más sutil: `400 invalid purpose` suele aparecer cuando seguís ejemplos viejos que usaban otros valores. Mientras dure el beta, el valor seguro es `"vision"`.

### Conceptos de arquitecto

- **Files API es el primer paso hacia un pipeline RAG-light**: subís documentos → guardás `file_id` → consultás con `citations` activado. Esto te evita montar un vector store para corpus pequeños (≤20 docs). Lo vas a ver en el lab de esta misma lección en M04.
- **El `file_id` no expira de inmediato pero no es eterno**: tratalo como un recurso gestionado. En un pipeline productivo, guardá en tu DB la asociación (nombre de archivo, `file_id`, fecha de upload, última consulta) y revisá que todavía existen antes de usarlos — con un fallback a re-upload si fue borrado.
- **Files API + prompt caching se combinan bien**: el documento viaja como referencia (ya no paga serialización cada request) y su contenido procesado puede cachearse en el contexto. Volvés a pagar ~10% del costo de input cuando hacés la query N+1 sobre el mismo archivo.

## Ejecución real

**Paso 1 — Subir un archivo**

```bash
# Crear archivo de prueba
echo "Revenue Report Q1 2025. Total: USD 2.4M, up 15%. 47 new clients." > /tmp/report.txt

# Upload con curl
curl -s https://api.anthropic.com/v1/files \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: files-api-2025-04-14" \
  -F "file=@/tmp/report.txt;type=text/plain" \
  -F "purpose=vision"
```

Respuesta (ejemplo):
```json
{
  "id": "file-abc123def456ghi789",
  "type": "file",
  "filename": "report.txt",
  "mime_type": "text/plain",
  "size_bytes": 64,
  "created_at": "2026-04-11T15:30:00Z"
}
```

Guardá el `id` — lo necesitás para los mensajes.

**Paso 2 — Referenciar el file_id en un mensaje**

```bash
FILE_ID="file-abc123def456ghi789"

curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: files-api-2025-04-14" \
  -H "content-type: application/json" \
  -d "{
    \"model\": \"claude-haiku-4-5\",
    \"max_tokens\": 200,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": [
        {
          \"type\": \"document\",
          \"source\": { \"type\": \"file\", \"file_id\": \"$FILE_ID\" }
        },
        {
          \"type\": \"text\",
          \"text\": \"¿Cuál fue el revenue total?\"
        }
      ]
    }]
  }"
```

Notá que en `source` pasás `type: "file"` y `file_id` en vez de `type: "base64"` y `data`. Es el mismo bloque `document`, solo cambia la fuente.

**Paso 3 — Reutilizar el mismo file_id para otra pregunta**

```bash
# Segunda pregunta sin re-subir el archivo
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: files-api-2025-04-14" \
  -H "content-type: application/json" \
  -d "{
    \"model\": \"claude-haiku-4-5\",
    \"max_tokens\": 100,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": [
        { \"type\": \"document\", \"source\": { \"type\": \"file\", \"file_id\": \"$FILE_ID\" } },
        { \"type\": \"text\", \"text\": \"¿Cuántos clientes nuevos?\" }
      ]
    }]
  }"
```

**Paso 4 — Cleanup**

```bash
curl -s -X DELETE https://api.anthropic.com/v1/files/$FILE_ID \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: files-api-2025-04-14"
```

**Paso 5 — El flujo completo en TypeScript**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, readFileSync } from "node:fs";

const client = new Anthropic();

// Preparar archivo local
writeFileSync("/tmp/report.txt", "Revenue Report Q1 2025. Total: USD 2.4M, up 15%. 47 new clients.");

// 1. Upload
const file = await client.beta.files.upload({
  file: new File(
    [readFileSync("/tmp/report.txt")],
    "report.txt",
    { type: "text/plain" },
  ),
  purpose: "vision",
});
console.log("File uploaded:", file.id);

// 2. Reference in multiple messages
const questions = [
  "¿Cuál fue el revenue total?",
  "¿Cuántos clientes nuevos?",
  "¿Cuál fue el cambio porcentual vs Q4?",
];

for (const q of questions) {
  const resp = await client.beta.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    betas: ["files-api-2025-04-14"],
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "file", file_id: file.id } },
        { type: "text", text: q },
      ],
    }],
  });
  const text = resp.content[0].type === "text" ? resp.content[0].text : "";
  console.log(`Q: ${q}\nA: ${text}\n`);
}

// 3. Cleanup
await client.beta.files.delete(file.id);
console.log("File deleted:", file.id);
```

## Anti-patterns

- ❌ **Usar Files API para archivos one-shot**. Si vas a hacer una sola pregunta al PDF, el overhead de upload + delete es mayor que enviarlo en base64.
- ❌ **No borrar los archivos al terminar**. Los archivos subidos consumen storage y pueden aparecer en auditorías. Siempre cleanup.
- ❌ **Omitir el beta header**. Sin `anthropic-beta: files-api-2025-04-14`, los endpoints `/v1/files` devuelven error. El mismo header va en los mensajes que referencian el file_id.
- ❌ **Hardcodear file_ids en código**. Los IDs son efímeros — los generás al subir. No los pegues como constantes en el código fuente.
- ❌ **Subir archivos sensibles sin política de cleanup**. Files API guarda el archivo hasta que lo borrás. Si el archivo tiene datos personales, tené un pipeline claro de retención.
- ❌ **Tratar `file_id` como identificador estable cross-workspace**. Es local al workspace que lo subió. Si movés un proyecto a otro workspace, tenés que re-uploadear.
- ❌ **Paralelizar 100 uploads sin control**. Files API tiene rate limits. Un for-loop con `Promise.all` sobre 100 archivos probablemente te tira 429. Usá una cola con concurrencia limitada (ej: `p-limit` con 5 concurrentes).

## Recap

- Files API resuelve el problema de re-enviar binarios grandes en cada request.
- **Flujo**: upload → reference por `file_id` → cleanup.
- Requiere beta header `anthropic-beta: files-api-2025-04-14`.
- Los bloques `document` e `image` aceptan `source: { type: "file", file_id }` como alternativa a base64 y URL.
- **Decisión**: Files API cuando el archivo se referencia 3+ veces, base64 para one-shot.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/files](https://platform.claude.com/docs/en/api/files)
**Ejercicio:** <!-- exercise:ex-04-03-files-upload -->
