# Files API desde la Console y desde código

## Objetivo

Al terminar sabrás **cómo subir archivos a tu workspace** desde la página Files de la Console y desde código con el SDK, entenderás qué es un `file_id` y cómo usarlo para referenciar un archivo en múltiples llamadas sin re-subirlo, y tendrás claro cuándo Files API es mejor que mandar el contenido inline en el prompt.

## Concepto

### ¿Qué es Files API?

**Files API** es un endpoint beta de Anthropic que te permite **subir archivos (PDFs, imágenes, documentos) a tu workspace** una sola vez y después **referenciarlos por ID** en múltiples llamadas a `/v1/messages`. Es la diferencia entre:

- **Sin Files API**: cada llamada manda el contenido del archivo como base64 inline en el prompt → tokens de input multiplicados por cada llamada.
- **Con Files API**: subís el archivo una vez, recibís un `file_id`, y en cada llamada solo mandás el ID → el archivo no se re-procesa.

Files API está en **beta** y requiere el header `anthropic-beta: files-api-2025-04-14`.

### La página Files en la Console

En la Console, **Build → Files** te lleva a la gestión de archivos de tu workspace. La página muestra:

- **Lista de archivos** subidos con ID, nombre, tamaño y fecha de creación.
- **Template de código** para upload (Python por default):

```python
import anthropic

client = anthropic.Anthropic()
client.beta.files.upload(
    file=("document.pdf", open("path/to/document.pdf", "rb"), "application/pdf"),
)
```

- Botones **Copy Code** y **View Docs** para copiar el snippet o ver la documentación completa.
- Selector de lenguaje para ver el snippet en Python u otros lenguajes.

> **Nota**: al momento de escribir esta lección, la página Files muestra "Only files from the Default workspace are shown. To see other workspace's files, select a workspace." Los archivos son **por workspace**, no globales.

### Subir un archivo desde código

El endpoint de upload es `POST /v1/files` con beta header:

**curl:**

```bash
curl -s https://api.anthropic.com/v1/files \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: files-api-2025-04-14" \
  -F "file=@mi-documento.pdf" \
  -F "purpose=vision"
```

**TypeScript SDK:**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic();

const file = await client.beta.files.upload({
  file: new File(
    [readFileSync("mi-documento.pdf")],
    "mi-documento.pdf",
    { type: "application/pdf" },
  ),
  purpose: "vision",
});

console.log("File ID:", file.id);
// file.id es algo como "file-abc123..."
```

> **Nota:** los snippets de este tipo requieren el beta de files. La API puede cambiar — verificá la documentación oficial al momento de usar.

### Usar un `file_id` en un mensaje

Una vez subido, referenciás el archivo por su `file_id` en el array `content` del mensaje:

```ts
const resp = await client.beta.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  betas: ["files-api-2025-04-14"],
  messages: [{
    role: "user",
    content: [
      {
        type: "file",
        source: {
          type: "file",
          file_id: file.id,
        },
      },
      {
        type: "text",
        text: "Resumí este documento en 5 bullets.",
      },
    ],
  }],
});
```

El archivo se procesa del lado de Anthropic — no necesitás re-mandarlo como base64 cada vez.

### ¿Cuándo usar Files API vs inline?

| Criterio | Files API | Inline (base64/texto) |
|---|---|---|
| Archivo usado en 1 sola llamada | ❌ Overhead de upload | ✅ Más simple |
| Archivo usado en N llamadas | ✅ Upload una vez, usar N veces | ❌ Re-mandar N veces |
| Archivo > 5MB | ✅ Soportado | ❌ Payload enorme |
| Necesitás persistencia entre sesiones | ✅ El file_id persiste | ❌ Tenés que re-mandar |
| Prototipando rápido | ❌ Paso extra | ✅ Más directo |

**Regla práctica**: si vas a usar el mismo archivo en **más de 2 llamadas**, subilo con Files API. Si es una sola llamada one-shot, inline es más simple.

### Archivos soportados

Files API soporta los tipos de archivo que Claude puede procesar:

- **PDFs** (`application/pdf`): texto, tablas, y layout. Se procesan con OCR del lado de Anthropic.
- **Imágenes** (`image/png`, `image/jpeg`, `image/gif`, `image/webp`): para tareas de vision.
- **Documentos de texto**: si necesitás pasar texto largo, podés subirlo como archivo en vez de pegarlo inline.

Los detalles exactos de tipos soportados y límites de tamaño pueden cambiar — consultá la documentación oficial.

### El parámetro `purpose`

Cada archivo subido declara un **`purpose`** (ej: `"vision"`) que le dice a Anthropic cómo validar y referenciarlo. Es el campo que a más gente se le escapa la primera vez, porque con key válida el upload devuelve `400` sin explicar cuál `purpose` elegir.

| Valor | Cuándo | Dónde se usa |
|-------|--------|--------------|
| `"vision"` | PDFs, imágenes, texto que vas a pasar al modelo | Bloques `document` e `image` con `source.type: "file"` |
| (otros) | Skills upload y code execution usan endpoints distintos (Módulos 7-8) | No aplica a Files API general |

Si tu caso es "quiero preguntarle a Claude sobre este archivo", la respuesta es casi siempre `purpose: "vision"`.

### Lifecycle de un archivo: crear → usar → borrar

Files API no es un filesystem persistente para tu app — es un **workspace de binarios asociado a tu workspace de Anthropic**. El lifecycle conceptual:

```
[local disk]
     │ POST /v1/files (multipart: file + purpose)
     ▼
