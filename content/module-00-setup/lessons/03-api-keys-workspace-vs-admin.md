# API keys: workspace vs admin

## Objetivo

Al terminar esta lección sabrás **cuántos tipos de API keys existen en Anthropic**, **cómo se distinguen visualmente**, **dónde se crean**, **qué puede hacer cada una**, y **por qué mezclarlas es un error de seguridad serio**.

## Concepto

### Los dos tipos de key que importan hoy

Anthropic maneja dos familias distintas de API keys. La diferencia no es cosmética — cada una abre puertas a endpoints distintos, y confundirlas te puede costar caro.

<terminology>
**Workspace API key** — el prefijo es `sk-ant-api03-...`. Da acceso a los endpoints de **inferencia** (`/v1/messages`, `/v1/messages/count_tokens`, `/v1/messages/batches`, `/v1/files`, `/v1/models`, etc.). Vive **dentro de un workspace específico** y hereda sus rate limits. Es la key que tu aplicación backend usa en producción para hablar con los modelos.

**Admin API key** — el prefijo es `sk-ant-admin01-...`. Da acceso a los endpoints de **gobernanza** bajo `/v1/organizations/*` (leer info de la org, listar workspaces, crear/rotar/archivar workspace keys, generar reportes de uso y costo, gestionar miembros e invitaciones). Vive a **nivel de organization**, no de workspace. Es la key que un script de automatización usa para tareas administrativas.
</terminology>

Regla mental corta: **workspace key = runtime, admin key = IAM + billing**. Son dominios distintos.

### Tabla de diferencias

| Característica | Workspace key | Admin key |
|---|---|---|
| Prefijo visible | `sk-ant-api03-` | `sk-ant-admin01-` |
| Scope | Un solo workspace | Toda la organization |
| Endpoints habilitados | `/v1/messages`, `/v1/files`, `/v1/messages/batches`, `/v1/models`, … | `/v1/organizations/*` |
| Dónde se crea | **Manage → API keys** dentro del workspace | **Manage → API keys** sección "Admin keys" |
| Header usado | `x-api-key: sk-ant-api03-...` | `x-api-key: sk-ant-admin01-...` |
| Rate limits | Sí, los del workspace | Otros, de gobernanza |
| ¿Va en tu backend de producción? | Sí | **Nunca** |
| ¿Va en un script local puntual? | Sí | Solo con cuidado extremo |

### ¿Por qué la separación existe?

La separación es intencional y sigue el **principio de menor privilegio**. Una workspace key comprometida puede hacer que gastes tokens y que se filtren prompts, lo cual es malo pero contenible (rotas la key, el daño se detiene en ese workspace). Una admin key comprometida permite al atacante listar todos tus workspaces, crear workspaces fantasma, crear workspace keys nuevas sin que las veas, leer tus reportes de usage, invitar miembros, y en general tomar control administrativo de la organization. El blast radius es incomparable.

Por eso Anthropic **no te deja usar una admin key contra `/v1/messages`** y **no te deja usar una workspace key contra `/v1/organizations/*`**. No es que "no estén configuradas" — es que son tipos de credencial distintos, validados en la puerta del endpoint.

### ¿Dónde se crean, visualmente?

**Workspace keys.** En `platform.claude.com` entras a **Manage → API keys**. Ahí ves un listado de las keys del workspace actual (arriba a la izquierda del dashboard aparece el nombre del workspace — por default `Default`). El botón dice `Create API key`. Al crearla, Anthropic te muestra la key **una sola vez**; si la pierdes, la revocas y creas otra. No hay forma de recuperar una key ya ocultada.

**Admin keys.** Están en la **misma página** (`Manage → API keys`), pero en una sección separada llamada "Admin API keys" (o similar). Solo el rol `Admin` de la organization puede crearlas. Igual que las workspace keys, se muestran una única vez al crearse.

### Rotación y revocación

Rotar una key significa: crear una key nueva, actualizar tus secretos (`.env`, el secret manager, variables de CI, etc.), y **después** revocar la vieja. Nunca revoques antes de rotar, o vas a tener downtime.

Revocar es irreversible: la key deja de funcionar de inmediato. Esto es exactamente lo que quieres si una key se filtró. Rotación proactiva (cada pocos meses) es buena higiene incluso sin incidente.

## Ejecución real

**Paso 1 — Crear tu primera workspace key**

1. Abre `platform.claude.com`, asegúrate de que en el selector de workspace aparece `Default`.
2. En el sidebar, click en **Manage** → **API keys**.
3. Click en `Create API key`.
4. Dale un nombre descriptivo, por ejemplo `curso-local-dev`. El nombre es solo para tu organización mental, no afecta permisos.
5. Copia el valor completo (empieza con `sk-ant-api03-`) y pégalo en un gestor de contraseñas. Esta es tu última oportunidad de verla.

**Paso 2 — Guardarla como variable de entorno**

