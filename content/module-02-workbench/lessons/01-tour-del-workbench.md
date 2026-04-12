# Tour del Workbench

## Objetivo

Al terminar sabrás **ubicar cada sección de la interfaz de Claude Console** (`platform.claude.com`), entenderás la diferencia entre el **dashboard**, el **Workbench** y las demás secciones del sidebar, y tendrás un mapa mental de dónde encontrar cada cosa para no perderte en el resto del módulo.

## Concepto

### Claude Console: la interfaz web de Anthropic

**Claude Console** (`platform.claude.com`) es la interfaz web donde gestionás tu cuenta, tus API keys, tus prompts, archivos, skills, agents y analytics. No es lo mismo que `claude.ai` (el chat consumer) ni que Claude Code (la CLI). Es tu **panel de control como developer**.

La URL de entrada es `platform.claude.com/dashboard`. Al entrar ves un saludo personalizado ("Good morning, Ulises"), accesos rápidos y tus prompts recientes del Workbench.

### El sidebar: mapa de navegación

El sidebar izquierdo es tu mapa. Tiene estas secciones principales:

<terminology>
**Build** — las herramientas de construcción:
- **Workbench**: el laboratorio de iteración de prompts. Es donde vas a pasar la mayor parte de este módulo.
- **Files**: gestión de archivos subidos via Files API (PDFs, imágenes, documentos).
- **Skills**: capacidades reutilizables que Claude puede invocar (Anthropic provee 4 de fábrica: `xlsx`, `pptx`, `pdf`, `docx`). Las vas a ver en profundidad en el Módulo 8.

**Managed Agents** (marcado como "New"):
- **Quickstart**: templates para crear agents rápidamente (Deep researcher, Support agent, Structured extractor, entre otros).
- **Agents**: los agents que creaste.
- **Sessions**: instancias en vivo de tus agents.
- **Environments**: sandboxes de ejecución.
- **Credential vaults**: almacén seguro de credenciales para agents.
- Todo esto lo vas a ver en el Módulo 9.

**Analytics**:
- **Usage**: tokens consumidos por modelo, por workspace, por período. Gráfico diario de tokens in/out.
- **Cost**: desglose de costos.
- **Logs**: registro de llamadas individuales.
- **Batches**: jobs de Batch API.

**Claude Code**: configuración de la CLI (settings, usage).

**Manage**:
- **API keys**: crear y gestionar workspace API keys.
- **Limits**: ver y configurar rate limits.
- **Workspace settings**: nombre del workspace, miembros, configuración general.
</terminology>

Abajo del todo está **Documentation** (enlace a los docs oficiales) y tu usuario con el rol y la organización (ej: "Ulises — Admin · Rizo.ma").

### El Workbench: tu laboratorio de prompts

Cuando hacés click en **Build → Workbench**, entrás al editor de prompts. Esta es la pantalla que vas a usar constantemente:

**Barra superior**:
- **Nombre del prompt** ("Untitled" por default) con indicador de guardado automático ("Last saved...").
- **Tabs**: `Prompt` (editor principal) y `Evaluate` (testing con variables).
- **Botón Get Code** (arriba a la derecha): exporta tu prompt como snippet Python/TS/curl.
- **Botón Run** (▶): ejecuta el prompt contra el modelo.

**Selector de modelo**: justo debajo, un dropdown con el modelo activo (ej: `claude-sonnet-4-5-20250929`). Al lado hay iconos para versiones, **Examples** y **Template**.

**Panel izquierdo** (el editor):
- **System Prompt**: campo expandible para definir el system prompt. Dice "Define a role, tone or context (optional)".
- **User**: área de texto para el mensaje del usuario. Tiene un botón **Generate Prompt** que genera un prompt automáticamente como punto de partida.
- **Pre-fill response** (checkbox): activa el prefill del turno assistant — la misma técnica que viste en el Módulo 3, Lección 07.
- **Add message pair**: agrega pares user/assistant para simular conversaciones multi-turno.

