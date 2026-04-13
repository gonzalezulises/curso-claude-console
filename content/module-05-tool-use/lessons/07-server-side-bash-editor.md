# Server-side: bash & text_editor

## Objetivo

Al terminar esta lección sabrás **qué son las server-side tools `bash` y `text_editor`**, cómo Anthropic las ejecuta en su sandbox sin que tu código orqueste el loop, cuándo vale la pena usarlas vs client-side tools propias (equivalente "agent harness" casero), y por qué `text_editor` es la tool que Claude Code usa debajo para editar archivos.

## Concepto

### Las 2 tools del tandem "computer use" ligero

**`bash`** — ejecutar comandos shell dentro de un sandbox Linux efímero de Anthropic.
**`text_editor`** — leer, ver, crear, editar y reemplazar bloques en archivos dentro de ese mismo sandbox (o del tuyo, según la variante).

Estas tools existen principalmente en el ecosistema de **Managed Agents** y de **Claude Code**. La API pura las expone como cualquier otra server-side tool.

### Versión actual (abril 2026)

```json
{
  "tools": [
    { "type": "bash_20250124", "name": "bash" },
    { "type": "text_editor_20250124", "name": "str_replace_editor" }
  ]
}
```

<terminology>

**`bash_20250124`**: versión con fecha. Proximamente puede salir un update `bash_20260515` — usá siempre la última estable documentada.

**`text_editor_20250124`**: la variante moderna. Tiene comandos sub-tipo: `view`, `create`, `str_replace`, `insert`, `undo_edit`.

**Ambas son server-side**: Anthropic ejecuta el comando. `stop_reason: "end_turn"` al final del turno — no hay `tool_result` que devolver desde tu código.

</terminology>

### bash — la tool más simple

Input schema (implícito, lo maneja Anthropic):
```json
{
  "command": "ls -la /workspace",
  "restart": false
}
```

Claude decide el comando. Anthropic lo ejecuta en un sandbox aislado (filesystem temporal, red limitada, timeout ~60s). El output (stdout+stderr) vuelve al modelo.

**Caso de uso típico**: tareas de sysadmin ligero sobre archivos que Claude creó o subió (ej: "descomprime este zip y lista contenidos"), ejecutar scripts ya escritos, diagnostico rápido.

### text_editor — edición estructurada de archivos

Tiene 5 comandos:

- **`view`** — leer archivo (o listar directorio). Acepta `view_range: [start, end]`.
- **`create`** — crear archivo nuevo con contenido.
- **`str_replace`** — reemplazar un bloque por otro (match exacto, único).
- **`insert`** — insertar texto en una línea específica.
- **`undo_edit`** — revertir la última edición.

Este es el patrón **exacto** que Claude Code usa cuando edita tus archivos. No es coincidencia: Claude Code está construido sobre esta tool.

**Ventaja sobre bash + sed**: `str_replace` obliga al modelo a leer primero (`view`), luego producir un patch con contexto suficiente para que el match sea único. Menos errores de edición destructiva.

### La diferencia mental con client-side tools

Si construyeras un agente equivalente con client-side tools:
```typescript
const tools = [
  { name: "bash", description: "Run a shell command", input_schema: {...} },
  { name: "read_file", description: "Read a file", input_schema: {...} },
  { name: "write_file", description: "Write a file", input_schema: {...} },
];

// Tu código implementa el loop, ejecuta bash en tu máquina, maneja errores, etc.
```

La versión server-side te ahorra **todo ese harness**. A cambio:
- El sandbox es de Anthropic (no tu filesystem local).
- No controlás timeouts ni variables de ambiente.
- Menos flexibilidad para inyectar contexto (secrets, paths custom, etc.).

### Cuándo usar server-side vs client-side

**Usá `bash` / `text_editor` server-side cuando:**
- Estás prototipeando un agente rápido.
- El trabajo es sobre archivos que el propio modelo genera dentro del turno.
- No necesitás acceso a tu filesystem/red/secrets reales.

**Usá client-side cuando:**
- Necesitás ejecutar en tu máquina, container, o infra controlada.
- Querés logs, auditoría, permissions propios.
- Estás construyendo Claude Code o similar: tu código ES el runtime.

> **Nota:** bash y text_editor requieren **beta header** `computer-use-2024-10-22` (o la versión actualizada). Algunos entornos de SDK los habilitan automáticamente, pero con curl directo hay que incluir `anthropic-beta: computer-use-2024-10-22`. Consultá la docs oficial antes de pegarlo en producción.

