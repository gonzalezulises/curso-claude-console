# Lab: mini-agente con 3 tools

## Objetivo

Al terminar esta lección habrás **construido un mini-agente completo desde cero** que encadena 3 tools cliente (`search_user`, `get_orders`, `send_email`) para resolver una tarea de usuario en múltiples turnos. Vas a integrar todo lo de este módulo: definir tools con JSON Schema, correr el runtime loop, manejar paralelismo + secuenciación, y loggear auditoría.

## Concepto

### El agente que vamos a construir

**Caso de uso**: soporte al cliente. El usuario escribe:

> "Mandale un resumen de sus últimos pedidos a mariana@example.com"

El agente debe:
1. Buscar el usuario por email → obtener `user_id`.
2. Consultar sus pedidos con `user_id`.
3. Enviar un email con el resumen.

Cada paso requiere el output del anterior → **secuencial**. Claude va a encadenar las 3 tools naturalmente a lo largo de 3-4 turnos.

### Las 3 tools

```typescript
const tools = [
  {
    name: "search_user",
    description: "Find a user by email address. Returns {user_id, name, email} or null if not found.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", format: "email", description: "User's email address" },
      },
      required: ["email"],
    },
  },
  {
    name: "get_orders",
    description: "Get the 5 most recent orders for a user. Returns an array of {order_id, date, total, status}.",
    input_schema: {
      type: "object" as const,
      properties: {
        user_id: { type: "string", description: "User ID from search_user." },
        limit: { type: "integer", default: 5 },
      },
      required: ["user_id"],
    },
  },
  {
    name: "send_email",
    description: "Send an email to an address with a subject and body. Returns {sent: true, message_id}.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", format: "email" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
];
```

### Las implementaciones mock

Para el lab usamos implementaciones fake (en prod serían llamadas a tu DB / a Resend / etc):

```typescript
async function searchUser(email: string) {
  const db: Record<string, any> = {
    "mariana@example.com": { user_id: "u_123", name: "Mariana Lopez", email: "mariana@example.com" },
  };
  return db[email] ?? null;
}

async function getOrders(user_id: string, limit = 5) {
  if (user_id !== "u_123") return [];
  return [
    { order_id: "o_1001", date: "2026-04-09", total: 45.90, status: "shipped" },
    { order_id: "o_1002", date: "2026-04-07", total: 12.00, status: "delivered" },
    { order_id: "o_1003", date: "2026-04-01", total: 88.50, status: "delivered" },
  ];
}

async function sendEmail(to: string, subject: string, body: string) {
  console.log(`[EMAIL to ${to}] ${subject}\n${body}`);
  return { sent: true, message_id: `msg_${Date.now()}` };
}
```

### El dispatcher

Un helper que ejecuta la tool correcta:

```typescript
async function executeTool(name: string, input: any) {
  switch (name) {
    case "search_user": return await searchUser(input.email);
    case "get_orders":  return await getOrders(input.user_id, input.limit);
    case "send_email":  return await sendEmail(input.to, input.subject, input.body);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
```

### El runtime loop (patrón canónico)

```typescript
async function runAgent(userPrompt: string) {
  const messages: any[] = [{ role: "user", content: userPrompt }];
  let iteration = 0;

  while (iteration++ < 10) {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") {
      const text = resp.content.find((b: any) => b.type === "text") as any;
      return text?.text ?? "";
    }

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter((b: any) => b.type === "tool_use");

      // Auditoría: loggeá qué propuso el modelo antes de ejecutar
      for (const t of toolUses) {
        console.log(`[tool_use] ${(t as any).name}(${JSON.stringify((t as any).input)})`);
      }

      // Ejecutar en paralelo (si son independientes); Claude ordena si no lo son
      const results = await Promise.all(
        toolUses.map(async (block: any) => {
          try {
            const output = await executeTool(block.name, block.input);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(output),
            };
          } catch (err: any) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: `Error: ${err.message}`,
              is_error: true,
            };
          }
        })
      );

      messages.push({ role: "user", content: results });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${resp.stop_reason}`);
  }

  throw new Error("Max iterations exceeded");
}
```

Notá los detalles clave:
- **Tope de iteraciones** (`iteration < 10`): evita loops infinitos si el modelo se confunde.
- **Auditoría** (`console.log` antes de ejecutar): en prod, esto va a tu logger/DB.
- **Manejo de errores** (`try/catch`): devolvés `is_error: true` al modelo, que puede reintentar o informar al usuario.
- **`Promise.all`**: si el modelo emitió paralelismo, lo aprovechás.

### Expectativa de flujo

Con esta configuración, la ejecución va a verse así:

```
Turno 1:
  USER: "Mandale un resumen de sus últimos pedidos a mariana@example.com"
  ASSISTANT: tool_use(search_user, {email: "mariana@example.com"})
  STOP: tool_use