[Anthropic storage] ── file_id ──► referenciás en /v1/messages (N veces)
     │ DELETE /v1/files/:id (cuando termina tu pipeline)
     ▼
[limpio]
```

Tres decisiones que vale la pena tomar antes de subir un archivo:

- **¿Por cuánto tiempo lo voy a usar?** Si son minutos (un pipeline batch que termina), borrá apenas terminás. Si son días/semanas (un PDF de referencia que consulta mucha gente), dejalo.
- **¿Quién lo puede ver?** El scope de Files API es **workspace**. Cualquier API key del mismo workspace puede referenciar el `file_id`. Si tu workspace tiene múltiples miembros o apps, considerá si el archivo es adecuado para ese scope.
- **¿Qué pasa si falla un upload?** Manejá `413 Payload Too Large` (archivo excede el límite) y `400` (mime_type no soportado o purpose inválido) antes de pasar al `messages.create`.

### Conceptos de arquitecto

- **Files API evita dos problemas simultáneos**: payload gigante en cada request (costo de red + riesgo de timeouts) y reproceso del archivo en cada request (overhead de parsing dentro de Anthropic). La ganancia escala con N (llamadas) × S (tamaño del archivo).
- **Prompt caching no reemplaza Files API**: el caching del Módulo 6 reduce tokens de **prompts repetidos**, pero si el payload del archivo viaja en cada llamada seguís pagando ancho de banda y serialización. Files API corta ese viaje de raíz.
- **Nunca es el Files API de tu app**: no lo uses como blob storage general. Los archivos son para pasarle contenido a Claude. Si tu app necesita guardar archivos del usuario a largo plazo, usá S3/R2/GCS. Files API es un staging area para consulta.

## Ejecución real

Este ejercicio es exploratorio desde la Console. No hacemos curl porque Files API es beta y los snippets pueden cambiar.

**Paso 1 — Ver la página Files**

1. Abrí `platform.claude.com`.
2. En el sidebar, hacé click en **Build → Files**.
3. Verificá que ves la lista vacía (o con archivos si ya subiste alguno) y el snippet de código de upload.

**Paso 2 — Copiar el snippet**

1. Hacé click en **Copy Code** para obtener el template de upload.
2. Si tenés un PDF de prueba, podés adaptarlo y ejecutarlo localmente.

**Paso 3 — Entender el flujo**

El flujo completo de Files API es:

```
Upload: POST /v1/files → recibís file_id
   ↓
Uso: POST /v1/messages con { type: "file", source: { file_id } }
   ↓
Repetir: el mismo file_id en N llamadas distintas
   ↓
Cleanup: DELETE /v1/files/{file_id} cuando ya no lo necesitás
```

Es un patrón de **upload once, reference many times** — idéntico a cómo funcionan los attachments en cualquier API de storage.

## Anti-patterns

- ❌ **Re-subir el mismo archivo en cada request**. Si tenés un PDF que 100 usuarios van a consultar, subilo una vez con Files API y reutilizá el `file_id`. Re-subirlo 100 veces es desperdicio.
- ❌ **Usar Files API para archivos de una sola consulta**. Si solo necesitás procesar un PDF una vez, mandarlo inline como base64 es más simple que upload → reference → cleanup.
- ❌ **No limpiar archivos viejos**. Los archivos subidos persisten en tu workspace. Borrá los que ya no necesitás con `DELETE /v1/files/{file_id}` para mantener el workspace limpio.
- ❌ **Asumir que Files API funciona sin el beta header**. Files API requiere `anthropic-beta: files-api-2025-04-14`. Sin el header, el endpoint no existe.
- ❌ **Mandar archivos enormes inline en el body de `/v1/messages`**. Un PDF de 10MB como base64 en un JSON es ~13MB de payload — lento, frágil, y puede exceder límites del servidor. Files API es la solución para archivos grandes.
- ❌ **Hardcodear `file_id` en el código fuente**. Los IDs se generan al upload y están scoped al workspace. Si los dejás como constantes, la primera rotación de archivos rompe el código. Subilos en un script, pasá el `id` por env var o por config.
- ❌ **Usar Files API como "mini-S3" de tu app**. No está diseñado para ser el storage primario de objetos de usuario. No tiene CDN, no tiene signed URLs, no tiene versionado. Es un staging area para pasarle archivos al modelo — nada más.
- ❌ **Asumir que borrar un archivo invalida referencias cacheadas**. Si tu pipeline tiene un caché de `file_id` → resultado de Claude, borrar el archivo en Anthropic no limpia tu caché local. Hacés ambas limpiezas de forma coordinada, o invalidás tu caché por TTL.

## Recap

- **Files API** te permite subir archivos al workspace y referenciarlos por `file_id` en múltiples llamadas — upload once, reference many.
- **La página Files** en la Console (Build → Files) te da un snippet de upload y la lista de archivos por workspace.
- **Requiere beta header** `files-api-2025-04-14` — es una API beta que puede cambiar.
- **Usá Files API** cuando el mismo archivo se consulta en N llamadas. Usá inline cuando es una sola consulta one-shot.
- **Tipos soportados**: PDFs, imágenes, documentos de texto.
- **Cleanup**: borrá archivos viejos con DELETE para mantener el workspace ordenado.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/files](https://platform.claude.com/docs/en/api/files)
**Ejercicio:** <!-- exercise:ex-02-03-upload-file -->
