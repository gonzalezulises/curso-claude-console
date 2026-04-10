# Convenciones del curso

Referencia rápida para mantener consistencia al producir contenido. Si estás escribiendo una lección o ejercicio, empieza aquí.

## Naming

### Archivos de lecciones
- **Patrón:** `NN-kebab-case-descriptivo.md`
- **NN:** dos dígitos (01-99), orden dentro del módulo
- **Ejemplos buenos:**
  - `01-bienvenida-al-curso.md`
  - `04-primer-curl-v1-messages.md`
  - `12-tool-use-streaming.md`
- **Ejemplos malos:**
  - `1-welcome.md` (falta padding, mezcla idioma)
  - `leccion-01.md` (no descriptivo)
  - `01_primer_curl.md` (snake_case, usar kebab-case)

### Archivos de ejercicios
- **Patrón:** `ex-MM-NN-kebab-slug.yaml`
- **MM:** dos dígitos, número del módulo (`00`, `01`, ..., `12`)
- **NN:** dos dígitos, orden del ejercicio dentro del módulo
- **Ejemplos:**
  - `ex-00-01-primer-curl.yaml`
  - `ex-05-03-tool-use-weather.yaml`
  - `ex-11-02-cost-report.yaml`

### IDs dentro de YAML
- **Módulos:** `module-MM` (ej: `module-00`, `module-10`)
- **Lecciones:** `lesson-MM-NN` (ej: `lesson-00-04`)
- **Ejercicios:** `ex-MM-NN-slug` (ej: `ex-00-01-primer-curl`)

## Estructura de lección (template)

```markdown
# Título descriptivo de la lección

## Objetivo
Al terminar esta lección sabrás cómo [verbo outcome].

## Concepto

[Teoría, 400-800 palabras. Usa subsecciones con `###` si ayuda.]

<terminology>
Define términos clave del Claude ecosystem la primera vez que aparecen.
Ej: "anthropic-version", "stop_reason", "content block".
</terminology>

## Ejecución real

Primero con curl:

\`\`\`bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hola"}]
  }'
\`\`\`

**Output real:**

\`\`\`json
{
  "id": "msg_01ABC...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "¡Hola! ¿En qué puedo ayudarte?"}],
  "model": "claude-haiku-4-5",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 12}
}
\`\`\`

El mismo ejemplo en TypeScript:

\`\`\`ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const message = await client.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'Hola' }],
});

console.log(message.content[0]);
\`\`\`

## Anti-patterns

- ❌ **No hagas X** — porque [razón técnica concreta].
- ❌ **No hagas Y** — porque [razón técnica concreta].
- ✅ **Sí haz Z** — porque [razón].

## Recap

- Takeaway 1 en una línea
- Takeaway 2 en una línea
- Takeaway 3 en una línea

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages)
**Ejercicio:** <!-- exercise:ex-00-01-primer-curl -->
```

## Estructura de ejercicio (templates)

### Ejercicio de código Python/TypeScript

```yaml
id: ex-MM-NN-slug
type: code-python  # o code-typescript, code-sql
title: "Título claro del ejercicio"
lesson_ref: lesson-MM-NN
difficulty: beginner  # o intermediate, advanced
estimated_time_minutes: 5
points: 10

description: >
  Descripción en 1-2 frases de qué debe hacer el alumno.

starter_code: |
  import os
  from anthropic import Anthropic

  client = Anthropic()

  # TODO: envía un mensaje al modelo y guarda la respuesta
  response = None

  print(response)

solution_code: |
  import os
  from anthropic import Anthropic

  client = Anthropic()

  response = client.messages.create(
      model="claude-haiku-4-5",
      max_tokens=100,
      messages=[{"role": "user", "content": "Hola Claude"}]
  )

  print(response.content[0].text)

test_cases:
  - id: test-01-response-exists
    description: "La respuesta no es None y tiene contenido"
    test_code: |
      exec(user_code)
      assert response is not None, "response debe tener valor"
      assert hasattr(response, 'content'), "response debe tener campo content"
    points: 5
  - id: test-02-model-used
    description: "Usa el modelo claude-haiku-4-5"
    test_code: |
      assert 'claude-haiku-4-5' in user_code
    points: 5

hints:
  - "Revisa la documentación de messages.create() en el SDK"
  - "El parámetro obligatorio es 'messages', una lista de dicts con 'role' y 'content'"
  - "Recuerda pasar max_tokens"

concepts:
  - messages-api
  - sdk-python
  - model-selection
```