Turno 2:
  USER: tool_result({user_id: "u_123", name: "Mariana Lopez", ...})
  ASSISTANT: tool_use(get_orders, {user_id: "u_123"})
  STOP: tool_use

Turno 3:
  USER: tool_result([3 orders])
  ASSISTANT: tool_use(send_email, {to: "mariana@example.com", subject: "...", body: "..."})
  STOP: tool_use

Turno 4:
  USER: tool_result({sent: true, message_id: "msg_..."})
  ASSISTANT: "Listo, le envié a Mariana el resumen de sus 3 últimos pedidos."
  STOP: end_turn
```

**3 tools encadenadas secuencialmente** porque cada una depende del resultado de la anterior. El modelo lo orquesta solo — vos solo corrés el loop.

## Ejecución real

El script completo:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// ... (tools, searchUser, getOrders, sendEmail, executeTool, runAgent como arriba)

const answer = await runAgent(
  "Mandale un resumen de sus últimos pedidos a mariana@example.com"
);

console.log("\n---\nFINAL:", answer);
```

Output esperado:
```
[tool_use] search_user({"email":"mariana@example.com"})
[tool_use] get_orders({"user_id":"u_123"})
[tool_use] send_email({"to":"mariana@example.com","subject":"Resumen de tus últimos pedidos","body":"Hola Mariana,\n\nAquí tenés el resumen:\n- o_1001 (2026-04-09): $45.90 — shipped\n- o_1002 (2026-04-07): $12.00 — delivered\n- o_1003 (2026-04-01): $88.50 — delivered\n\nSaludos."})
[EMAIL to mariana@example.com] Resumen de tus últimos pedidos
Hola Mariana,

Aquí tenés el resumen:
- o_1001 (2026-04-09): $45.90 — shipped
- o_1002 (2026-04-07): $12.00 — delivered
- o_1003 (2026-04-01): $88.50 — delivered

Saludos.

---
FINAL: Listo, le envié a Mariana el resumen de sus 3 últimos pedidos por email.
```

Observá:
- 3 iteraciones del loop, 3 tool_use, 3 tool_result.
- El modelo compuso el body del email con los datos obtenidos de `get_orders`.
- Auditoría visible de cada paso.

### Extensiones que querés agregar en prod

1. **Rate limiting**: si el modelo entra en loops accidentales, limitá iteraciones o tools por minuto.
2. **Permissions**: antes de ejecutar `send_email`, validá que el user tenga permiso (¿este call center tiene autoridad para mandar mails a este cliente?).
3. **Confirmación**: para tools destructivas (`delete_user`, `refund_order`), presentá el `tool_use` al usuario antes de ejecutar.
4. **Streaming**: usá `client.messages.stream()` en vez de `.create()` para mostrar el progreso al usuario turno a turno.
5. **Caching**: aplicá `cache_control` en la última tool del array (lección 09) para reducir costos en sesiones largas.

## Anti-patterns

- ❌ **Correr el loop sin tope máximo**. Si el modelo se confunde y re-emite tool_use en bucle, tu servidor se cuelga. `while (iteration < 10)` mínimo.
- ❌ **No loggear los tool_use**. En prod, esto es **tu auditoría** de qué propuso el modelo. Loggealo ANTES de ejecutar, no después.
- ❌ **Exponer tools destructivas sin confirmación**. Si la tool es `delete_user` o `refund`, el "propone / ejecuta" de tool use no es suficiente — agregá un gate manual.
- ❌ **Manejar errores tirando excepciones al modelo**. El patrón es devolver `tool_result` con `is_error: true` y un mensaje claro — el modelo puede decidir reintentar o explicar al usuario. Tirar excepciones corta la conversación.
- ❌ **Usar `claude-haiku-4-5` para un agente con 5+ tools y decisiones complejas**. Haiku es fenomenal para tareas concretas y extracciones, pero para orchestration multi-step con reasoning conviene `claude-sonnet-4-6` o `claude-opus-4-6`.
- ❌ **No limitar `max_tokens` por turno**. Un turno con un body largo + 3 tools podría saturar. Monitoreá `usage` y ajustá.

## Recap

- Un mini-agente completo = **tools + dispatcher + runtime loop**. Nada más, nada menos.
- El loop es el mismo patrón de la lección 03, escalado a múltiples tools.
- Cada `tool_use` pasa por tu código → auditoría + permissions + error handling.
- Con Claude Sonnet 4.6, encadenar 3-5 tools sin decision manual funciona muy bien.
- **En prod**: agregá tope de iteraciones, permissions, confirmación para tools destructivas, y logging.
- Este patrón es lo que corren por abajo MCP (módulo 7), Skills (módulo 8), Managed Agents (módulo 9) y Claude Code (módulo 10). Entendido este loop, todo lo demás es una UX distinta sobre el mismo core.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use](https://platform.claude.com/docs/en/build-with-claude/tool-use)
**Ejercicio:** <!-- exercise:ex-05-07-lab-mini-agente -->
