# Lab: Chat CLI persistente

## Objetivo

Al terminar **vas a tener un chat de línea de comandos que funciona**: multi-turno con historial persistido en disco entre invocaciones, streaming de tokens a la terminal, retries automáticos del SDK, comandos `/stats` y `/reset`, rollback de turno en caso de error, y sliding window para controlar crecimiento del historial. Este lab **integra todo el Módulo 1**: anatomía de request, respuesta, multi-turno, streaming, count de tokens, errores y retries — en un solo binario de ~100 líneas.

## Concepto

### ¿Qué construimos y por qué?

Un chat CLI persistente es el "hello world extendido" de cualquier integración con una API LLM. Sirve como:

1. **Banco de pruebas propio** — escribís un prompt, probás, iteráis, sin depender de la UI web.
2. **Sandbox para patterns** — podés experimentar con system prompts, modelos, prefill, sin armar una app completa.
3. **Base para cosas reales** — un chatbot en Slack, un bot de Telegram, un asistente en Cursor: todos son variantes de este patrón con diferentes capas de transporte.

### Piezas que ya conocés y ahora juntamos

| Pieza | Lección | Rol en el lab |
|---|---|---|
| `system` prompt | 04 | Tono y restricciones del asistente |
| `messages[]` alternando user/assistant | 05 | Historial multi-turno |
| Streaming SSE con SDK | 06 | Output en vivo a la terminal |
| `usage.input_tokens` + `output_tokens` | 03, 07 | Contabilidad acumulada |
| Retries con `maxRetries` | 09 | Resiliencia automática ante 429/5xx |
| Error fatal → rollback de turno | 08 | No corromper historial si falla el turno |
| Sliding window sobre `messages[]` | 05 | Controlar crecimiento del contexto |

### El diseño del estado persistido

El estado de la sesión vive en **un solo archivo JSON**:

```json
{
  "model": "claude-haiku-4-5",
  "system": "Eres un asistente breve y técnico...",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "totals": { "input_tokens": 183, "output_tokens": 57 }
}
```

Pros:

- **Simple**: `fs.readFileSync` + `JSON.parse` + `JSON.stringify` + `fs.writeFileSync`. Sin DB, sin migración, sin ORM.
- **Inspeccionable**: abrís el archivo con `cat` o un editor, lo modificás a mano, funciona.
- **Portable**: lo commiteás al repo como fixture, lo borrás cuando querés resetear.

Cons (a tener presente):

- **No concurrente**: si dos procesos escriben al mismo archivo al mismo tiempo, se pierde data. Para un CLI de un solo usuario local, no es un problema. Para una versión multi-usuario servida por HTTP, necesitás otra cosa (Redis, Postgres).
- **Crece linealmente**: si no truncás, el archivo puede llegar a megabytes después de miles de turnos.

Para este lab, el JSON alcanza. En el Módulo 11 ("producción") vamos a ver cómo migrar este mismo estado a Redis o Postgres sin cambiar el shape.

### El rollback de turno: una sutileza operativa

Cuando el usuario escribe un mensaje, el flow natural es:

1. `messages.push({ role: "user", content: userInput })`
2. llamar la API
3. `messages.push({ role: "assistant", content: respuesta })`
4. guardar el JSON

Pero **¿qué pasa si la API falla en el paso 2** con un error fatal (un 400 porque el historial quedó corrupto, por ejemplo)? Si dejaste el `messages.push(user)` del paso 1, tu historial ahora tiene un turno `user` huérfano sin respuesta. El próximo turno va a tener `[user, user]` en el array y la API te va a devolver 400 por violar la alternancia.

**Solución**: si la API falla, hacés **rollback** del `messages.push(user)`:

```typescript
try {
  await sendTurn(client, session, userInput);
} catch (err) {
  console.error(`[error] ${err.status} ${err.message}`);
  session.messages.pop(); // rollback del user que no llegó a tener respuesta
}
```

Pequeño detalle, gran diferencia operativa. Sin el rollback, el primer error fatal deja tu sesión inutilizable hasta `/reset`.

### Sliding window: ¿por qué usarla?

