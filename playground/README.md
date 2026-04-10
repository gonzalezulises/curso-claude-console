# Playground

Scripts listos para correr que exploran conceptos del curso. Todos están en TypeScript y se ejecutan con `tsx` sin compilación previa.

## Prerrequisitos

1. `npm install` en la raíz del repo
2. `.env` con `ANTHROPIC_API_KEY` completa (ver `.env.example`)

## Scripts disponibles

| Script | Comando corto | Qué hace | Módulo asociado |
|---|---|---|---|
| `verify-setup.ts` | `npm run verify` | Verifica API key + lista modelos disponibles | Módulo 0 (setup) |
| `01-hello-claude.ts` | `npm run hello` | Primer mensaje al modelo, imprime respuesta y tokens | Módulo 0 (setup) |

## Cómo correr un script

Cualquiera de estas formas funciona:

```bash
# Usando los npm scripts (recomendado)
npm run verify
npm run hello

# O directamente con tsx
npx tsx playground/verify-setup.ts
npx tsx playground/01-hello-claude.ts
```

## Conventions de los scripts

- **Nunca hardcodean la API key** — siempre `process.env.ANTHROPIC_API_KEY`.
- **Validan la presencia de la key al inicio** — si falta, dan instrucciones accionables y terminan con `exit(1)`.
- **Manejo de errores explícito** — distinguen entre `401` (key mala), `429` (rate limit), `529` (sobrecarga).
- **Output en español** — consistente con el idioma del curso.
- **Modelo default**: `claude-haiku-4-5` (el más barato), salvo scripts específicos de producción.

## Agregando nuevos scripts

A medida que el curso avance, nuevos scripts se irán agregando aquí. La convención de nombrado:

```
NN-descripcion-corta.ts
```

donde `NN` indica el orden en que aparecen en el curso. Ejemplos futuros (módulos 1-12):

- `02-streaming.ts` — SSE parsing manual
- `03-count-tokens.ts` — endpoint `/v1/messages/count_tokens`
- `04-tool-use-weather.ts` — flujo completo de tool use
- `05-prompt-caching.ts` — demostración de ahorro con cache_control
- `06-vision-analyze.ts` — análisis de imagen con el SDK
- `07-batch-submit.ts` — creación y polling de un batch
- `08-mcp-connector.ts` — MCP Connector en llamada directa a la API

Cada script debe tener en su header:

1. **Qué hace** en 2-3 líneas
2. **Cómo correrlo** (comando)
3. **Qué esperar** (output esperado)
4. **Módulo asociado** (para que el alumno lo relacione con la lección)
