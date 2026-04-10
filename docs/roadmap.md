# Roadmap de producción del curso

Tracker vivo del progreso. Actualiza esto al terminar cada módulo.

## Estado global

| Métrica | Valor |
|---|---|
| Módulos totales | 13 (0-12) |
| Módulos completos | 1 (Módulo 0) |
| Módulos con outline | 12 (1-12) |
| Lecciones escritas | 6 / 110 |
| Ejercicios escritos | 4 / ~80 |
| Última actualización | 2026-04-10 |

## Plan por sesión

### Sesión 1 — COMPLETADA (2026-04-10)
- ✅ Investigación profunda de docs de Anthropic (5 reportes paralelos)
- ✅ Validación cruzada con context7
- ✅ Estructura del repo + convenciones
- ✅ `course.yaml`, `COURSE_STATE.yaml`, `README.md`, `CLAUDE.md`
- ✅ Docs: architecture, conventions, roadmap, migration-to-rizoma
- ✅ Playground: `verify-setup.ts`, `01-hello-claude.ts`
- ✅ Módulo 0 completo (6 lecciones + 4 ejercicios)
- ✅ 12 OUTLINE.md (módulos 1-12)
- ✅ Repo privado en GitHub

### Sesión 2 — Módulo 1: Messages API
- [ ] Verificar context7 para features actuales de /v1/messages
- [ ] Escribir 10 lecciones
- [ ] Escribir ~7 ejercicios (code-ts primario)
- [ ] Lab del módulo: construir un chat CLI en TS
- [ ] Actualizar `COURSE_STATE.yaml`
- [ ] Commit `feat(module-01): complete messages api fundamentals`

### Sesión 3 — Módulo 2: Workbench
- [ ] Requiere screenshots del Workbench real (el autor debe compartirlos)
- [ ] 6 lecciones + ~4 ejercicios
- [ ] Lab: iterar prompt de extracción estructurada

### Sesión 4 — Módulo 3: Prompt Engineering de Arquitecto
- [ ] 9 lecciones (las 8 técnicas Claude 4 + síntesis)
- [ ] ~7 ejercicios con eval antes/después
- [ ] Lab: reescribir 5 prompts malos a patterns óptimos

### Sesión 5 — Módulo 4: Capacidades Multimodales
- [ ] Requiere dataset de PDFs + imágenes en `shared/datasets/`
- [ ] 7 lecciones
- [ ] Lab: extractor de datos de facturas PDF con citations nativas

### Sesión 6 — Módulo 5: Tool Use
- [ ] 10 lecciones (tool use es denso)
- [ ] Server-side tools: bash, code execution
- [ ] Lab: agente que consulta DB parametrizada + API clima

### Sesión 7 — Módulo 6: Optimización & Producción
- [ ] Requiere benchmarks reales de costo con caching vs sin caching
- [ ] 8 lecciones
- [ ] Lab: reducir 70% el costo de un caso real

### Sesión 8 — Módulo 7: MCP
- [ ] 10 lecciones
- [ ] Lab: construir un MCP server custom en TypeScript + conectarlo a Claude API y Claude Code

### Sesión 9 — Módulo 8: Skills
- [ ] 6 lecciones
- [ ] Lab: crear skill custom para el dominio del alumno

### Sesión 10 — Módulo 9: Managed Agents
- [ ] **Pre-requisito: verificar endpoints con curl real** (endpoints reportados por subagent en sesión 1, menos verificados)
- [ ] 10 lecciones
- [ ] Lab: agente multi-sesión con vault + environment

### Sesión 11 — Módulo 10: Claude Code
- [ ] 14 lecciones (módulo más largo)
- [ ] Lab: setup completo de proyecto con subagents + hooks + CI/CD
- [ ] Aquí también se agrega GitHub Actions al propio repo del curso (dogfooding)

### Sesión 12 — Módulo 11: Admin API
- [ ] 7 lecciones
- [ ] Todos los ejercicios usan `process.env.ANTHROPIC_ADMIN_API_KEY`
- [ ] Lab: dashboard Next.js de consumo con chargeback por workspace

### Sesión 13 — Módulo 12: Capstone
- [ ] 8 lecciones de arquitectura + capstone
- [ ] Capstone real: ej. agente automatiza PR reviews con reportes ejecutivos

### Sesión 14 — Revisión y polish
- [ ] Pasada completa de auditoría con subagent `auditor`
- [ ] Verificar que todos los snippets aún corren (la docs cambia)
- [ ] Actualizar referencias a modelos si salió nueva versión
- [ ] Preparar para apertura pública (cambiar repo a público + licencia)

## Decisiones pendientes

- [ ] **Licencia**: ¿Creative Commons BY-SA? ¿MIT? ¿propietaria? Decidir antes de público.
- [ ] **Publicación**: ¿solo repo, subir a Academia Rizoma, o ambos?
- [ ] **Traducciones**: ¿en algún momento al inglés? No prioritario.
- [ ] **Video complementario**: no planeado por ahora pero puede surgir.

## Métricas objetivo al terminar

- 110 lecciones escritas
- ~80 ejercicios ejecutables
- 100% de snippets verificados contra la API real
- 0 endpoints/features inventados
- Todos los módulos cierran con un lab práctico
- Módulo 12 tiene un capstone completo que combina conocimientos de los 11 módulos previos
