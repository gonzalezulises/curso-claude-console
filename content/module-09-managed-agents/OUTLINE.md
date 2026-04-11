# Módulo 9 — Managed Agents: Agentes Hospedados

**Duración estimada:** 6 horas · **Lecciones:** 10 · **Ejercicios:** ~6 · **Modelo default del módulo:** `claude-sonnet-4-6` (opus para sub-agents críticos)

> ⚠️ **Producción de este módulo**: Managed Agents es beta activo (`managed-agents-2026-04-01`). Antes de escribir cada lección, verificar endpoints y payload shape con curl real contra `/v1/agents`, `/v1/sessions`, `/v1/environments`, `/v1/vaults`. No escribir ningún snippet sin validación. Ver nota detallada en `COURSE_STATE.yaml`.

## Objetivo del módulo

Al terminar sabrás cuándo elegir Managed Agents sobre construir tu propio loop de tool use, entenderás los **cinco recursos centrales** del API (`agents`, `sessions`, `environments`, `vaults`, `skills`), configurarás **sub-agents** dentro de un agent padre, montarás **credential vaults** de forma segura, y monitorearás la ejecución de tus sessions desde el dashboard y vía API.

## Prerrequisitos

- Módulo 5 (tool use)
- Módulo 7 (MCP — los agents consumen servers MCP)
- Módulo 8 (Skills)

## Arco narrativo

Hasta acá construiste agentes armando tu propio loop (`while stop_reason === 'tool_use': …`). Funciona, pero escalar eso a producción con memoria persistente, sandbox seguro, credenciales aisladas y observabilidad es meses de trabajo. **Managed Agents te da todo eso hospedado** por Anthropic. El trade-off: menos control que un loop propio. Este módulo te enseña cuándo aceptar ese trade-off.

## Lecciones

1. **Managed Agents: ¿qué problema resuelve y cuándo usarlo?** — comparación honesta con loop propio y con Claude Code SDK. Para cada uno, un caso donde es la mejor opción.
2. **El modelo de 5 recursos: agents, sessions, environments, vaults, skills** — cómo se relacionan, quién vive dentro de quién, lifecycle de cada uno.
3. **Crear un agent: POST /v1/agents** — nombre, model, system prompt, tool set inicial, configuración.
4. **Sessions: instancias en vivo del agent** — POST /v1/sessions, continuar una session, terminarla, persistencia de memoria.
5. **Environments: el sandbox de ejecución** — filesystem virtual, variables, límites de recursos, mount de vaults.
6. **Credential vaults: secretos aislados** — crear vault, montar en environment, cómo el agent los usa sin verlos en texto plano.
7. **Sub-agents: delegación estructurada** — un agent padre delega a agents hijos con permisos reducidos y contextos propios.
8. **Monitoreo: dashboard de sessions + logs via API** — dónde ver qué hizo el agent, cómo debuggear un tool_use que falló.
9. **Integración con MCP y Skills** — un agent puede usar tools definidos via MCP server y skills subidas a la cuenta.
10. **Lab: agente de soporte con vault + sub-agent** — un agent principal que responde al usuario, usa un vault con credenciales de Zendesk, y delega búsquedas de KB a un sub-agent especializado.

## Ejercicios planeados

- `ex-09-01-crear-agent.yaml` (code-typescript): crear agent básico, listar, describir
- `ex-09-02-session-lifecycle.yaml` (code-typescript): crear session, enviar mensaje, pausar, continuar, terminar
- `ex-09-03-environment-files.yaml` (code-typescript): crear environment, subir archivo, verificar que el agent lo lee
- `ex-09-04-vault-secrets.yaml` (code-typescript): crear vault con fake token, montarlo, verificar que el agent lo usa sin mostrarlo en el output
- `ex-09-05-subagent.yaml` (code-typescript): agent padre delegando a sub-agent
- `ex-09-06-lab-soporte.yaml` (code-typescript): el lab del módulo

## Lab del módulo

**Agente de soporte con vault + sub-agent** — un agent principal recibe preguntas de usuario, consulta un mock de knowledge base via tool, y para tickets complejos delega a un sub-agent "escalation-specialist" con credenciales de un Zendesk mock montadas vía vault. El alumno corre el flujo end-to-end y verifica en el dashboard la traza de ejecución.

## Conceptos de arquitecto

- **Managed Agents = delegar el runtime** (memoria, sandbox, secrets, monitoring) a Anthropic a cambio de un API más opinado
- **Sub-agents son límites de responsabilidad** — cada sub-agent tiene su contexto, tools y permisos, reduciendo blast radius
- **Vaults son el patrón correcto** para darle credenciales de terceros al agent sin exponerlas al modelo
- **Para control absoluto** (latencia custom, storage propio, fine-grained scheduling): seguís con loop propio; para **velocidad de delivery**: Managed Agents

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/managed-agents` (URLs a verificar al escribir — beta activo)

## Notas para la sesión de producción

- **Crítico**: este módulo es el que más riesgo tiene por ser beta. Presupuestar una sesión completa solo para validar endpoints con curls antes de escribir prosa.
- Si al momento de producción los endpoints o nombres de recursos cambiaron, actualizar el outline antes de avanzar.
- Considerar si hay un flag de "sandbox mode" que permita correr los labs sin costo real — sino documentar costo estimado.