## Ejecución real

> **Nota:** output abreviado con estructura real del response — los bloques server-side son idénticos a los de `web_search` (`server_tool_use` + `*_tool_result`) pero con `name` distinto.

**Request con bash:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: computer-use-2024-10-22" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "tools": [
      { "type": "bash_20250124", "name": "bash" }
    ],
    "messages": [
      {"role": "user", "content": "Lista archivos en /tmp y decime cuántos son."}
    ]
  }'
```

Response (estructura esperada):
```json
{
  "content": [
    { "type": "text", "text": "Voy a listar /tmp." },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_...",
      "name": "bash",
      "input": { "command": "ls -la /tmp | wc -l" }
    },
    {
      "type": "bash_code_execution_tool_result",
      "tool_use_id": "srvtoolu_...",
      "content": [{
        "type": "bash_code_execution_output",
        "stdout": "7\n",
        "stderr": "",
        "return_code": 0
      }]
    },
    { "type": "text", "text": "En /tmp hay 7 entradas (incluyendo . y ..)." }
  ],
  "stop_reason": "end_turn"
}
```

**Request con text_editor:**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: computer-use-2024-10-22" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "tools": [
      { "type": "text_editor_20250124", "name": "str_replace_editor" }
    ],
    "messages": [
      {"role": "user", "content": "Creá un archivo /workspace/hello.py con un print hola."}
    ]
  }'
```

Response:
```json
{
  "content": [
    { "type": "text", "text": "Lo creo." },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_...",
      "name": "str_replace_editor",
      "input": {
        "command": "create",
        "path": "/workspace/hello.py",
        "file_text": "print(\"hola\")\n"
      }
    },
    {
      "type": "text_editor_code_execution_tool_result",
      "tool_use_id": "srvtoolu_...",
      "content": [{
        "type": "text_editor_code_execution_create_result",
        "is_file_update": false
      }]
    },
    { "type": "text", "text": "Listo, archivo creado." }
  ],
  "stop_reason": "end_turn"
}
```

Observá:
- El modelo eligió el sub-comando `"create"`, no tuviste que decírselo.
- El response trae un `*_tool_result` block con el outcome de la operación.
- No hay loop — todo ocurrió dentro del turno del modelo.

## Anti-patterns

- ❌ **Usar `bash` server-side para trabajar con tu filesystem real**. El sandbox es de Anthropic — lo que creás ahí no está en tu máquina. Si necesitás persistencia real, usá client-side.
- ❌ **Asumir red o secrets en el sandbox**. El sandbox es limitado; no podés asumir `curl` a APIs internas, ni variables de entorno tuyas.
- ❌ **Olvidar el beta header**. Sin `anthropic-beta: computer-use-2024-10-22`, la API rechaza la tool.
- ❌ **Implementar `text_editor` como client-side "paralelo"**. Si querés el equivalente en tu infra, clonás la interfaz (5 comandos), pero no "extiendas" el server-side. Son dos tools distintas con mismo nombre → confunde.
- ❌ **Usar server-side bash en producción para tareas críticas**. El sandbox es efímero, sin SLA de artefactos persistentes. Úsalo para cómputo temporal dentro del turno.
- ❌ **Cargar todo el flujo de Claude Code con server-side**. Claude Code usa client-side porque necesita tu filesystem, tu git, tus secrets. Server-side es prototipo; client-side es producto.

## Recap

- `bash_20250124` y `text_editor_20250124` son **server-side tools** ejecutadas en sandbox de Anthropic.
- No hay loop cliente: el response es final, con `stop_reason: "end_turn"` y bloques `server_tool_use` + `*_tool_result`.
- `text_editor` tiene 5 sub-comandos: `view`, `create`, `str_replace`, `insert`, `undo_edit`. Es el patrón que Claude Code replica en tu filesystem.
- Requieren beta header `computer-use-2024-10-22`.
- **Server-side** para prototipos y archivos efímeros; **client-side** cuando tu infra, permisos, red o persistencia importan.

---

**Fuente oficial:** [platform.claude.com/docs/en/agents-and-tools/tool-use/bash-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/bash-tool) · [platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool)
**Ejercicio:** *(sin ejercicio dedicado — cubierto en el lab del módulo)*
