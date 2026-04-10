# CLAUDE.md — Instrucciones para Claude al trabajar este repo

Este archivo es el primer lugar donde Claude lee el contexto del repo. Léelo completo antes de hacer cualquier edición.

## Qué es este repo

Un megacurso técnico que enseña el ecosistema completo de Anthropic (platform.claude.com) a developers, llevándolos de cero a arquitectos de Claude Code. El repo contiene lecciones, ejercicios interactivos, playground scripts y documentación del propio curso.

**Audiencia:** developers backend/fullstack con experiencia en APIs HTTP y uno de (Node/TS o Python).
**Idioma del contenido:** español (code identifiers en inglés).
**Formato:** markdown puro para lecciones + YAML para metadata y ejercicios (compatible con Academia Rizoma).

Lee `course.yaml` y `COURSE_STATE.yaml` antes de producir contenido nuevo — especialmente `COURSE_STATE.yaml` que indica qué módulo toca trabajar a continuación.

## Convenciones no negociables

### Contenido
- **Nunca inventes rutas de UI** de `platform.claude.com`. Si no has visto un screenshot o no puedes verificar contra docs, di "no verificado" o pídele al usuario que comparta la pantalla. No fabricar menús.
- **Nunca inventes endpoints, headers o flags** de la API. Verifica con context7 (`/websites/platform_claude_en_api`) o con curl real antes de escribir el snippet.
- **Cada snippet de código en una lección debe ejecutarse contra la API antes de pegarlo.** No se pega output falso. Si no puedes ejecutar (por falta de key o feature beta sin acceso), márcalo explícitamente con `> **Nota:** output no verificado contra la API al momento de escribir esta lección.`
- **Modelos en ejemplos**: usar siempre aliases estables (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`). Nunca snapshots con fecha (`claude-opus-4-5-20251101`) excepto en la lección específica que explica versioning.
- **Costo**: default `claude-haiku-4-5` salvo que la lección requiera lo contrario.

### Formato de lección (5 secciones obligatorias)

Cada archivo `.md` en `content/module-XX/lessons/` tiene exactamente esta estructura:

```markdown
# Título de la lección

## Objetivo
Al terminar esta lección sabrás cómo [verbo + outcome].

## Concepto
[Teoría, 400-800 palabras. Usa XML tags internos si ayudan a estructurar
material denso: <terminology>, <ejemplo>, <warning>.]

## Ejecución real
[Snippet ejecutable con curl primero, luego TS/Python si aplica. Output
real pegado en bloque. El alumno debe poder copiar y correr.]

## Anti-patterns
[Lista corta de "qué NO hacer y por qué". Crítico para el salto a arquitecto.]

## Recap
- Takeaway 1
- Takeaway 2
- Takeaway 3

---
**Fuente oficial:** [URL canónica de platform.claude.com/docs/...]
**Ejercicio:** <!-- exercise:ex-XX-YY-slug -->
```

### Formato de ejercicio (YAML)

Los ejercicios viven en `content/module-XX/exercises/ex-MM-NN-slug.yaml` y siguen el schema de Academia Rizoma:

```yaml
id: ex-MM-NN-slug
type: code-python | code-typescript | code-sql | quiz
title: "Título del ejercicio"
lesson_ref: lesson-MM-NN
difficulty: beginner | intermediate | advanced
estimated_time_minutes: 5
points: 10

# Para code-*:
starter_code: |
  # código inicial
solution_code: |
  # solución
test_cases:
  - id: test-1
    description: "..."
    test_code: |
      assert ...
    points: 5
hints:
  - "pista progresiva 1"
  - "pista progresiva 2"
concepts: [lista, de, conceptos, cubiertos]

# Para quiz:
config:
  passing_score: 70
  randomize_questions: false
  show_feedback: true
questions:
  - id: q1
    type: multiple_choice | multiple_select | true_false
    question: "..."
    options:
      - id: a
        text: "..."
      - id: b
        text: "..."
    correct: a | [a, b]
    feedback_correct: "Explicación de por qué es correcto"
    feedback_incorrect: "Explicación de por qué la respuesta elegida falla"
    points: 10
```

### Naming

- Lecciones: `NN-kebab-case-descriptivo.md` (NN = 2 dígitos, 01-99)
- Ejercicios: `ex-MM-NN-kebab-slug.yaml` (MM módulo, NN orden)
- IDs YAML: `lesson-MM-NN`, `ex-MM-NN-slug`, `module-MM`

### Código

- TypeScript con `tsx` para ejecutar (`npx tsx archivo.ts`)
- Imports: `import Anthropic from '@anthropic-ai/sdk'`
- Python con `uv` para venvs
- **Jamás hardcodear keys** — siempre `process.env.ANTHROPIC_API_KEY`
- Comentarios en español, identifiers en inglés

### Commits

Conventional commits en inglés:
- `feat: add module 3 lessons on prompt engineering`
- `fix: correct usage.input_tokens field name in lesson 01-04`
- `docs: update COURSE_STATE after module 5 completion`
- `chore: reorganize shared schemas`

**Uno por lección o ejercicio completado**, no commits masivos.

## Workflow por sesión

1. **Lee `COURSE_STATE.yaml` primero** — te dice dónde quedamos.
2. **Lee `docs/roadmap.md`** — contexto de decisiones.
3. **Abre el OUTLINE.md del módulo en curso.**
4. **Produce como máximo 1 módulo completo por sesión** (regla del global CLAUDE.md de Ulises).
5. **Verifica cada snippet corriéndolo** antes de pegarlo.
6. **Actualiza `COURSE_STATE.yaml`** al terminar (campo `modules_state` y `last_session_summary`).
7. **Commit atómico** con conventional commit.
8. **Actualiza `docs/roadmap.md`** si terminaste un módulo.

## Gates de calidad

Antes de considerar una lección "completa":

- [ ] Tiene las 5 secciones (Objetivo, Concepto, Ejecución, Anti-patterns, Recap)
- [ ] El snippet corrió contra la API real y el output pegado es real
- [ ] Referencia `platform.claude.com/docs/...` al final
- [ ] Tiene al menos un ejercicio asociado con `<!-- exercise: -->`
- [ ] Usa modelo alias estable (no snapshot con fecha)
- [ ] No inventa endpoints, flags, features o rutas UI

Antes de considerar un ejercicio "completo":

- [ ] YAML válido (valida con `npm run validate-course`)
- [ ] Tiene `test_cases` reales (para code) o `feedback_correct`/`feedback_incorrect` (para quiz)
- [ ] La solución corre contra la API real si requiere API
- [ ] Cubre exactamente los conceptos de la lección asociada

## Cosas prohibidas

- ❌ Inventar rutas de menú en Claude Console que no hemos visto en screenshot
- ❌ Inventar endpoints o parámetros de la API sin verificar
- ❌ Pegar output falso o "plausible" — siempre output real
- ❌ Commitear el archivo `.env` real
- ❌ Exponer Admin API keys en código cliente o ejemplos (solo backend/server-side con env vars)
- ❌ Usar snapshots de modelos con fecha en ejemplos generales
- ❌ Producir más de 1 módulo completo por sesión (evita pérdida de calidad por fatiga de contexto)
- ❌ Referenciar features deprecadas sin marcarlas como tales (ej: prefill legacy)

## Cuando estés en duda

1. Primero: lee `docs/architecture.md` — la decisión probablemente ya está ahí.
2. Segundo: consulta `context7` con el libraryId `/websites/platform_claude_en_api`.
3. Tercero: ejecuta un `curl` real contra la API para validar.
4. Último recurso: pregunta al usuario con opciones concretas.
