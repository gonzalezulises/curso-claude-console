# Arquitectura del curso

Este documento explica las **decisiones pedagógicas y técnicas** detrás del curso, y el porqué de cada una. Si estás pensando en cambiar algo estructural, lee esto primero.

## Principio rector

> El curso forma **arquitectos**, no usuarios. El foco no es "cómo usar el botón X" sino "cómo decidir qué herramienta usar, cuándo, y por qué".

Esta distinción está en cada lección: Concepto + Anti-patterns + Recap. La sección **Anti-patterns** es el cambio más importante — la mayoría de cursos dicen qué hacer, pocos dicen qué NO hacer. El salto a arquitecto está en reconocer patrones incorrectos.

## Decisiones pedagógicas

### Decisión 1 — Protocolo HTTP primero, SDK después

Cada concepto se presenta primero con `curl` contra la API cruda, y solo después con el SDK de TypeScript o Python.

**Razones:**
- El SDK se puede reemplazar; el protocolo HTTP es estable (`anthropic-version: 2023-06-01` desde hace años).
- El alumno que entiende el protocolo puede debuggear cualquier SDK roto, escribir clientes custom, y razonar sobre networking (retries, streaming, rate limits).
- Es el approach oficial de Anthropic en sus propias docs.

**Trade-off aceptado:** más fricción inicial (el alumno escribe más). Lo compensamos porque después del Módulo 1 puede moverse muy rápido.

### Decisión 2 — TypeScript como stack primario, Python como secundario

**TypeScript** es el default para labs porque:
- El Claude Agent SDK es first-class en TS y tiene paridad con Python.
- Claude Code mismo corre sobre Node.
- El ecosistema MCP (`@modelcontextprotocol/sdk`) es canónicamente TypeScript.
- La audiencia target del curso (developer que quiere ser arquitecto de Claude Code) probablemente ya está en el stack web.

**Python** aparece cuando es idiomático:
- Batch processing y análisis de usage reports
- RAG / embeddings / pipelines de datos
- Notebooks exploratorios
- Cualquier escenario donde el ecosistema ML es más maduro en Python

**No hacemos dual-track** (cada lab en ambos lenguajes) porque duplica el costo de mantenimiento sin proporcional beneficio pedagógico.

### Decisión 3 — Formato compatible con Academia Rizoma

El contenido usa:
- **YAML** para metadata (`course.yaml`, `module.yaml`)
- **Markdown puro** para lecciones (sin MDX, sin componentes custom)
- **YAML independiente** para ejercicios (`code-python`, `code-sql`, `quiz`)
- **Embeds** como comentarios HTML: `<!-- exercise:ex-00-01-slug -->`

Esto es 1:1 con el patrón de `academia-rizoma`. Si el curso se migra a esa plataforma en el futuro, no hay transformación — solo copy-paste.

Ver [`migration-to-rizoma.md`](./migration-to-rizoma.md) para el plan de portabilidad.

### Decisión 4 — Cinco secciones obligatorias por lección

Cada lección tiene exactamente:

1. **Objetivo** — ancla de aprendizaje, 1 frase con verbo outcome
2. **Concepto** — teoría, 400-800 palabras
3. **Ejecución real** — código que el alumno corre contra su API key
4. **Anti-patterns** — qué evitar y por qué
5. **Recap** — 3 takeaways

**Por qué esta estructura:**
- Objetivo al inicio activa el esquema mental.
- Concepto da la teoría *antes* de ejecutar — evita aprender por imitación ciega.
- Ejecución real consolida con memoria muscular.
- Anti-patterns es el diferenciador del curso.
- Recap es el cierre de sesión que ayuda a retención.

### Decisión 5 — Verificación obligatoria de snippets

Ningún snippet se escribe sin haberlo ejecutado antes contra la API real. Esto es una **regla de producción**, no una sugerencia.

**Razón:** la documentación de Anthropic evoluciona rápido (nuevos modelos cada pocos meses, beta headers, features deprecadas). Un curso con ejemplos copy-paste de docs viejas es peor que no tener curso.

**Cómo se aplica:**
- El autor corre cada snippet antes de pegarlo
- El output pegado en la lección es el output real
- Si algo no se pudo verificar (feature beta sin acceso), se marca explícitamente con `> **Nota:** output no verificado al escribir esta lección`
- Los cambios en docs se trackean vía issues y se aplican al escribir cada módulo

### Decisión 6 — Un módulo completo por sesión de producción

Regla operativa: máximo un módulo completo por sesión de Claude. El resto se planifica con `OUTLINE.md` y se materializa en sesiones futuras.

**Razón:** fatiga de contexto. Después de ~50 mensajes con el mismo modelo en la misma sesión, la calidad baja notablemente. Preferimos módulos bien pulidos sobre volumen.

**Cómo se aplica:**
- `COURSE_STATE.yaml` es el contrato de continuidad entre sesiones
- Cada sesión empieza leyéndolo
- Al terminar se actualiza con el progreso

### Decisión 7 — Modelos alias estables en ejemplos

Los ejemplos usan siempre `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` (aliases estables), nunca snapshots con fecha (`claude-opus-4-5-20251101`).

**Razón:** los aliases apuntan automáticamente al último snapshot del modelo. Un curso con snapshots fechados queda obsoleto en semanas.

**Excepción:** la lección específica del Módulo 1 que explica el sistema de versioning muestra snapshots fechados intencionalmente para enseñar la diferencia.

## Decisiones técnicas

### Por qué `tsx` en lugar de `ts-node` o build step

- `tsx` ejecuta TypeScript directamente sin pre-compilación ni configuración adicional.
- Cero fricción para el alumno: `npx tsx archivo.ts` y corre.
- Compatible con ESM nativo (el curso usa `"type": "module"`).
- No requiere entender `tsconfig` a fondo.

### Por qué `uv` para Python

- Gestión de venvs 10x más rápida que `venv + pip`.
- Mismo tool que usa el autor (consistencia con su entorno).
- No requiere activación manual del venv para correr scripts (`uv run`).

### Por qué YAML y no JSON para metadata

- Comentarios (`#`) — críticos para explicar campos no triviales
- Menos ruido visual que JSON en archivos largos
- Soporte nativo de multiline strings (`>`, `|`)
- Academia Rizoma ya lo usa (portabilidad)

### Por qué no hay CI/CD en este repo (todavía)

Para la fase de producción inicial, el curso se valida con `npm run validate-course` manualmente. Cuando el módulo 10 (Claude Code) se escriba, ese mismo módulo va a enseñar cómo configurar GitHub Actions + Claude Code en CI/CD, y ese será el momento natural para agregar el propio workflow al repo — comiéndonos nuestra propia comida de perro.

## Anti-decisiones (lo que explícitamente no hacemos)

- ❌ **No hay servidor de cursos.** El repo es contenido, no aplicación. El runtime es lo que el alumno elija (filesystem local, Rizoma, cualquier LMS que parsee YAML+MD).
- ❌ **No hay videos.** El contenido es texto + código + ejecución. Los videos envejecen 10x más rápido y son imposibles de corregir en PR.
- ❌ **No hay "Claude hizo esto por mí".** El alumno ejecuta. No hay demo muerto.
- ❌ **No hay certificados.** Es un curso autodidacta. El capstone del Módulo 12 es la prueba natural.
- ❌ **No hay gamification superficial** (streaks, XP). Sí hay `points` en ejercicios porque el schema de Rizoma los tiene y puede servir para tracking futuro, pero no son el foco.