Cada request paga tokens por **todo el historial enviado**. Si tu conversación pasa de los 20 turnos, estás pagando 20 veces cada token del turno 1. Sin límite, el costo crece cuadrático (N² tokens en N turnos).

La mitigación más simple: **sliding window**. Mantenés solo los últimos `N` turnos al momento de llamar a la API, tirando los más viejos:

```typescript
function trimHistory(messages: Turn[]): Turn[] {
  const MAX = 20;
  if (messages.length <= MAX) return messages;
  return messages.slice(messages.length - MAX);
}
```

Lo importante: **el disco guarda todo el historial completo**, pero cada llamada a la API envía solo los últimos 20. Así podés mostrarle al usuario el scroll completo de la conversación (si tu CLI tuviera esa feature) pero no pagás por el contexto antiguo.

Alternativa más sofisticada: **summarization** (resumir los primeros K turnos en 1 párrafo y reemplazarlos). No la implementamos en este lab — es ejercicio del Módulo 3.

### ¿Por qué el SDK (y no curl manual) para el lab?

En las Lecciones 02-09 usamos curl explícitamente para **ver el protocolo**. Para el lab usamos el SDK oficial porque:

1. **Streaming con `.on("text", ...)`** es trivialmente más corto que parsear SSE a mano.
2. **Retries con `maxRetries: 5`** están a una línea — reimplementarlos manualmente en el wrapper sería redundancia.
3. **Tipos TypeScript** te dan autocompletado y errores en compile-time.
4. El punto de las lecciones anteriores era **entender qué hace el SDK por debajo**. Ahora que lo sabés, usarlo es la decisión correcta.

## Ejecución real

**Paso 1 — El código completo del chat CLI**

Guardalo en `playground/chat-cli.ts`:

```typescript
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type Turn = { role: "user" | "assistant"; content: string };
type Session = {
  model: string;
  system: string;
  messages: Turn[];
  totals: { input_tokens: number; output_tokens: number };
};

const SESSION_PATH = process.env.CHAT_SESSION_PATH ?? "./chat-session.json";
const MODEL = "claude-haiku-4-5";
const SYSTEM =
  "Eres un asistente breve y técnico. Respondes en español, en 3 frases máximo. Sin preámbulos.";
const MAX_HISTORY_TURNS = 20;

function loadSession(): Session {
  if (existsSync(SESSION_PATH)) {
    const raw = readFileSync(SESSION_PATH, "utf-8");
    return JSON.parse(raw);
  }
  return {
    model: MODEL,
    system: SYSTEM,
    messages: [],
    totals: { input_tokens: 0, output_tokens: 0 },
  };
}

function saveSession(s: Session) {
  writeFileSync(SESSION_PATH, JSON.stringify(s, null, 2));
}

function trimHistory(messages: Turn[]): Turn[] {
  if (messages.length <= MAX_HISTORY_TURNS) return messages;
  return messages.slice(messages.length - MAX_HISTORY_TURNS);
}

async function sendTurn(client: Anthropic, session: Session, userInput: string) {
  session.messages.push({ role: "user", content: userInput });
  const trimmed = trimHistory(session.messages);

  const stream = client.messages.stream({
    model: session.model,
    max_tokens: 300,
    system: session.system,
    messages: trimmed,
  });

  process.stdout.write("claude> ");
  stream.on("text", (text) => process.stdout.write(text));
  const final = await stream.finalMessage();
  process.stdout.write("\n");

  const assistantText = final.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  session.messages.push({ role: "assistant", content: assistantText });
  session.totals.input_tokens += final.usage.input_tokens;
  session.totals.output_tokens += final.usage.output_tokens;

  saveSession(session);
}

async function main() {
  const client = new Anthropic({ maxRetries: 5 });
  const session = loadSession();

  const rl = createInterface({ input, output });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  console.log(`Chat persistente — sesión: ${SESSION_PATH}`);
  console.log(`Modelo: ${session.model} — historial: ${session.messages.length} turnos`);
  console.log(`Comandos: /exit, /stats, /reset. Enter para enviar.\n`);

  while (!closed) {
    let userInput: string;
    try {
      userInput = (await rl.question("you> ")).trim();
    } catch {
      break;
    }
    if (!userInput) continue;

    if (userInput === "/exit") break;
    if (userInput === "/stats") {
      console.log(
        `tokens totales: in=${session.totals.input_tokens} out=${session.totals.output_tokens} — turnos=${session.messages.length}\n`
      );
      continue;
    }
    if (userInput === "/reset") {
      session.messages = [];
      session.totals = { input_tokens: 0, output_tokens: 0 };
      saveSession(session);
      console.log("historial reseteado.\n");
      continue;
    }

    try {
      await sendTurn(client, session, userInput);
    } catch (err: any) {
      console.error(`[error] ${err.status ?? "?"} ${err.message}`);
      session.messages.pop();
    }
  }

  rl.close();
}

main();
```