**Panel derecho** (contextual): cambia según lo que seleccionés:
- Por default: muestra un panel de bienvenida con tips.
- Con el icono ⚙: abre el panel **Model** con parámetros (temperature, max_tokens, thinking).
- Con el tab Evaluate: muestra **Test Case** para definir variables.
- Con el icono de tools: muestra el panel **Tools** (Custom + Web search).

### El panel de bienvenida: los tips que importan

La primera vez que abrís el Workbench, el panel derecho muestra tips de uso. Los más importantes:

1. **"Write a prompt in the left column, click ▶ Run to see Claude's response"** — el ciclo básico.
2. **"Editing the prompt, or changing ⚙ model parameters creates a new version"** — el Workbench versiona automáticamente cada cambio. Podés volver a versiones anteriores.
3. **"Write variables like this: `{{VARIABLE_NAME}}`"** — para parametrizar prompts y testear con distintos inputs sin reescribir.
4. **"High quality examples greatly improve performance. After drafting a prompt, click EXAMPLES to add some"** — acceso directo a few-shot desde la UI.

### Dashboard vs Workbench: cuándo usar cada uno

- **Dashboard** (`/dashboard`): vista general. Ves tus prompts recientes, accesos rápidos ("Get started with agents", "Generate a prompt", "Get API Key"). Es tu home page.
- **Workbench** (`/workbench/...`): editor de un prompt específico. Es donde iterás.

La analogía: el dashboard es la carpeta de tu proyecto, el Workbench es el editor abierto con un archivo.

## Ejecución real

Este módulo es diferente a los anteriores: **la ejecución real es en la UI**, no en curl. Para esta lección:

1. **Abrí `platform.claude.com/dashboard`** en tu browser.
2. **Verificá el sidebar**: ¿ves las secciones Build, Managed Agents, Analytics, Claude Code, Manage? Si falta alguna, puede ser por el tipo de plan o workspace.
3. **Hacé click en Workbench** (bajo Build).
4. **Identificá los 4 elementos**: barra superior (nombre + Get Code + Run), selector de modelo, panel izquierdo (System + User), panel derecho (tips/parámetros/tools).
5. **Escribí un prompt trivial** en el campo User: `"¿Cuál es la capital de Francia?"`. No lo corras todavía — solo verificá que podés escribir.
6. **Hacé click en el icono ⚙** del panel derecho y verificá que ves: Temperature (slider), Max tokens (input), Thinking (toggle).

Si todo está en su lugar, estás listo para la Lección 02 donde empezamos a iterar.

## Anti-patterns

- ❌ **Usar el Workbench como tu "app final"**. Es un laboratorio de iteración, no un producto. Cuando el prompt está estable, exportalo con Get Code y llevalo a tu repo.
- ❌ **Ignorar el Workbench y hacer todo en código**. Iterar un prompt editando un .ts, corriendo `npx tsx`, leyendo output, volviendo al editor... es 10x más lento que el ciclo Run del Workbench. Usá el Workbench primero, código después.
- ❌ **No versionar los prompts**. El Workbench versiona automáticamente, pero tus prompts estables deben ir a git. El Workbench no reemplaza tu repo — lo complementa.
- ❌ **Confundir `platform.claude.com` con `claude.ai`**. Son productos distintos. `claude.ai` es el chat consumer. `platform.claude.com` es la console de developer con API keys, Workbench, analytics y management.
- ❌ **Explorar Managed Agents antes de dominar la API**. El sidebar te tienta con "Agents" y templates bonitos, pero sin entender Messages API (Módulo 1), tool use (Módulo 5) y MCP (Módulo 7), los agents son una caja negra. Seguí el orden del curso.

## Recap

- **Claude Console** (`platform.claude.com`) es tu panel de control de developer con sidebar de 5 secciones: Build, Managed Agents, Analytics, Claude Code, Manage.
- **El Workbench** es el laboratorio de iteración de prompts: system prompt + user message + Run + parámetros + tools + Get Code.
- **El panel derecho es contextual**: cambia entre tips, parámetros (⚙), Test Case (Evaluate), y Tools según lo que seleccionés.
- **El Workbench versiona automáticamente** cada cambio de prompt o parámetro.
- **Variables `{{nombre}}`** te permiten parametrizar prompts para testing (lo vas a ver en la Lección 02).

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
