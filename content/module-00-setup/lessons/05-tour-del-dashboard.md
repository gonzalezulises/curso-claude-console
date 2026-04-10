# Tour del dashboard de Claude Console

## Objetivo

Al terminar esta lección habrás recorrido **cada sección visible del sidebar de `platform.claude.com`**, sabrás **qué se hace en cada una**, y tendrás claro **en qué módulo del curso vamos a profundizar cada tema**. Este es el mapa que vas a consultar cada vez que te preguntes "¿dónde hago X?".

## Concepto

### Principio del tour

Este tour **solo describe secciones que existen en el dashboard actual**. Si no mencionamos algo, es porque (a) no está visible en tu cuenta, (b) es beta sin acceso general, o (c) es un subproducto que se cubre aparte (Claude Code, Admin API). No inventamos menús.

El sidebar del dashboard se agrupa en 5 grandes bloques. Los vamos a ver en orden de abajo hacia arriba de tu stack mental: **Build** → **Managed Agents** → **Claude Code** → **Analytics** → **Manage**.

### Bloque 1 — Build (el laboratorio de prompts y assets)

Aquí vive todo lo que necesitas para **iterar en prompts** y **gestionar los artefactos** que alimentan tus llamadas a la API.

**Workbench.** Es el playground oficial. Abres un prompt, lo editas, eliges modelo, parámetros (temperature, max_tokens, system prompt, tools, stop sequences), lo corres, ves la respuesta, iteras. Es el equivalente UI de lo que vas a hacer con curl y con el SDK — útil para prototipado rápido y para compartir un prompt con alguien del equipo sin pasar por código. Al final, el Workbench tiene un botón `Get code` que te da el snippet listo para copiar en tu app.

→ Profundidad en el **Módulo 2 (Workbench: El Laboratorio)**.

**Files.** Es donde vive la **Files API**: PDFs, imágenes, documentos que subes una vez y después referencias por `file_id` en múltiples llamadas. Evita tener que re-enviar el mismo binario en cada request. Cada file tiene un tamaño, un tipo MIME, y una fecha de expiración.

→ Profundidad en el **Módulo 4 (Capacidades Multimodales)**.

**Skills.** Es donde gestionas las **Skills reutilizables** — bundles (`SKILL.md` + scripts + assets) que enseñas a Claude una vez y que podés invocar desde cualquier conversación. Las hay de dos tipos: las que trae Anthropic (`pdf`, `docx`, `pptx`, `xlsx`) y las que subes vos. Requiere el beta header `skills-2025-10-02` para activarlas desde la API.

→ Profundidad en el **Módulo 8 (Skills: Capacidades Reutilizables)**.

### Bloque 2 — Managed Agents (agentes hospedados por Anthropic)

Esta es la familia más nueva del dashboard. Anthropic opera el runtime del agente por vos: conversación, memoria, contexto, uso de herramientas, persistencia de estado, aislamiento de ejecución.

**Quickstart.** Una página introductoria con plantillas para arrancar un agente rápido. Lo típico: pegas un system prompt, eliges herramientas básicas, y tenés un agente corriendo. Para aprender el concepto, útil; para producción, vas directo a los sub-recursos.

**Agents.** El listado de los agentes que vos definiste: cada uno con un nombre, modelo base, system prompt, set de tools, y una configuración de runtime. Crear un Agent acá es el equivalente a definir una "plantilla" reutilizable — después lanzás **sessions** contra esa plantilla.

**Sessions.** Una session es una **instancia en vivo** de un Agent. Mantiene el historial de la conversación, el estado de las tools que se ejecutaron, y la memoria de trabajo. Podés listar tus sessions activas, inspeccionar su estado, continuarlas o terminarlas.

**Environments.** El **sandbox** donde el agente ejecuta código. Contiene el sistema de archivos virtual, las credenciales montadas, las variables de entorno, y los límites de recursos. Es el equivalente a un container aislado por sesión.

