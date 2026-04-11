# Módulo 7 — MCP: El Protocolo del Ecosistema

**Duración estimada:** 6 horas · **Lecciones:** 10 · **Ejercicios:** ~7 · **Modelo default del módulo:** `claude-sonnet-4-6`

## Objetivo del módulo

Al terminar entenderás **Model Context Protocol (MCP)** de punta a punta: qué es (un estándar abierto para conectar LLMs con fuentes de datos y herramientas externas), sus **primitivas** (tools, resources, prompts, sampling, roots), cómo usar MCP **desde la Messages API** con el MCP Connector, cómo **conectar tu código a un server MCP remoto**, y cómo **construir tu propio server MCP** en TypeScript con el SDK oficial.

## Prerrequisitos

- Módulo 5 (tool use — MCP es la abstracción general sobre tools)

## Arco narrativo

MCP es lo que transforma a Claude de "modelo con tools que vos definís" a "modelo que puede hablar con cualquier sistema del mundo". Es JSON-RPC 2.0 sobre stdio/HTTP. Anthropic lo publicó como estándar abierto y es el pegamento entre Messages API, Claude Code, Managed Agents y el ecosistema de third-party servers. Dominar MCP es dominar el **protocolo de extensión** del ecosistema Claude.

## Lecciones

1. **¿Qué es MCP y por qué existe?** — problema que resuelve, comparación con "tool use artesanal" y con "plugins de ChatGPT".
2. **Arquitectura: host, client, server** — roles, quién ejecuta qué, por qué el modelo solo habla con el client.
3. **Primitivas 1: tools** — idéntico semántico a los tools del Módulo 5 pero descubribles dinámicamente desde un server.
4. **Primitivas 2: resources** — archivos, URLs, bases de datos que el server expone como "contexto disponible". Diferencia con tools (data vs action).
5. **Primitivas 3: prompts** — templates reutilizables que el server ofrece al host.
6. **Primitivas 4 y 5: sampling y roots** — sampling deja al server pedir al modelo que genere (raro pero poderoso); roots delimita qué puede ver el server en tu filesystem.
7. **MCP Connector en la Messages API** — beta `mcp-client-2025-11-20`, cómo un request a `/v1/messages` puede listar servers MCP remotos y Claude descubre+usa tools automáticamente.
8. **Conectarse a un server MCP existente** — ejemplo con un server público (filesystem, fetch, time), en TS y desde curl con MCP Connector.
9. **Construir tu propio server MCP (TS SDK)** — `@modelcontextprotocol/sdk`, exponer 2 tools + 1 resource, transporte stdio, prueba local con Claude Code.
10. **Lab: server MCP custom integrado a un agente** — el alumno construye un server MCP que expone 3 tools del dominio de su elección, lo corre localmente y lo consume desde un script que llama a /v1/messages con MCP Connector.

## Ejercicios planeados

- `ex-07-01-conceptos-mcp.yaml` (quiz): tools vs resources vs prompts, qué rol ejecuta qué
- `ex-07-02-conectar-server-existente.yaml` (code-typescript): usar un server oficial (ej: `filesystem`) y listar archivos
- `ex-07-03-mcp-connector.yaml` (code-typescript): request directo a `/v1/messages` con el beta MCP Connector
- `ex-07-04-server-basico.yaml` (code-typescript): crear un server que expone una sola tool `reverse_string`
- `ex-07-05-resources.yaml` (code-typescript): agregar un resource al server anterior
- `ex-07-06-transport-http.yaml` (code-typescript): migrar el server de stdio a HTTP para deploy remoto
- `ex-07-07-lab-custom-server.yaml` (code-typescript): el lab

## Lab del módulo

**MCP server custom + cliente Claude** — el alumno crea un server MCP que expone 3 tools sobre un dominio (ej: "notes": `create_note`, `list_notes`, `search_notes`), lo corre como proceso local, y escribe un script TS que llama a /v1/messages con el MCP Connector para que Claude pueda usar esas tools orgánicamente.

## Conceptos de arquitecto

- MCP es el **contrato** — una vez que expongas un sistema como server MCP, cualquier host (Claude Code, Managed Agents, Messages API con Connector) lo puede usar sin código adicional
- La separación tools/resources es importante: **tools para acciones con efectos, resources para contexto read-only**
- stdio es para desarrollo local; HTTP + OAuth es para deploy remoto
- Un server MCP puede reemplazar 10 pequeñas integraciones de tool use — es el mismo trabajo, hecho una vez

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/tool-use/remote-mcp-servers`
- `modelcontextprotocol.io/docs` (spec oficial)
- `github.com/modelcontextprotocol/typescript-sdk`

## Notas para la sesión de producción

- El beta `mcp-client-2025-11-20` es nuevo — verificar al escribir que sigue siendo el alias activo.
- El SDK `@modelcontextprotocol/sdk` evoluciona rápido — pinear versión exacta en package.json del ejercicio.
- Reutilizar los patrones que Ulises ya aplicó en su propio semantic-scholar-mcp (memoria del usuario) como referencia de "así se ve un server real".
