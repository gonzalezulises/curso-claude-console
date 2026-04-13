# Crear tu primera skill custom

## Objetivo

Al terminar esta lección vas a haber creado, subido e invocado una skill custom tuya, entendiendo el flujo completo: bootstrap del folder → redacción del `SKILL.md` → upload multipart → invocación con `type: "custom"`. La vas a ejecutar end-to-end y ver el output real.

## Concepto

### El flujo de creación en cinco pasos

1. **Diseñar**: definir cuándo se debe activar y qué proceso encapsula. El `description` es el contrato.
2. **Escribir**: crear el folder con `SKILL.md` y archivos auxiliares.
3. **Subir**: `POST /v1/skills` con multipart form-data.
4. **Invocar**: usar el `skill_id` devuelto en `container.skills` con `type: "custom"`.
5. **Iterar**: si el dispatcher no la activa o la activa mal, ajustar la description y subir nueva versión.

### Diseñar la skill antes de escribirla

Antes de tocar el editor, contestá tres preguntas:

- **¿Cuándo debe dispararse?** Una frase que arranque con "Use this skill when..." y enumere disparadores concretos.
- **¿Cuándo NO debe dispararse?** Lista de casos negativos. Esto es lo que distingue skills bien diseñadas.
- **¿Qué hace el proceso, paso a paso?** Si no lo podés describir en 5-10 pasos, probablemente esté demasiado grande — partila en dos skills.

Ejemplo mental para una skill "release-notes":

- Se dispara cuando: el usuario pega un diff de git o lista de commits y pide "release notes".
- NO se dispara cuando: piden revisar código, explicar commits individuales, o debuggear.
- Proceso: agrupa commits por tipo (feat/fix/chore), redacta sección "Highlights" con top 3, sección "Breaking changes" solo si hay, sección "Full changelog".

### Escribir el `SKILL.md`

Con las tres respuestas arriba, el `SKILL.md` casi se escribe solo:

```markdown
---
name: release-notes
description: Use this skill when the user provides a git diff, a list of commits, or a changelog and asks to produce release notes. Groups commits by type (feat/fix/chore), generates a Highlights section with top 3 changes, and flags breaking changes. Do NOT trigger for code review, commit message debugging, or per-commit explanations.
---

# Release Notes Skill

## When to trigger
- User provides commits/diff AND asks for "release notes", "changelog entry", or "what changed".

## When NOT to trigger
- Code review requests ("review this PR").
- Debugging a specific commit.
- Writing commit messages from scratch.

## Process
1. Parse the input into individual commits with their type prefix (feat:, fix:, chore:, docs:).
2. Group by type. Skip `chore:` unless nothing else exists.
3. Select top 3 user-facing changes for the Highlights section.
4. Create Breaking Changes section ONLY if any commit body contains "BREAKING CHANGE:".
5. Output in this exact structure:

## Output format

### Highlights
- [top change 1]
- [top change 2]
- [top change 3]

### Features
- [feat commits, one-liner each]

### Fixes
- [fix commits, one-liner each]

### Breaking changes
- [only if applicable]

### Full changelog
- [all commits, collapsed]
```

Fijate que el body incluye el **output format exacto**. Las skills que escriben output estructurado necesitan un template explícito; si lo dejás libre, el modelo inventa variantes.

### El upload multipart: el detalle que más te va a trabar

El endpoint es `POST /v1/skills`, **multipart/form-data**. Tres cosas críticas:

1. **`display_title`** es un label humano (aparece en dashboard); puede diferir del `name` del frontmatter.
2. **Cada archivo se sube como `-F "files[]=@<local>;filename=<folder>/<name>"`**. El `filename` es **path relativo** que debe empezar con el folder del bundle.
3. **Todos los files comparten el mismo top-level folder** en sus `filename`. Si subís `financial-skill/SKILL.md` y `financial-skill/scripts/validate.py`, el `financial-skill/` es el common root.

Si cometés el error clásico de pasar solo `filename=SKILL.md` (sin el prefix de folder), el API responde:

```json
{"type":"error","error":{"type":"invalid_request_error","message":"SKILL.md file must be exactly in the top-level folder."}}
```

Ese mensaje es engañoso — **no** es que `SKILL.md` esté mal ubicado en tu filesystem; es que el filename del upload no incluye el folder prefix.

### Respuesta del upload

Cuando el upload sale bien, recibís:

```json
{
  "type": "skill",
  "id": "skill_01GypGoWmaCLwjXBhyFwsXtX",
  "created_at": "2026-04-13T03:40:16.371070Z",
  "updated_at": "2026-04-13T03:40:16.371070Z",
  "display_title": "greeting-demo",
  "source": "custom",
  "latest_version": "1776051615584191"
}
```

Dos campos importantes:

- **`id`** (formato `skill_01...`): es lo que vas a pasar como `skill_id` en `container.skills`.
- **`latest_version`** (timestamp unix con microsegundos): la versión actual. Podés usarla literal o `"latest"`.

### Invocar una skill custom

Idéntico a invocar una skill de Anthropic, pero con `type: "custom"` y el `skill_id` de formato `skill_01...`:

```json
{
  "model": "claude-haiku-4-5",
  "container": {
    "skills": [
      {
        "type": "custom",
        "skill_id": "skill_01GypGoWmaCLwjXBhyFwsXtX",
        "version": "latest"
      }
    ]
  },
  "tools": [{"type":"code_execution_20250825","name":"code_execution"}],
  "messages": [...]
}
```

Los mismos tres beta headers siguen siendo obligatorios. Podés combinar libremente skills `anthropic` y `custom` en el mismo array de `skills`.

## Ejecución real

Creamos `greeting-demo` end-to-end. Primero el bundle:

```bash
mkdir -p /tmp/skills-lab/greeting-demo
cat > /tmp/skills-lab/greeting-demo/SKILL.md <<'EOF'
---
name: greeting-demo
description: Use this skill when the user asks to generate a friendly greeting in multiple languages. Returns greetings formatted as a markdown list.
---

# Greeting Demo

When asked for a greeting, respond with a markdown list of greetings in:
- Spanish
- English
- Portuguese
- French

Each item: `- **Lang**: greeting`
EOF
```

Subida (fijate en el `filename=greeting-demo/SKILL.md`):

```bash
curl -sS -X POST "https://api.anthropic.com/v1/skills" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "display_title=greeting-demo" \
  -F "files[]=@/tmp/skills-lab/greeting-demo/SKILL.md;filename=greeting-demo/SKILL.md"
```

Output real:

```json
{
  "type": "skill",
  "id": "skill_01GypGoWmaCLwjXBhyFwsXtX",
  "created_at": "2026-04-13T03:40:16.371070Z",
  "updated_at": "2026-04-13T03:40:16.371070Z",
  "display_title": "greeting-demo",
  "source": "custom",
  "latest_version": "1776051615584191"
}
```

Invocación:

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
      "skills": [{"type":"custom","skill_id":"skill_01GypGoWmaCLwjXBhyFwsXtX","version":"latest"}]
    },
    "tools": [{"type":"code_execution_20250825","name":"code_execution"}],
    "messages": [{"role":"user","content":"Dame un greeting."}]
  }'
```

Respuesta real (recortada al último content block y al usage):

```json
{
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {"type":"server_tool_use","name":"text_editor_code_execution","input":{"command":"view","path":"/skills/greeting-demo/SKILL.md"}},
    {"type":"text_editor_code_execution_tool_result","content":{"type":"text_editor_code_execution_view_result","content":"---\nname: greeting-demo\n..."}},
    {"type":"text","text":"Perfecto, aquí está tu greeting en múltiples idiomas:\n\n- **Spanish**: ¡Hola! Es un placer saludarte.\n- **English**: Hello! It's a pleasure to greet you.\n- **Portuguese**: Olá! É um prazer saudá-lo.\n- **French**: Bonjour! C'est un plaisir de vous saluer."}
  ],
  "container": {
    "id": "container_011Ca15f8QnY3bzhmSTFgUgc",
    "skills": [{"type":"custom","skill_id":"skill_01GypGoWmaCLwjXBhyFwsXtX","version":"1776051615584191"}]
  },
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 8534, "output_tokens": 292}
}
```

Tres cosas que confirmás en este output:

- El modelo leyó `/skills/greeting-demo/SKILL.md` — tu bundle se montó.
- El output respeta el formato que instruiste (`- **Lang**: greeting`).
- La respuesta incluye `container.skills` con la versión resuelta (`"latest"` → timestamp real).

## Anti-patterns

- ❌ **`filename=SKILL.md` sin el prefix del folder**. Error 400 con el mensaje engañoso de "top-level folder". Siempre `filename=<folder>/SKILL.md`.
- ❌ **Subir cada archivo con un folder distinto** (`filename=my-skill/SKILL.md` y `filename=other-skill/script.py`). Todos los archivos comparten el mismo top-level folder.
- ❌ **Publicar una skill con `name` que matchea palabras reservadas** (`claude-*`, `anthropic-*`). Rechaza al upload. Usá nombres de dominio.
- ❌ **Iterar la skill editando el mismo upload**. No podés. Cada cambio requiere `POST /v1/skills/{id}/versions` para crear una nueva versión (lección 5).
- ❌ **Skills con descriptions que compiten**. Si tenés dos skills activas con descriptions parecidas ("Use when generating reports..." y "Use when creating reports..."), el dispatcher oscila entre ambas. Hacé las descriptions mutuamente excluyentes.
- ❌ **Testear la skill solo con el caso feliz**. Probá también: (1) pedido vago que NO debería activarla, (2) pedido que sí activa pero con input malformado, (3) pedido con conflicto entre dos skills activas.

## Recap

- Creación en cinco pasos: diseñar → escribir → subir → invocar → iterar.
- El `SKILL.md` debe tener `description` concreta que enseñe cuándo SÍ y cuándo NO activar.
- Upload: `POST /v1/skills` con `multipart/form-data`, `files[]=@local;filename=<folder>/<name>`.
- El filename del upload debe incluir el prefix del folder; todos los files comparten top-level folder.
- La respuesta del upload te da `id` (empieza con `skill_01...`) y `latest_version` (timestamp).
- Para invocar: `container.skills: [{type:"custom", skill_id, version}]` + tool `code_execution_20250825`.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/skills-guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
**Ejercicio:** <!-- exercise:ex-08-03-upload-skill -->