**Credential vaults.** Donde guardás las credenciales (API tokens de terceros, claves SSH, cookies de sesión) que querés exponer **selectivamente** a un agente. El agente no ve la credencial en texto plano — la usa a través del vault. Esto es crítico para casos como "el agente necesita llamar a GitHub en nombre del usuario" sin exponer el token en el prompt.

→ Profundidad en el **Módulo 9 (Managed Agents: Agentes Hospedados)**. En ese módulo verificamos los endpoints contra la API en el momento de escribirlo, porque es beta activa (`managed-agents-2026-04-01`).

### Bloque 3 — Claude Code (la sección dedicada al CLI)

Dentro del dashboard hay una sección dedicada a **Claude Code**, el CLI + IDE extensions + SDK que usás para trabajar con código. Desde aquí podés ver métricas de uso específicas de Claude Code de tu organización, configuraciones a nivel org (si tu plan lo permite), y links a recursos.

No vas a instalar Claude Code desde esta pestaña — la instalación es con `npm install -g @anthropic-ai/claude-code` en tu terminal. Pero sí es el lugar donde vas a ver el consumo agregado de tu equipo.

→ Profundidad enorme en el **Módulo 10 (Claude Code: CLI & SDK)**. Es el módulo más grande del curso.

### Bloque 4 — Analytics

Aquí vive todo el tracking de uso y costo:

- **Consumo de tokens** por modelo, por workspace, por ventana de tiempo.
- **Costos** estimados en USD.
- **Número de requests**, latencias, errores por tipo.

La UI de Analytics te da la vista agregada para el dueño/operador. Cuando necesites **reportes programáticos** (chargeback interno, alerts, export a tu warehouse), vas a usar los endpoints de `/v1/organizations/usage_report` y `/v1/organizations/cost_report` de la **Admin API**.

→ Profundidad en el **Módulo 11 (Admin API: Gobernanza)**.

### Bloque 5 — Manage (la sección administrativa del workspace)

Este bloque en tu cuenta tiene **exactamente tres opciones**: `API keys`, `Limits` y `Workspace settings`. No hay más. Si ves artículos de blog o tutoriales que mencionan sub-secciones adicionales, probablemente están describiendo planes enterprise o versiones antiguas del dashboard.

**API keys.** El listado de keys del workspace actual. Botón `Create API key`. Cada key muestra su nombre, fecha de creación, última vez usada, y botón para revocar. También es la página donde viven las **admin keys** (en una sección aparte). Ya trabajaste aquí en la Lección 03.

**Limits.** Muestra los rate limits del workspace (requests per minute, input tokens per minute, output tokens per minute) desglosados por modelo. Acá confirmás en qué tier estás y qué headroom tenés antes de que Anthropic te responda `429 rate_limit_error`.

**Workspace settings.** Configuración básica del workspace: nombre, descripción, quién es owner, borrar workspace. Minimalista por diseño.

### Lo que **no** vas a encontrar en Manage (y dónde lo vas a encontrar)

- **Billing / payment method** — vive en otra sección de la cuenta (no en el sidebar de un workspace). Tiene sentido: el billing es a nivel organization, no workspace.
- **Members / invitaciones de equipo** — gestión de usuarios de la organization; también fuera del sidebar del workspace actual, y disponible vía Admin API (`/v1/organizations/invites`, `/v1/organizations/users`).
- **SSO config** — solo en planes enterprise; si no lo ves, no está habilitado en tu plan.
- **Audit logs** — solo en planes enterprise; accesibles vía Admin API cuando están habilitados.

Si alguna de estas cosas se vuelve urgente antes del Módulo 11, avisame y te guío al lugar correcto.

## Ejecución real

Esta lección no ejecuta API — ejecutás **navegación**. Pero sí hacés una cosa accionable: **listar los modelos disponibles en tu cuenta**.

