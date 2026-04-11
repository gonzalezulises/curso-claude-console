# Setup local: Node + Python + SDK

## Objetivo

Al terminar esta lección tendrás **Node.js 20+ y Python 3.11+ instalados**, el **SDK oficial de Anthropic** en ambos lenguajes listo para usar, tu **`.env` local con las keys cargadas**, y habrás corrido **`playground/verify-setup.ts`** con éxito para confirmar que todo funciona end-to-end.

## Concepto

### ¿Por qué Node Y Python?

Este curso usa **TypeScript/Node como stack primario** por varias razones:

- El **Claude Agent SDK** es first-class en TypeScript.
- **Claude Code** (el CLI que vas a dominar en el Módulo 10) corre sobre Node.
- El **MCP SDK** canónico de referencia está en TypeScript.
- `tsx` te deja ejecutar TypeScript sin build step — ideal para scripts didácticos.

Y **Python como stack secundario** cuando es más natural:

- **Batch processing** y pipelines de datos (Módulo 6).
- **Notebooks exploratorios** para ejercicios de vision y RAG (Módulo 4).
- **Scripts de la Admin API** donde Python tiende a ser más expresivo para data munging (Módulo 11).

No necesitás saber Python bien para completar el curso — los scripts en Python que vas a correr son cortos y están explicados línea por línea cuando aparezcan. Pero sí necesitás tenerlo instalado.

### Versiones mínimas requeridas

<terminology>
**Node.js 20+** — LTS actual al momento de escribir este curso. El SDK de Anthropic y Claude Code requieren fetch nativo y Web Streams API, disponibles desde Node 18, pero 20 es el baseline recomendado.

**Python 3.11+** — porque el SDK oficial `anthropic` usa features modernas de typing y async. 3.11 también mejora significativamente el rendimiento de asyncio.

**`uv`** — gestor de venvs y dependencias de Python, 10-100x más rápido que `pip + venv`. Si ya usás `uv`, perfecto; si no, lo instalamos en el Paso 3.
</terminology>

### ¿Qué vamos a instalar?

| Componente | Lenguaje | Cómo | Para qué |
|---|---|---|---|
| Node 20+ | — | Homebrew (macOS) o nvm | Ejecutar TS + tsx + Claude Code |
| `@anthropic-ai/sdk` | TS | npm dep del repo | Llamar a Claude desde TS |
| `dotenv` | TS | npm dep del repo | Cargar `.env` automáticamente |
| `tsx` | TS | npm devDep del repo | Correr TS sin build |
| Python 3.11+ | — | Homebrew (macOS) | Ejecutar scripts Python |
| `uv` | — | curl installer oficial | Gestión de venvs Python |
| `anthropic` (Python) | Py | `uv pip install anthropic` | Llamar a Claude desde Python |

Las dependencias TS/Node ya están declaradas en el `package.json` del repo. Solo tenés que correr `npm install`.

## Ejecución real

**Paso 1 — Verificar Node**

```bash
node --version
```

Si ves `v20.x.x` o mayor, estás listo. Si ves algo menor (o "command not found"), instalá Node:

