# Skills de Anthropic: `pdf`, `docx`, `pptx`, `xlsx`

## Objetivo

Al terminar esta lección vas a saber invocar las cuatro skills pre-built que Anthropic mantiene (PDF, Word, Excel, PowerPoint), entender qué requisitos tienen (beta headers + code execution tool), y cuándo conviene usar una skill de Anthropic versus escribir código propio para el mismo output.

## Concepto

### Las cuatro skills oficiales

Anthropic publica y mantiene cuatro skills para generación y manipulación de documentos ofimáticos:

| `skill_id` | Formato | Casos típicos |
|-----------|---------|---------------|
| `pdf` | PDF | Generar reportes formateados; extraer texto/tablas de PDFs |
| `docx` | Word | Crear documentos con estilos, headers, tablas |
| `pptx` | PowerPoint | Crear presentaciones, editar slides, analizar contenido |
| `xlsx` | Excel | Crear spreadsheets, generar charts, limpiar datos tabulares |

Están disponibles para todos los users en `claude.ai` y en el API (no necesitás ser workspace admin para usarlas). Las podés listar siempre con:

```bash
curl -sS "https://api.anthropic.com/v1/skills?source=anthropic" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

### Los tres beta headers obligatorios

Las skills viven dentro del **container** de code execution. Eso significa tres dependencias que tenés que habilitar en todos los requests:

```
anthropic-beta: code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14
```

Cada uno aporta:

- **`code-execution-2025-08-25`**: habilita el tool `code_execution_20250825` (sandbox Python + bash + text editor donde viven las skills).
- **`skills-2025-10-02`**: habilita el parámetro `container.skills` en `/v1/messages` y los endpoints `/v1/skills`.
- **`files-api-2025-04-14`**: necesario para subir PDFs/xlsx al container (lectura) y descargar los archivos generados (escritura).

Si te olvidás uno, el error 400 te lo dice explícitamente. Guardá el string exacto — es el error #1 del módulo.

### Shape del request con una skill activa

Para que la skill sea utilizable, tenés que pasar **dos cosas** en `/v1/messages`:

1. `container.skills: [{type, skill_id, version}]` — declara qué skills están montadas.
2. `tools: [{type: "code_execution_20250825", name: "code_execution"}]` — habilita el runtime donde viven.

Ejemplo canónico:

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 4096,
  "container": {
    "skills": [
      {"type": "anthropic", "skill_id": "xlsx", "version": "latest"}
    ]
  },
  "tools": [
    {"type": "code_execution_20250825", "name": "code_execution"}
  ],
  "messages": [
    {"role": "user", "content": "Crea un Excel con ventas trimestrales y un chart."}
  ]
}
```

El campo `version: "latest"` te trae la última publicación. Anthropic versiona por fecha (ej: `20260203`), y para reproducibilidad en producción conviene fijar una versión específica en lugar de `"latest"`:

```json
{"type": "anthropic", "skill_id": "xlsx", "version": "20260203"}
```

Podés declarar **hasta 8 skills por request**. El modelo elige cuáles cargar según la description de cada una.

### El loop de ejecución que vas a ver

Cuando el modelo activa una skill, no "resuelve" la tarea directamente — navega el bundle como lo haría un teammate con filesystem:

1. Primer turn: lee `SKILL.md` vía `text_editor` (`view /skills/xlsx/SKILL.md`).
2. Decide qué subpath necesita y lee archivos extra si aplica (`view /skills/xlsx/REFERENCE.md`).
3. Ejecuta bash/python con los packages pre-instalados (`python: import openpyxl; ...`).
4. Si la tarea produce un archivo, lo guarda en el container.
5. Para devolver un archivo al usuario, lo lee con la Files API.

Todo esto te llega en el `content` de la respuesta como una secuencia de content blocks: `server_tool_use`, `bash_code_execution_tool_result`, `text_editor_code_execution_tool_result`, `text`. No tenés que orquestar nada — el ciclo corre server-side.

### Cuándo usar una skill de Anthropic vs. escribirlo vos

Las skills de Anthropic no son mágicas — son bundles de Python con `openpyxl`, `python-pptx`, `python-docx`, `pdfplumber`/`reportlab` + instrucciones curadas sobre convenciones y mejores prácticas. El valor no es "Claude puede manipular Excel" (eso ya lo hacía con code execution solo), sino que las reglas vienen **empaquetadas y versionadas**: Anthropic itera sobre ellas y cuando mejoran, tus outputs mejoran sin cambios en tu código.

Usá skills de Anthropic cuando:

- El output final es un archivo ofimático (xlsx/docx/pptx/pdf).
- Querés formato "profesional" por default (fuentes, estilos, color coding industry-standard).
- No tenés equity o reglas propias de formato que Anthropic no sabe.

Escribí código propio (sin skill) cuando:

- Tenés un template corporativo específico que la skill pre-built no conoce.
- Necesitás control total sobre el output (ej: regulatory reports con layouts exactos).
- Estás en una superficie donde las skills no corren (ej: backend sin code execution).

En el caso con template propio, la jugada suele ser: **partir de la skill de Anthropic + layer encima una skill custom** (lección 4) que reemplaza/complementa las reglas.

## Ejecución real

Invocación end-to-end contra la skill `xlsx`:

```bash
curl -sS -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 1024,
    "container": {
      "skills": [{"type":"anthropic","skill_id":"xlsx","version":"latest"}]
    },
    "tools": [{"type":"code_execution_20250825","name":"code_execution"}],
    "messages": [{"role":"user","content":"Crea un Excel con 3 filas: producto=A-B-C, precio=10-20-30. Guardalo como /tmp/demo.xlsx y decime su tamaño en bytes."}]
  }'
```

Respuesta real (content blocks recortados para claridad):

```json
{
  "model": "claude-haiku-4-5-20251001",
  "id": "msg_018QEzVQosBrL1PLJirgd8eD",
  "role": "assistant",
  "content": [
    {"type":"text","text":"Voy a ayudarte a crear un archivo Excel. Primero, debo leer las instrucciones de la skill de Excel."},
    {"type":"server_tool_use","name":"text_editor_code_execution","input":{"command":"view","path":"/skills/xlsx"}},
    {"type":"text_editor_code_execution_tool_result","content":{"type":"...error...","error_message":"..."}},
    {"type":"server_tool_use","name":"bash_code_execution","input":{"command":"cat /skills/xlsx/SKILL.md"}},
    {"type":"bash_code_execution_tool_result","content":{"stdout":"---\nname: xlsx\ndescription: \"Use this skill any time a spreadsheet file is the primary input or output...\"\n---\n\n# Requirements for Outputs\n\n## All Excel files\n\n### Professional Font\n- Use a consistent, professional font..."}}
  ]
}
```

Observá tres cosas:

1. El modelo **primero** hace `view /skills/xlsx` (listado del directorio), falla por un edge case de parsing de ese comando particular, y recae en `cat /skills/xlsx/SKILL.md` — vas a ver ese pattern seguido.
2. El cuerpo de la skill oficial aparece literal en el stdout — podés leerlo para aprender cómo Anthropic escribe sus propias skills ("Professional Font", "Zero Formula Errors", color coding, etc.).
3. Después de cargar las instrucciones, el modelo sigue con turns adicionales hasta generar el archivo.

En producción vas a interactuar con esto vía SDK (`@anthropic-ai/sdk` o `anthropic` de Python), que abstrae el loop. El shape de los content blocks es el mismo.

## Anti-patterns

- ❌ **Usar la skill sin el `code_execution_20250825` tool**. Error 400. La skill vive en el container; sin el tool no hay container.
- ❌ **Olvidar uno de los tres beta headers**. Si falta `files-api-2025-04-14`, cualquier descarga del archivo generado falla. Si falta `code-execution-2025-08-25`, la skill no se monta.
- ❌ **`version: "latest"` en producción sin fallback plan**. Las skills oficiales se actualizan; si Anthropic cambia el shape del output, tu pipeline downstream puede romperse. Fijá la versión que validaste.
- ❌ **Confundir el `skill_id` pre-built con un nombre arbitrario**. `skill_id: "excel"` o `"spreadsheet"` no existen. Los IDs válidos son exactamente `pdf`, `docx`, `pptx`, `xlsx`.
- ❌ **Esperar network desde la skill**. El container no tiene internet. Si la tarea requiere fetch de un CSV remoto, descargalo antes (en tu código), subilo al container via Files API, y recién invocá la skill.
- ❌ **Instalar 8 skills "por si acaso"**. Cada skill paga ~100 tokens de metadata siempre. Declará solo las que son relevantes al request (el dispatcher puede confundirse con descripciones superpuestas).

## Recap

- Anthropic mantiene 4 skills pre-built: `pdf`, `docx`, `pptx`, `xlsx` — cubren generación y análisis de documentos ofimáticos.
- Requieren **tres beta headers**: `code-execution-2025-08-25`, `skills-2025-10-02`, `files-api-2025-04-14`.
- Se pasan en `container.skills` junto con el tool `code_execution_20250825` en `tools`.
- Usan `version: "latest"` o una fecha específica (`"20260203"`); en producción fijá la versión.
- Hasta 8 skills por request; el modelo carga cada una on-demand leyendo `/skills/<id>/SKILL.md`.
- No hay acceso a red desde el container en la superficie API — las skills procesan lo que ya esté en el container (files subidos previamente).

---

**Fuente oficial:** [platform.claude.com/docs/en/agents-and-tools/agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
**Ejercicio:** <!-- exercise:ex-08-01-skills-anthropic -->