```bash
curl -s https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

La respuesta es algo como:

```json
{
  "data": [
    { "type": "model", "id": "claude-opus-4-6",   "display_name": "Claude Opus 4.6",   "created_at": "2025-..." },
    { "type": "model", "id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6", "created_at": "2025-..." },
    { "type": "model", "id": "claude-haiku-4-5",  "display_name": "Claude Haiku 4.5",  "created_at": "2025-..." }
  ],
  "has_more": true,
  "first_id": "claude-opus-4-6",
  "last_id": "claude-haiku-4-5"
}
```

Confirmá que los tres aliases que vas a usar en el curso (`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`) aparecen en la lista. Si alguno falta, tu plan no lo tiene habilitado — avisa antes de seguir.

**Paso extra — recorrido guiado del dashboard**

1. Abre `platform.claude.com`.
2. Confirmá que arriba a la izquierda ves `Default` como workspace activo.
3. Click en **Workbench** (dentro de Build). Probá un prompt cualquiera contra `claude-haiku-4-5`. Dale `Run`. Vas a ver la respuesta renderizada, y abajo el botón `Get code`.
4. Click en **Files**. Si no subiste nada, la lista está vacía. Solo familiarizate con que existe — en el Módulo 4 la usamos.
5. Click en **Skills**. Vas a ver las skills de Anthropic que vienen pre-instaladas (`pdf`, `docx`, etc.). Solo explora.
6. Click en **Managed Agents → Quickstart** y leé la intro. No crees un agente todavía.
7. Click en **Analytics**. Si ya corriste curls de la Lección 03 y 04, vas a ver uso reciente reflejado (puede tardar unos minutos en aparecer).
8. Click en **Manage → API keys** y verificá que tu key `curso-local-dev` sigue ahí.
9. Click en **Manage → Limits** y anotá mentalmente los límites actuales de tu workspace. Son los que vas a respetar durante todo el curso.

## Anti-patterns

- ❌ **Crear recursos (Agents, Sessions, Files) desde el dashboard antes de entender qué son.** Crear una Session desde `Quickstart` mientras estás en el Módulo 0 solo genera ruido en tu Analytics y recursos que después no sabés cómo limpiar. Esperá al Módulo 9.
- ❌ **Confundir `Analytics` con la `Admin API`.** Analytics es una vista UI agregada del dueño del workspace. La Admin API es la fuente programática de reportes, filtrable por workspace/modelo/fecha, exportable a tu sistema. Cuando necesites chargeback o dashboards propios, vas a la Admin API (Módulo 11), no scrapees Analytics.
- ❌ **Asumir que lo que no está en el sidebar no existe.** Muchas cosas (billing, members, audit logs, SSO) viven en otras secciones de la cuenta o solo en la Admin API. Si necesitás algo y no lo ves en Manage, probablemente esté en `/v1/organizations/*` con una Admin key, no en el UI.
- ❌ **Asumir que el sidebar es el mismo para todos los planes.** Enterprise habilita secciones adicionales (audit logs, SSO config, advanced billing controls) que no vas a ver en un plan de developer. Si un tutorial menciona una sección que no ves, asumí diferencia de plan, no bug.

## Recap

- El sidebar de `platform.claude.com` tiene **5 bloques**: Build (Workbench / Files / Skills), Managed Agents (Quickstart / Agents / Sessions / Environments / Credential vaults), Claude Code, Analytics, y Manage (con exactamente 3 opciones: API keys, Limits, Workspace settings).
- Cada sección mapea a un módulo del curso — Workbench al 2, Skills al 8, Managed Agents al 9, Claude Code al 10, Analytics/Admin al 11.
- **Manage en tu workspace tiene 3 opciones, no más.** Billing, members, SSO y audit logs viven en otras secciones de la cuenta o solo en la Admin API. No inventes menús.

---

**Fuente oficial:** [platform.claude.com/docs/en/docs/overview](https://platform.claude.com/docs/en/docs/overview)
**Ejercicio:** <!-- exercise:ex-00-02-verificar-modelos -->