En tu terminal local, de forma **efímera** (solo para este paso, luego la pondrás en un `.env` en la Lección 06):

```bash
export ANTHROPIC_API_KEY='sk-ant-api03-...(tu key completa)...'
```

**Paso 3 — Verificarla con curl**

```bash
curl -s https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

Si la key es válida, ves una respuesta JSON con una lista de modelos disponibles, algo como:

```json
{
  "data": [
    { "id": "claude-opus-4-6",   "display_name": "Claude Opus 4.6",   "type": "model" },
    { "id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6", "type": "model" },
    { "id": "claude-haiku-4-5",  "display_name": "Claude Haiku 4.5",  "type": "model" }
  ],
  "has_more": true,
  "first_id": "claude-opus-4-6",
  "last_id": "claude-haiku-4-5"
}
```

Si en vez de eso obtienes un `401 authentication_error`, la key está mal escrita o ya fue revocada. Crea otra y vuelve a intentarlo.

**Paso 4 — (Opcional) Crear una admin key**

Solo si quieres adelantar material del Módulo 11. La admin key **no la vas a necesitar hasta entonces**, pero si la creas ahora:

1. En la misma página `Manage → API keys`, busca la sección de admin keys.
2. `Create admin key`, nómbrala `admin-curso`, cópiala a tu gestor.
3. Guárdala **en una variable distinta**: `ANTHROPIC_ADMIN_API_KEY`. **Jamás** en `ANTHROPIC_API_KEY`.
4. Verifícala con el único endpoint que va a responder:

```bash
curl -s https://api.anthropic.com/v1/organizations/me \
  -H "x-api-key: $ANTHROPIC_ADMIN_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

La respuesta te devuelve tu `uuid` y `name` de organization. Ese UUID es el que anotaste en la lección anterior.

**Verificación cruzada — confirma que no se pueden mezclar**

Intencionalmente intenta usar la workspace key contra el endpoint de admin:

```bash
curl -s https://api.anthropic.com/v1/organizations/me \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

Obtienes un error de autenticación. **Esto es bueno** — es la separación funcionando como debe. Lo mismo al revés: una admin key contra `/v1/messages` falla. Memorízalo: si recibes un 401 y estás seguro de que la key es válida, revisa que no hayas cruzado los cables de workspace y admin.

## Anti-patterns

- ❌ **Commitear una key a git.** Ni una vez. Ni en un branch "temporal". GitHub escanea keys públicas y Anthropic las revoca automáticamente, pero el momento en que la commiteaste ya la expusiste. Usa `.env` + `.gitignore` desde el minuto cero.
- ❌ **Pegar una key en un chat, issue, pull request o captura de pantalla.** Si lo haces por accidente, considera la key comprometida — rotala **de inmediato**, no "cuando tengas tiempo". Borrar el mensaje no basta porque el historial puede estar cacheado, indexado, o ya visto por bots.
- ❌ **Usar una admin key en código de cliente (frontend, app móvil, widget embebido).** Una admin key en un bundle público es la peor combinación posible — cualquier visitante puede descargar tu JS, extraer la key y tomar control administrativo de tu organization. Las admin keys **solo** viven en servidores controlados y en scripts locales de operadores humanos.
- ❌ **Usar una admin key donde bastaría una workspace key.** Principio de menor privilegio: si lo que vas a hacer es llamar al modelo, usa una workspace key, aunque la admin key "también funcionaría" (no lo hace para ese endpoint — pero aunque lo hiciera, seguiría siendo mala idea). Cada uso de admin key amplía su superficie de exposición.
- ❌ **Compartir una sola key entre todo tu equipo.** Cada humano o cada servicio debería tener su propia key, con un nombre que identifique al owner. Así cuando alguien se va del equipo, rotás solo su key; y cuando una key aparece en logs de abuso, sabés exactamente de dónde vino.
- ❌ **Revocar antes de rotar.** Crea la nueva key, despliega el cambio, verifica que todo funciona, **y recién después** revoca la vieja. Al revés tenés downtime innecesario.
- ❌ **Guardar la key en texto plano en un archivo de notas o en el portapapeles "un ratito".** Usa un gestor de contraseñas. El portapapeles lo leen muchas apps.

## Recap

- Hay **dos tipos de key**: workspace (`sk-ant-api03-...`) para inferencia, admin (`sk-ant-admin01-...`) para gobernanza. No son intercambiables — cada una habilita endpoints distintos.
- La separación es una aplicación del **principio de menor privilegio**. Una admin key comprometida es catastrófica; una workspace key comprometida es contenible.
- **Nunca commitees keys**, nunca las pegues en chats, nunca uses admin keys en código de cliente. Si una se filtra, **rota inmediatamente** — crear una nueva, desplegar, después revocar la vieja.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/admin-api/overview](https://platform.claude.com/docs/en/api/admin-api/overview)
**Ejercicio:** <!-- exercise:ex-00-04-crear-y-rotar-key -->
