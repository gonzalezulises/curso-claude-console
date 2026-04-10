# Módulo 8 — Skills: Capacidades Reutilizables

**Duración estimada:** 3 horas · **Lecciones:** 6 · **Ejercicios:** ~4 · **Modelo default del módulo:** `claude-sonnet-4-6`

## Objetivo del módulo

Al terminar entenderás qué es una **Skill** (bundle reutilizable de `SKILL.md` + scripts + assets que enseña a Claude a hacer algo específico), diferenciarás las skills que **Anthropic provee** (`pdf`, `docx`, `pptx`, `xlsx`) de las **custom** que subís vos, usarás el beta header `skills-2025-10-02` para activarlas desde la API, y sabrás cuándo Skills es mejor que un prompt largo o un tool custom.

## Prerrequisitos

- Módulo 5 (tool use)
- Módulo 7 (MCP — Skills se parece pero tiene lifecycle distinto)

## Arco narrativo

Skills es la abstracción **intermedia** entre "prompt en línea" y "server MCP completo". Si tenés una capacidad que usás muchos prompts y que involucra instrucciones + helper scripts + assets, Skills es el lugar donde vive, versionada, gestionada por Anthropic, invocable desde Messages API y desde Claude Code.

## Lecciones

1. **Qué es una Skill y cuándo usarla** — comparación con: prompt inline, tool use artesanal, MCP server. Cuándo es cada uno.
2. **Anatomía de una Skill: `SKILL.md` + scripts + assets** — estructura de directorio, metadata, cómo Claude "descubre" capacidades de la skill.
3. **Skills de Anthropic: `pdf`, `docx`, `pptx`, `xlsx`** — qué hace cada una, cómo se invocan, activar con header beta.
4. **Crear tu primera skill custom** — bootstrap del folder, `SKILL.md` con descripción + pre/post-conditions + ejemplos, upload a Anthropic.
5. **Gestionar skills desde el dashboard y desde la API** — sección Build → Skills, endpoints de upload/list/delete.
6. **Lab: skill para generar reportes markdown con charts** — el alumno crea una skill que Claude puede invocar para producir reportes en markdown estandarizados con gráficos embebidos.

## Ejercicios planeados

- `ex-08-01-skills-anthropic.yaml` (code-typescript): invocar la skill `pdf` de Anthropic y obtener texto estructurado de un PDF
- `ex-08-02-skill-md.yaml` (code-typescript): escribir un `SKILL.md` válido para una skill trivial
- `ex-08-03-upload-skill.yaml` (code-typescript): upload via API, verificar que aparece en list
- `ex-08-04-lab-reportes.yaml` (code-typescript): el lab

## Lab del módulo

**Skill de reportes markdown** — el alumno crea una skill `markdown_report` con un `SKILL.md` que enseña a Claude el formato estándar de reportes de su organización (headers, metadatos YAML, formato de gráficos). Después llama a Claude con la skill activa y con datos de input, y obtiene un reporte que cumple exactamente el formato definido.

## Conceptos de arquitecto

- Skills ≠ tools: una skill enseña un **proceso completo** (instrucciones + código + assets), no una sola función
- Las skills son **reutilizables entre conversaciones y entre productos** — el mismo bundle funciona en Messages API y en Claude Code
- Si tu prompt tiene >50 líneas de instrucciones y las repetís en N llamadas, probablemente sea una Skill
- Versionado: las skills se archivan, no se sobrescriben — garantía de reproducibilidad

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/skills`

## Notas para la sesión de producción

- Beta header `skills-2025-10-02` — verificar al escribir.
- Verificar que la lista de skills de Anthropic (pdf/docx/pptx/xlsx) sigue igual.
- El lab del módulo puede ser buen ejemplo para portar después a Claude Code como skill de proyecto.