### Ejercicio tipo quiz

```yaml
id: ex-MM-NN-slug
type: quiz
title: "Título del quiz"
lesson_ref: lesson-MM-NN
difficulty: beginner
estimated_time_minutes: 3
points: 20

config:
  passing_score: 70
  randomize_questions: false
  show_feedback: true
  allow_retry: true

questions:
  - id: q1
    type: multiple_choice
    question: "¿Qué tipo de API key necesitas para llamar a /v1/admin/organizations/me?"
    options:
      - id: a
        text: "Workspace API key (sk-ant-api03-...)"
      - id: b
        text: "Admin API key (sk-ant-admin01-...)"
      - id: c
        text: "Cualquiera de las dos funciona"
      - id: d
        text: "No requiere autenticación"
    correct: b
    feedback_correct: >
      Exacto. Los endpoints bajo /v1/admin/* requieren un Admin API Key
      (sk-ant-admin01-...) creado desde platform.claude.com → Admin keys.
      Una workspace key devolvería 401.
    feedback_incorrect: >
      La respuesta correcta es (b). Los endpoints de gestión de organización
      viven bajo /v1/admin/* y requieren un Admin API Key. Ver lección
      03-api-keys-workspace-vs-admin.md para la distinción completa.
    points: 10
```

## Estilo de escritura

### Idioma
- **Contenido**: español. "modelos", "mensajes", "respuesta" — no "models", "messages", "response".
- **Code identifiers**: inglés. `const message = ...`, `def send_request():`.
- **Términos técnicos propios del ecosistema**: se dejan en inglés la primera vez con definición, luego se usan tal cual. Ej: "prompt caching", "tool use", "stop_reason", "stream delta".

### Tono
- Directo. Segunda persona ("sabrás", "verás"), no impersonal.
- Sin relleno: "Como sabes..." / "Es importante destacar..." → eliminar.
- Admite incertidumbre cuando aplique: "A abril 2026 Anthropic no ha clarificado X" en lugar de inventar.

### Formato visual
- Bloques de código con lenguaje explícito (` ```bash`, ` ```ts`, ` ```python`, ` ```json`)
- XML tags internos (`<warning>`, `<terminology>`, `<ejemplo>`) para material denso — ayudan tanto al lector humano como a Claude cuando relee el material en sesiones futuras.
- Tablas para comparaciones. Bullets para listas cortas.
- Emojis solo en anti-patterns (❌ / ✅) — en ninguna otra parte.

## Modelos en ejemplos

Usa siempre **aliases estables**:

| Alias | Cuándo usarlo en ejemplos |
|---|---|
| `claude-haiku-4-5` | Default. La mayoría de ejercicios (cost efficient) |
| `claude-sonnet-4-6` | Producción: tool use, agentes, casos serios |
| `claude-opus-4-6` | Razonamiento profundo, extended thinking, ejemplos avanzados |

**Nunca** uses snapshots con fecha (`claude-opus-4-5-20251101`) en ejemplos genéricos. La única excepción es la lección específica del Módulo 1 que enseña versioning.

## Variables de entorno en código

- **Siempre** `process.env.ANTHROPIC_API_KEY` — nunca hardcoded
- **Admin keys**: `process.env.ANTHROPIC_ADMIN_API_KEY`
- Validar presencia al inicio del script:

```ts
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY no está definida. Copia .env.example a .env y completa tu key.');
  process.exit(1);
}
```

## Fuente oficial por lección

Cada lección termina con un link a `platform.claude.com/docs/...` en la sección de fuente oficial. Si el contenido sintetiza múltiples URLs, lista las más importantes (máximo 3).

## Commits (conventional commits)

- `feat: add module 3 lesson on XML tags`
- `feat(module-01): complete lesson 04 on streaming`
- `fix: correct endpoint URL in lesson 00-04`
- `docs: update architecture.md after pedagogy refinement`
- `chore: add new shared dataset for vision lesson`
- `refactor(module-05): restructure tool use exercises`

**Uno por unidad de contenido** — una lección, un commit. Un ejercicio, un commit (o junto con su lección). No hay commits masivos de "varios archivos del módulo X".
