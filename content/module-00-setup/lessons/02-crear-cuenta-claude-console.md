# Crear tu cuenta en Claude Console

## Objetivo

Al terminar esta lección tendrás una cuenta activa en `platform.claude.com`, entenderás la diferencia entre **organization** y **workspace**, y sabrás dónde aterriza tu cuenta por defecto.

## Concepto

### ¿Dónde vive Claude Console?

La plataforma developer de Anthropic vive en **`platform.claude.com`**. Este es el dashboard donde:

- Creas y gestionas API keys
- Pruebas prompts en el Workbench
- Gestionas archivos (Files API)
- Construyes y operas agentes hospedados (Managed Agents)
- Configuras Skills reutilizables
- Revisas analytics de consumo
- Administras tu organización (usuarios, workspaces, billing)

Es distinto de **`claude.ai`** (la app de chat para consumidores). Un arquitecto de Claude Code vive en `platform.claude.com`.

<terminology>

**Organization**: el contenedor top-level de tu cuenta en Anthropic. Una sola organization puede agrupar múltiples workspaces, múltiples miembros, un plan de billing, y políticas de IAM. Tu API Organization UUID (tipo `1fce3c9c-ec75-4c43-8e30-9d091b3f9def`) identifica unívocamente tu organization.

**Workspace**: una subdivisión lógica dentro de tu organization. Cada workspace tiene sus propias API keys, sus propios límites, y su propio tracking de uso. Útil para separar `production` de `staging`, o para aislar equipos. Cuando creas tu cuenta nueva, Anthropic te provisiona automáticamente un workspace llamado `Default`.

</terminology>

La distinción importa porque afecta **dónde** creas cada cosa. Los API keys normales (los que usas para llamar a `/v1/messages`) viven bajo un workspace específico. Los Admin API keys viven a nivel de organization. Los usage reports se pueden filtrar por workspace. Los límites de rate se aplican por workspace.

### Flujo de creación de cuenta

El signup es estándar: email + password o SSO con Google. Al terminar verificación de email, aterrizas en el dashboard. Lo que ves por primera vez:

- **Sidebar izquierdo** con secciones: `Build`, `Managed Agents`, `Analytics`, `Claude Code`, `Manage`
- **Dropdown superior izquierdo** que muestra `Default` — ese es tu workspace inicial
- **Botones destacados**: `Get started with agents`, `Generate a prompt`, `Get API Key`
- Tu nombre abajo con el rol `Admin` (eres admin porque creaste la organization)

### Organization vs Workspace — modelo mental

Piensa en tu organization como una empresa, y en los workspaces como departamentos:

```
Organization: "Acme Inc"  ←─ un solo plan, billing, admin keys
├── Workspace: "Production"       ←─ api keys reales para producción
├── Workspace: "Staging"          ←─ api keys de staging, rate limits menores
└── Workspace: "Research team"    ←─ api keys aisladas para experimentos
```

Cuando empiezas el curso, tu mundo es así de simple:

```
Organization: "Ulises Personal"
└── Workspace: "Default"
```

Eso basta para todo el curso **salvo el Módulo 11**, donde creamos workspaces adicionales para aprender a separar entornos y aplicar usage reports segmentados.

### El rol de Admin

Cuando creas una organization, eres automáticamente `Admin` de ella. Eso te permite:

- Crear, rotar y revocar API keys (incluyendo Admin Keys)
- Invitar y remover miembros
- Crear nuevos workspaces
- Ver usage y cost reports
- Configurar SSO (en planes enterprise)

Guarda tu password de admin en un gestor. Si perdieras acceso a la organization y no tienes otro admin, la recuperación depende del flujo de support de Anthropic.

## Ejecución real

Esta lección no ejecuta código, pero sí hace algo: creas tu cuenta de verdad.

**Paso 1 — Signup**

Abre [platform.claude.com](https://platform.claude.com) y crea tu cuenta. Usa un email personal si estás estudiando por tu cuenta; usa tu email corporativo solo si el curso es parte de tu trabajo formal y la empresa será dueña de la organization.

**Paso 2 — Verificar email**

Revisa tu bandeja, haz clic en el link de verificación. Aterrizas en el dashboard.

**Paso 3 — Explora visualmente el sidebar**

Solo explora. No hagas clic en "Get API Key" todavía — la siguiente lección (03) cubre API keys en profundidad y queremos que entiendas la distinción workspace vs admin antes de crear la primera.

**Paso 4 — Anota tu API Organization UUID**

Esto lo necesitarás para ejercicios posteriores. Lo obtienes llamando al endpoint `GET /v1/organizations/me` con un Admin API key (lo haremos en la Lección 03 y en el Módulo 11). Por ahora, solo ten presente que existe.

## Anti-patterns

- ❌ **Mezclar tu organization personal con una corporativa.** Si tu empresa te da presupuesto para Claude, pide que abran la cuenta corporativa a nombre de la empresa, no usando tu email personal. El dueño legal de la organization es quien creó la cuenta, y migrar propiedad después es doloroso.
- ❌ **Compartir credenciales de admin.** Usa SSO + roles cuando más de una persona necesite acceso. Nunca compartas la contraseña del admin — usa invitación de miembros y asigna el rol apropiado.
- ❌ **Ignorar el workspace.** Cuando llegues al Módulo 11, agradecerás haber entendido desde el día 1 que `Default` es solo un workspace. Muchos devs se confunden pensando que "workspace = cuenta" y al escalar a múltiples equipos se enredan.
- ❌ **Crear API keys antes de entender qué tipo necesitas.** Es la lección siguiente — no te adelantes.

## Recap

- Claude Console vive en `platform.claude.com` — distinto de `claude.ai` (chat para consumidores).
- **Organization** es el top-level (billing, admin, UUID). **Workspace** es subdivisión (API keys, rate limits, usage).
- Al crear cuenta, eres `Admin` de tu nueva organization y obtienes un workspace `Default`. Eso basta para todo el curso salvo el Módulo 11.

---

**Fuente oficial:** [platform.claude.com/docs/en/docs/initial-setup](https://platform.claude.com/docs/en/docs/initial-setup)
**Ejercicio:** (esta lección no tiene ejercicio directo; el quiz de la Lección 01 cubre los conceptos)
