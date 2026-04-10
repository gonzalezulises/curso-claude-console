# Módulo 6 — Optimización & Producción

**Duración estimada:** 5 horas · **Lecciones:** 8 · **Ejercicios:** ~6 · **Modelo default del módulo:** `claude-sonnet-4-6`

## Objetivo del módulo

Al terminar sabrás **bajar costos 90% con prompt caching**, usar la **Batch API** para trabajos asíncronos a mitad de precio, activar **extended cache TTL** (1h) y **contexto 1M**, leer Analytics para detectar hotspots, y diseñar tus prompts para ser cacheables desde el primer diseño.

## Prerrequisitos

- Módulos 1, 3 y 5 (API, prompts, tool use)

## Arco narrativo

Los módulos anteriores te enseñaron a hacer las cosas. Este te enseña a hacerlas **baratas y estables en producción**. Un arquitecto que no entiende caching, batch y rate limits termina pagando 10x más de lo necesario y con sistemas frágiles en picos de tráfico.

## Lecciones

1. **Prompt caching: cómo funciona y cuánto ahorra** — breakpoints con `cache_control: {type: 'ephemeral'}`, TTL 5m default, ~90% descuento en reads, tokens mínimos del cache block.
2. **Diseñar prompts cacheables** — orden estable/variable, dónde poner cache breakpoints, anti-pattern de meter timestamp al principio.
3. **Extended cache TTL: 1 hora** — beta `extended-cache-ttl-2025-04-11`, cuándo vale la pena, el costo de write extendido.
4. **Batch API: mitad de precio, async** — `/v1/messages/batches`, estructura del batch, polling, cómo recuperar resultados, cuándo usarla.
5. **Context 1M tokens** — beta `context-1m-2025-08-07`, costo progresivo, estrategias de long-context (pegan con el Módulo 3).
6. **Rate limits: RPM, ITPM, OTPM** — qué dispara cada uno, cómo leer headers de respuesta (`anthropic-ratelimit-*`), cómo reaccionar a `429` apropiadamente.
7. **Leer Analytics para optimizar** — identificar los 3-5 endpoints/prompts que consumen el 80% del costo, encontrar hotspots de cache miss.
8. **Lab: optimizar un prompt caro** — tomar un prompt de 40K tokens no cacheado, aplicar caching + cambio de modelo cuando corresponda + batch si el caso lo permite, medir costo pre/post.

## Ejercicios planeados

- `ex-06-01-cache-basico.yaml` (code-typescript): llamar 5 veces con cache_control, verificar que `cache_read_input_tokens` crece
- `ex-06-02-cache-breakpoint.yaml` (code-typescript): estructurar un prompt con 2 breakpoints (sistema + documentos)
- `ex-06-03-batch-submit.yaml` (code-python): enviar un batch de 100 prompts, pollear, descargar resultados
- `ex-06-04-rate-limits.yaml` (code-typescript): leer headers de rate limit y usarlos para throttling proactivo
- `ex-06-05-context-1m.yaml` (code-typescript): llamada con beta header a 600K tokens (ejercicio opcional por costo)
- `ex-06-06-lab-optimize.yaml` (code-typescript): el lab del módulo

## Lab del módulo

**Optimizar un prompt caro** — el alumno recibe un script TS que hace 100 llamadas repetidas con un prompt de 30K tokens cada una, todas con el mismo system pero payload variable. Aplica cache_control apropiadamente, reejecuta, compara tokens totales y costo. Target: >80% reducción.

## Conceptos de arquitecto

- Caching es **el primer optimizer** antes de cambiar de modelo o de proveedor
- Batch API es **gratis de complejidad** para workloads async (reports, backfills, evaluación)
- Rate limits no son un castigo — son una señal de diseño; respondé con throttle, no con retry agresivo
- Analytics + cost reports te dicen **dónde optimizar**; no optimices a ciegas
- El costo del write de cache se recupera después de ~2 reads en el mismo TTL

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/prompt-caching`
- `platform.claude.com/docs/en/build-with-claude/batch-processing`
- `platform.claude.com/docs/en/api/messages-batches`
- `platform.claude.com/docs/en/api/rate-limits`

## Notas para la sesión de producción

- Los precios y descuentos de caching deben verificarse al momento de escribir cada lección — pegar la URL de la página de precios.
- Batch requiere tiempos de completion reales — el ejercicio debería poder correrse en ~15 minutos max.