- **macOS con Homebrew**: `brew install node@20`
- **macOS/Linux con nvm**: `nvm install 20 && nvm use 20`
- **Windows**: descargá el installer desde [nodejs.org](https://nodejs.org)

Re-verificá con `node --version`.

**Paso 2 — Clonar e instalar dependencias del curso**

Si aún no lo hiciste:

```bash
cd ~/Documents/GitHub/curso-claude-console
npm install
```

Esto baja `@anthropic-ai/sdk`, `dotenv`, `tsx`, `typescript` y sus tipos. Tarda unos segundos. Al terminar tenés `node_modules/` creado.

**Paso 3 — Copiar `.env.example` y llenarlo**

```bash
cp .env.example .env
```

Ahora editá `.env` con tu editor preferido y pegá tu workspace key (la que creaste en la Lección 03):

```dotenv
ANTHROPIC_API_KEY=sk-ant-api03-...(tu key)...
# ANTHROPIC_ADMIN_API_KEY=sk-ant-admin01-...(solo si creaste una admin key)...
DEFAULT_MODEL=claude-haiku-4-5
```

El `.env` está en `.gitignore` del repo. **Nunca** lo commitees. Si alguna vez lo hacés por accidente, rotá las keys de inmediato.

**Paso 4 — Correr `verify-setup.ts`**

```bash
npm run verify
```

Este script hace tres cosas:

1. Confirma que `ANTHROPIC_API_KEY` está definido y tiene el prefijo `sk-ant-api`.
2. Llama a `/v1/models` y lista los modelos disponibles.
3. Verifica que `claude-haiku-4-5`, `claude-sonnet-4-6` y `claude-opus-4-6` están los tres en la lista.

Si todo sale bien, el output termina con algo como:

```
Verificando ANTHROPIC_API_KEY...
  OK: prefijo sk-ant-api detectado

Consultando /v1/models...
  OK: 6 modelos disponibles en tu cuenta

Confirmando modelos base del curso:
  OK: claude-haiku-4-5
  OK: claude-sonnet-4-6
  OK: claude-opus-4-6

Setup verificado correctamente. Siguiente paso: npm run hello
```

Si falla con `401`, tu key está mal copiada o fue revocada. Si falla con `command not found: tsx`, es que `npm install` no terminó bien — correlo de nuevo.

**Paso 5 — Correr `01-hello-claude.ts`**

```bash
npm run hello
```

Este es el **equivalente TypeScript de la Lección 04** — el mismo primer mensaje, pero ahora usando el SDK en vez de curl crudo. Output esperado:

```
Enviando mensaje a claude-haiku-4-5...

Respuesta de Claude:
────────────────────────────────────────────────────────────
Hola, soy Claude, un asistente de IA...
────────────────────────────────────────────────────────────

Metadatos de la respuesta:
  id:            msg_01...
  model:         claude-haiku-4-5-20251001
  stop_reason:   end_turn
  input_tokens:  38
  output_tokens: 72
```

Si llegaste hasta aquí: **tenés todo el stack TypeScript operativo**. Podés avanzar al Módulo 1 con esto.

**Paso 6 — Instalar Python y `uv`**

```bash
python3 --version
```

Si ves `Python 3.11.x` o mayor, perfecto. Si no:

- **macOS con Homebrew**: `brew install python@3.12`
- **Linux**: paquete de tu distro, o [deadsnakes PPA](https://launchpad.net/~deadsnakes) en Ubuntu
- **Windows**: instaler desde [python.org](https://www.python.org/downloads/)

Instalá `uv`:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Reiniciá tu shell (`exec zsh` o abrí una terminal nueva), y verificá:

```bash
uv --version
```

**Paso 7 — Crear venv del curso e instalar `anthropic`**

Desde la raíz del repo:

```bash
uv venv
source .venv/bin/activate
uv pip install anthropic python-dotenv
```

**Paso 8 — Smoke test rápido en Python**

Creá un archivo temporal `_smoke.py` en la raíz:

```python
import os
from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()
client = Anthropic()

message = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=128,
    messages=[{"role": "user", "content": "Di 'setup python OK' en español y nada más."}],
)

print(message.content[0].text)
print(f"input_tokens={message.usage.input_tokens} output_tokens={message.usage.output_tokens}")
```

Correlo:

```bash
python _smoke.py
```

Deberías ver:

```
setup python OK
input_tokens=... output_tokens=...
```

**Borrá el archivo** después de verificar — no es parte del curso, solo un smoke test:

```bash
rm _smoke.py
```

### Troubleshooting común

- **`EACCES` al `npm install -g`**. Nunca uses sudo con npm global. Si realmente necesitás una instalación global, usá `nvm` o el prefix `~/.npm-global`.
- **Certificados SSL en Python** (macOS). Si ves `SSL: CERTIFICATE_VERIFY_FAILED`, corré el script `Install Certificates.command` que viene con Python.app, o usá Python instalado vía Homebrew (que ya los trae).
- **`ANTHROPIC_API_KEY` no se carga desde `.env`**. Verificá que el archivo se llama literalmente `.env` (no `.env.txt`, lo cual pasa en Windows), y que el script usa `dotenv` antes de leer la variable.
- **Error `429 rate_limit_error` en el primer hello world**. Muy raro; probablemente hay otro script corriendo en background agotando tu rate limit. Esperá 60 segundos y reintenta.
- **`npm run verify` dice `OK` pero `npm run hello` falla con error de modelo inexistente**. Tu key podría estar en un workspace sin acceso a Haiku 4.5 — cambiá a `claude-sonnet-4-5` o revisá permisos del workspace.

## Anti-patterns

- ❌ **Instalar Node con `sudo`.** Rompe permisos de `~/.npm` y eventualmente vas a tener problemas instalando paquetes. Usá Homebrew o nvm.
- ❌ **Usar `pip install` global en vez de `uv` con venv.** Mezclás deps de varios proyectos y terminás con un Python del sistema corrupto. El venv por proyecto es la regla.
- ❌ **Pegar la key en el código del script en vez de en `.env`.** Cuando pegues el script en Slack, Gist o GitHub, la key se va con él. `process.env.ANTHROPIC_API_KEY` siempre.
- ❌ **Olvidar agregar `.env` a `.gitignore`.** Ya está agregado en este repo — solo no lo saques. Si creás proyectos nuevos después del curso, el primer commit debería incluir `.gitignore` con `.env` antes que cualquier otra cosa.
- ❌ **Usar el Python del sistema (el que viene con macOS) para instalar paquetes.** Apple explícitamente te pide que no lo hagas. Instalá Python vía Homebrew o usá `uv` que te gestiona el intérprete también (`uv python install 3.12`).
- ❌ **Confiar en que el setup "funcionó" sin correr `verify-setup.ts`.** El script existe precisamente para darte una confirmación explícita. Correlo siempre al final del setup.

## Recap

- Necesitás **Node 20+** y **Python 3.11+** instalados, `@anthropic-ai/sdk` + `dotenv` + `tsx` vía `npm install`, y `anthropic` Python vía `uv pip install`. Las keys viven en un `.env` local que **nunca** se commitea.
- **`npm run verify`** es tu puerta de calidad: confirma key válida + modelos disponibles. **`npm run hello`** confirma que el SDK TS manda mensajes de verdad.
- Si algo falla, el error está en una de tres categorías: **versión de Node/Python**, **key mal copiada**, **`.env` no cargado**. Rara vez es otra cosa.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/client-sdks](https://platform.claude.com/docs/en/api/client-sdks)
**Ejercicio:** (implícito: si `npm run verify` y `npm run hello` corren limpio, la lección está pasada)
