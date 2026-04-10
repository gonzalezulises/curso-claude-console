# Módulo 11 — Admin API: Gobernanza

**Duración estimada:** 4 horas · **Lecciones:** 7 · **Ejercicios:** ~5 · **Modelo default del módulo:** `claude-haiku-4-5` (los ejemplos no consumen inferencia)

> ⚠️ **Seguridad del módulo**: todos los ejercicios consumen una **Admin API key** (`sk-ant-admin01-...`). La key se lee SIEMPRE de `ANTHROPIC_ADMIN_API_KEY` y nunca aparece en output. El primer ejercicio es una checklist de setup seguro antes de tocar cualquier endpoint.

## Objetivo del módulo

Al terminar sabrás operar tu organization Anthropic **programáticamente**: crear y archivar workspaces, rotar workspace keys a escala, invitar y remover miembros, generar **reportes de uso y costo** filtrables por workspace/modelo/tiempo, y diseñar una estrategia de **chargeback interno** para equipos.

## Prerrequisitos

- Módulo 0 (lección 03: tipos de keys)
- Módulos 1-2 para entender el contexto de lo que los reportes miden

## Arco narrativo

La Admin API es **el producto de gobernanza** que habilita operar Claude en una organización real con varios equipos. Sin esto, un CTO no puede responder "¿cuánto gastó cada equipo el mes pasado?" ni "¿por qué este workspace se disparó el martes?". Con esto, la respuesta es un `curl` o un script cron.

## Lecciones

1. **Admin API vs workspace API** — recap de la separación de la Lección 00-03, pero ahora con detalle: qué endpoints viven en cada una, scope de los permisos, por qué importa la separación.
2. **Setup seguro de Admin keys** — creación, almacenamiento (secret manager vs env var en máquinas de operadores), rotación, auditoría, principio de menor privilegio extremo para admin.
3. **Organizations: GET /v1/organizations/me y GET /v1/organizations/:id** — leer info de tu org, el UUID que anotaste en el Módulo 0.
4. **Workspaces: CRUD completo** — `/v1/organizations/workspaces`: listar, crear, archivar, actualizar. Casos prácticos (spinning up un workspace de staging, archivar uno obsoleto).
5. **Workspace API keys desde Admin API** — crear workspace keys programáticamente, listar, revocar, rotar a escala (script para rotar todas las keys cada X días).
6. **Usage reports y cost reports** — `/v1/organizations/usage_report`, `/v1/organizations/cost_report`, filtros por tiempo/workspace/modelo, granularidad, cómo parsear el resultado, limitaciones del rango de fechas.
7. **Lab: dashboard de chargeback** — script TS que lee cost_report filtrado por workspace y produce un reporte markdown mensual con costo por equipo y gráfico ASCII.

## Ejercicios planeados

- `ex-11-01-admin-key-safety.yaml` (quiz): verificar que el alumno sabe dónde debe/no debe vivir una admin key
- `ex-11-02-org-me.yaml` (code-python): llamar a /v1/organizations/me con admin key, parsear UUID + nombre
- `ex-11-03-crear-workspace.yaml` (code-python): crear un workspace `staging-test`, verificar que aparece, archivarlo al final del test
- `ex-11-04-rotar-keys.yaml` (code-python): script que lista keys de un workspace, crea nuevas, revoca las viejas (con safeguard de dry-run)
- `ex-11-05-cost-report.yaml` (code-python): generar reporte mensual filtrado por workspace en formato markdown

## Lab del módulo

**Dashboard de chargeback mensual** — el alumno construye un script Python que toma un rango de fechas, llama a `/v1/organizations/cost_report` con filtros por workspace, y produce un reporte markdown con:
- Tabla de costo total por workspace
- Tabla de costo por modelo dentro de cada workspace
- Gráfico ASCII de tendencia diaria
- Alertas si algún workspace excedió un threshold configurado

## Conceptos de arquitecto

- **Gobernanza como código**: lo que no se puede automatizar no se puede auditar. Scripts > clicks en el dashboard.
- **Principio de menor privilegio extremo** para admin keys: operador humano + máquina controlada + logs de uso
- **Chargeback interno** alinea incentivos: cada equipo ve su costo y optimiza sus propios prompts
- **Rotación programada** de keys es barata si la tenés scripted — y cara de olvidar si no

## Material externo referenciado

- `platform.claude.com/docs/en/api/admin-api/overview`
- `platform.claude.com/docs/en/api/admin-api/usage-cost/get-usage-report`
- `platform.claude.com/docs/en/api/admin-api/usage-cost/get-cost-report`
- `platform.claude.com/docs/en/api/admin-api/workspaces/create-workspace`

## Notas para la sesión de producción

- Los ejercicios tocan recursos reales de la org del alumno — incluir safeguards (dry-run default, confirmación explícita antes de revocar keys, usar nombres con prefijo `curso-` en workspaces creados).
- Los precios y formato del cost_report pueden cambiar — verificar al escribir.
- Reforzar en la introducción del módulo el incidente real que Ulises tuvo (pegar admin key en chat) como estudio de caso práctico.
