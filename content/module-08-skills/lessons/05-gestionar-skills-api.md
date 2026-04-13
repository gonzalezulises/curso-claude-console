# Gestionar skills desde la API: versiones, list, delete

## Objetivo

Al terminar esta lección vas a saber operar todo el lifecycle de tus skills custom desde la API: listar con filtros, crear nuevas versiones sin romper clientes existentes, borrar versiones y skills enteras, y entender qué pasa (y qué no) en `claude.ai` / dashboard versus el endpoint `/v1/skills`.

## Concepto

### Los endpoints completos

La API de Skills expone siete endpoints. Todos usan **API key normal** (no Admin API key), van al host `api.anthropic.com`, y requieren el beta header `skills-2025-10-02`:

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/v1/skills` | Crear skill (multipart upload) |
| `GET` | `/v1/skills` | Listar skills (acepta `?source=custom` o `?source=anthropic`) |
| `GET` | `/v1/skills/{skill_id}` | Obtener metadata de una skill |
| `DELETE` | `/v1/skills/{skill_id}` | Eliminar skill (requiere borrar sus versiones primero) |
| `POST` | `/v1/skills/{skill_id}/versions` | Crear nueva versión de una skill existente |
| `GET` | `/v1/skills/{skill_id}/versions` | Listar versiones |
| `DELETE` | `/v1/skills/{skill_id}/versions/{version_id}` | Eliminar una versión específica |

El scope es **workspace-wide**: todos los miembros del workspace ven las mismas custom skills. A diferencia de `claude.ai` (donde las skills son per-user), el API centraliza.

### Listar con filtros

```bash
curl -sS "https://api.anthropic.com/v1/skills?source=custom" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

Filtros útiles:

- `?source=anthropic` — solo las pre-built. Útil para descubrir qué hay oficial (puede crecer).
- `?source=custom` — solo las tuyas del workspace.
- Sin filtro — todas.

La respuesta es paginada (`has_more`, `next_page`). Con pocas skills en tu workspace nunca vas a ver paginación, pero el shape está listo para cuando lo necesites.

### Versionado: inmutabilidad por diseño

Este es el concepto clave del lifecycle. **Las versiones son inmutables**. No podés "editar" la versión `1776051615584191`. Podés:

1. Crear una versión nueva (que obtiene un nuevo timestamp).
2. Borrar la versión vieja si ya no la necesitás.

Esto garantiza que si una request en producción usa `version: "1776051615584191"`, la respuesta va a ser reproducible indefinidamente (hasta que borres esa versión explícitamente).

Crear nueva versión:

```bash
curl -sS -X POST "https://api.anthropic.com/v1/skills/skill_01ABC.../versions" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "files[]=@my-skill/SKILL.md;filename=my-skill/SKILL.md" \
  -F "files[]=@my-skill/scripts/validate.py;filename=my-skill/scripts/validate.py"
```

No hay `display_title` acá — se hereda del skill padre. Solo cambiás los archivos. El response incluye el nuevo `id` de versión (timestamp) y el `skill_id` padre.

### El workflow típico de iteración

En un ciclo maduro de desarrollo de skills vas a tener:

```
1. Subir v1 inicial (version = 1776051615584191)
2. Validar con casos reales → detectar edge case
3. Editar SKILL.md local → agregar regla para el edge case
4. Subir v2 (version = 1776058192749834)
5. Actualizar el código que invoca la skill: version "latest" o fijar v2.
6. (Opcional) Borrar v1 para ahorrar storage cuando ya nada la usa.
```

En producción, **no uses `"latest"`** en clientes que requieren reproducibilidad: una v3 con bug haría breaking al runtime. El patrón defensivo es:

- Dev/staging: `version: "latest"` para siempre probar la última.
- Prod: `version: "1776058192749834"` (pin explícito). Upgradeás con un deploy.

### Borrar: el orden correcto

`DELETE /v1/skills/{id}` falla si la skill tiene versiones activas. El orden es:

```bash
# 1. Listar versiones para ver qué borrar
curl -sS "https://api.anthropic.com/v1/skills/skill_01ABC.../versions" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"

# 2. Borrar cada versión
curl -sS -X DELETE "https://api.anthropic.com/v1/skills/skill_01ABC.../versions/1776051615584191" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"

# 3. Ahora sí borrar la skill
curl -sS -X DELETE "https://api.anthropic.com/v1/skills/skill_01ABC..." \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

Las respuestas de DELETE son mínimas:

```json
{"type":"skill_version_deleted","id":"1776051615584191"}
{"type":"skill_deleted","id":"skill_01GypGoWmaCLwjXBhyFwsXtX"}
```

### Dashboard vs. API: qué verifica qué

- **API (`/v1/skills`)**: fuente de verdad para skills que usás desde Messages API. Workspace-scoped.
- **`claude.ai` → Settings → Features**: upload de skills para el **chat de claude.ai**, per-user. Acepta zip. **No sincroniza con el API.**
- **Platform dashboard** (`platform.claude.com`): ubicación UI exacta de la sección de skills **no verificada** en esta lección (no tenemos screenshot oficial al escribir). Para confirmar, consultá tu workspace. De todos modos, la API es suficiente para todo el lifecycle.

El error de principiante: subir la skill en `claude.ai` y después invocarla vía API esperando que esté disponible. No está — son storages separados.

### Lifecycle distinto al de Claude Code

Una última distinción crítica para evitar confusión entre módulos. En **Claude Code**, las skills no tienen lifecycle de API: son archivos en disco en `~/.claude/skills/` (personales) o `.claude/skills/` (por proyecto). Crear, editar, borrar = `cp`, `vim`, `rm`. No hay versionado automático (podés hacer el tuyo con git). No hay workspace compartido (es filesystem del usuario o del repo).

Resumen mental:

| Superficie | Versionado | Visibilidad | Storage |
|-----------|------------|-------------|---------|
| Claude API | API-based, immutable versions | Workspace | Anthropic servers |
| Claude Code | Manual (git recomendado) | Filesystem del user/proyecto | Local disk |
| claude.ai | Upload manual, per-user | User-only | Anthropic servers |

## Ejecución real

Ciclo completo de gestión sobre la skill `greeting-demo` que creamos antes:

```bash
# 1. Listar para confirmar que está
curl -sS "https://api.anthropic.com/v1/skills?source=custom" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

```json
{
  "data": [
    {
      "type": "skill",
      "id": "skill_01GypGoWmaCLwjXBhyFwsXtX",
      "display_title": "greeting-demo",
      "source": "custom",
      "latest_version": "1776051615584191",
      "created_at": "2026-04-13T03:40:16.371070Z",
      "updated_at": "2026-04-13T03:40:16.371184Z"
    }
  ],
  "has_more": false,
  "next_page": null
}
```

```bash
# 2. Borrar la versión (requerido antes de borrar la skill)
curl -sS -X DELETE "https://api.anthropic.com/v1/skills/skill_01GypGoWmaCLwjXBhyFwsXtX/versions/1776051615584191" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

```json
{"type":"skill_version_deleted","id":"1776051615584191"}
```

```bash
# 3. Borrar la skill padre
curl -sS -X DELETE "https://api.anthropic.com/v1/skills/skill_01GypGoWmaCLwjXBhyFwsXtX" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

```json
{"type":"skill_deleted","id":"skill_01GypGoWmaCLwjXBhyFwsXtX"}
```

Observá: los dos DELETE devuelven 200 con el `type` indicando la operación. Si tratás de borrar la skill antes que las versiones, el API responde con un error detallando la dependencia.

## Anti-patterns

- ❌ **Usar `version: "latest"` en producción sin plan de rollback**. Si subís una v2 con regresión, tus clientes la consumen inmediatamente. En prod pineá versiones explícitas.
- ❌ **Borrar la skill antes que sus versiones**. El endpoint `DELETE /v1/skills/{id}` rechaza si quedan versiones. Borrá primero versiones, después padre.
- ❌ **Asumir sync entre claude.ai y API**. Cada superficie tiene su storage. Si querés una skill en las tres (API, claude.ai, Claude Code), subila/copiala a cada una.
- ❌ **Versionar editando directo el `SKILL.md` sin subir**. Lo que vive en tu disco no afecta al API hasta que hacés `POST /v1/skills/{id}/versions`. Es un error common confundir el edit local con el "deploy".
- ❌ **Dejar decenas de versiones viejas acumuladas**. Cada una ocupa storage. Hacé cleanup periódico de versiones >N meses sin uso.
- ❌ **Confundir `skill_id` con `display_title`**. En los paths de API siempre va el `id` (empieza con `skill_01...` para custom o literal `pdf`/`xlsx`/etc. para anthropic). El `display_title` es solo label humano.

## Recap

- La API expone siete endpoints para lifecycle completo: create, list, get, delete; plus versions/create, versions/list, versions/delete.
- Las **versiones son inmutables**: nuevos cambios = nueva versión, nunca edit in-place.
- Filtros de listado útiles: `?source=custom` y `?source=anthropic`.
- Orden de borrado: primero versiones, luego skill padre.
- Skills custom del API son **workspace-wide**; las de `claude.ai` son per-user; las de Claude Code son filesystem-based. No sincronizan.
- En producción, pineá `version` explícita; `"latest"` es aceptable en dev/staging.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/skills-guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
**Ejercicio:** <!-- exercise:ex-08-03-upload-skill -->