~100 líneas. **Todas las piezas del Módulo 1** tocadas.

**Paso 2 — Primera invocación: sesión vacía**

```bash
cd ~/Documents/GitHub/curso-claude-console
rm -f chat-session.json # arrancar limpio
echo "Hola, soy Ulises y mi perro se llama Toto." | npx tsx playground/chat-cli.ts
```

Output real:

```
Chat persistente — sesión: ./chat-session.json
Modelo: claude-haiku-4-5 — historial: 0 turnos
Comandos: /exit, /stats, /reset. Enter para enviar.

you> claude> Hola Ulises, mucho gusto. ¿Hay algo específico en lo que pueda ayudarte con Toto o alguna otra consulta técnica?
```

El archivo `chat-session.json` fue creado con 2 turnos (user + assistant) y los totales actualizados.

**Paso 3 — Segunda invocación: el historial persiste entre runs**

```bash
echo "¿Cómo se llama mi perro?" | npx tsx playground/chat-cli.ts
```

Output real:

```
Chat persistente — sesión: ./chat-session.json
Modelo: claude-haiku-4-5 — historial: 2 turnos
Comandos: /exit, /stats, /reset. Enter para enviar.

you> claude> Tu perro se llama Toto.
```

**Tres cosas que observar**:

1. **"historial: 2 turnos"** — al arrancar, el CLI vio que ya existía `chat-session.json` y cargó los 2 turnos previos.
2. **Claude recordó el nombre**: "Tu perro se llama Toto." Esto no es magia del servidor — es que el CLI reenvió todo el historial (2 turnos previos + el nuevo) al endpoint. La Messages API sigue siendo stateless.
3. **Entre las dos invocaciones el proceso terminó completamente.** El JSON es el único puente. Eso es exactamente lo que permite que un chat "sobreviva" reinicios.

**Paso 4 — Contenido real del `chat-session.json` después del paso 3**

```json
{
  "model": "claude-haiku-4-5",
  "system": "Eres un asistente breve y técnico. Respondes en español, en 3 frases máximo. Sin preámbulos.",
  "messages": [
    {
      "role": "user",
      "content": "Hola, soy Ulises y mi perro se llama Toto."
    },
    {
      "role": "assistant",
      "content": "Hola Ulises, mucho gusto. ¿Hay algo específico en lo que pueda ayudarte con Toto o alguna otra consulta técnica?"
    },
    {
      "role": "user",
      "content": "¿Cómo se llama mi perro?"
    },
    {
      "role": "assistant",
      "content": "Tu perro se llama Toto."
    }
  ],
  "totals": {
    "input_tokens": 183,
    "output_tokens": 57
  }
}
```

**Observá** `totals.input_tokens: 183`. Desglose aproximado:

- Turno 1: ~60 input tokens (system ~22 + user ~15 + overhead ~23)
- Turno 2: ~120 input tokens (system ~22 + user 1 ~15 + assistant 1 ~30 + user 2 ~15 + overhead ~38)

En el turno 2, **los tokens del turno 1 se volvieron a pagar**. Esa es la famosa "N² de los chatbots" en miniatura. En un chat real de 20 turnos, el problema se vuelve serio y necesitás **prompt caching** — que vemos en el Módulo 6.

**Paso 5 — Ejercicio de extensión (interactivo, corré esto vos)**

Desde una terminal real:

```bash
cd ~/Documents/GitHub/curso-claude-console
npx tsx playground/chat-cli.ts
```

Cosas para probar manualmente:

1. Escribir 3-4 mensajes seguidos y observar que Claude mantiene contexto.
2. Tipear `/stats` para ver los totales acumulados.
3. Tipear `/reset` para vaciar el historial sin eliminar el archivo.
4. Tipear `/exit` para salir limpiamente.
5. Arrancar el CLI de nuevo — los turnos persistidos siguen ahí si no hiciste `/reset`.
6. **Bonus**: editar `chat-session.json` a mano, cambiar un `content` del assistant, volver a arrancar. Claude va a "creer" que dijo eso. Es poder — y es lo que hace posible el prefill de la Lección 05.

## Anti-patterns

- ❌ **No guardar el estado hasta el `/exit`.** Si tu CLI solo persiste al salir, un crash a mitad de la sesión pierde todo. Guardá después de **cada turno completado** (y antes de que el próximo `question` bloquee).
- ❌ **No hacer rollback del `user` push si la API falla.** Te deja un turno huérfano y el próximo llamado explota con 400. Siempre `messages.pop()` en el catch.
- ❌ **Pagar tokens por historial infinito.** Sin sliding window ni summarization, el costo crece cuadrático. En 50 turnos de conversación no trivial, podés estar pagando 10x lo que deberías.
- ❌ **Mostrar el historial completo al usuario pero enviarlo todo al API.** Son dos decisiones distintas. Podés guardar 200 turnos en disco y enviar solo los últimos 20 al API. Separá "lo que persistís" de "lo que enviás".
- ❌ **Hardcodear la API key en el código.** `import "dotenv/config"` y `process.env.ANTHROPIC_API_KEY`. Siempre. Si commiteás una key por accidente, rotala en la Console inmediatamente.
- ❌ **Leer `final.content[0].text` asumiendo que siempre hay un solo bloque.** Si algún día agregás tool use o thinking, ese `[0]` puede no ser `text`. Hacé `filter(b => b.type === "text")` y `map(b => b.text).join("")`.
- ❌ **Escribir en el mismo archivo de sesión desde dos procesos concurrentes.** JSON no tiene locking — vas a pisar turnos. Para multi-usuario, usá una DB.
- ❌ **Usar `console.log` para el texto del stream.** `console.log` agrega `\n` — tu texto va a salir fragmentado por líneas. Usá `process.stdout.write` que no agrega nada.
- ❌ **No exponer un `/reset` u otra forma de empezar de cero.** Sin eso, el usuario tiene que `rm chat-session.json` manualmente. UX mala. Un comando en el CLI vale la pena.
- ❌ **Trackear `totals` sin el campo `cache_read_input_tokens` / `cache_creation_input_tokens`.** En este lab no usamos caching, pero cuando lo agregues (Módulo 6), ignorar esos campos te va a dar contabilidad incorrecta. Acordate de sumarlos explícitamente.

## Recap

- **Un solo archivo JSON** como estado de sesión es suficiente para un CLI local. Simple, inspeccionable, portable. Para multi-usuario servido por HTTP, migrá a Redis/Postgres.
- **Patrón canónico del loop**: leer input → push(user) → llamar API con streaming → extraer text blocks → push(assistant) → guardar JSON. En el catch, `pop()` del user para rollback.
- **Sliding window** al enviar a la API, historial completo al disco. Dos decisiones separadas que tu lab ya distingue.
- **Rollback de turno fallido** es la pieza que distingue un CLI usable de uno que se rompe al primer error.
- **Comandos del CLI** (`/stats`, `/reset`, `/exit`) le dan al usuario control operativo sin tener que tocar el filesystem.
- **SDK + `maxRetries: 5`** te da resiliencia gratis ante 429/5xx sin tener que escribir el wrapper de la Lección 09.
- **Este lab es la base** para cualquier integración real: Slack bot, Telegram bot, Discord, CLI enterprise, extensión de editor. Cambia la capa de transporte, el patrón central queda igual.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/messages](https://platform.claude.com/docs/en/api/messages) + [platform.claude.com/docs/en/api/sdks/typescript](https://platform.claude.com/docs/en/api/sdks/typescript)
**Ejercicio:** <!-- exercise:ex-01-07-chat-cli -->
