# Leer Analytics para optimizar

## Objetivo

Al terminar esta lección sabrás **qué vistas de Analytics y Cost & Usage exponen qué información**, cómo identificar los **3-5 hotspots** que consumen el 80% de tu costo (regla 80/20), cómo detectar cache miss sistemático, y cómo traducir esos hallazgos en acción concreta (cachear, bajar modelo, migrar a batch).

## Concepto

### La promesa del módulo: optimizás lo que medís

Todas las técnicas de los módulos anteriores (caching, batch, context control) son **herramientas**. La decisión de qué aplicar depende de **dónde está tu costo**. Sin datos, optimizás a ciegas.

Anthropic expone datos de uso a través de:

1. **Console Analytics** — dashboard visual, histórico de uso.
2. **Cost & Usage endpoints** — datos crudos para pegar a tu propio BI.
3. **Response `usage` objects** — por-request, en tiempo real.

> **Nota:** la UI de Analytics en `platform.claude.com` cambia seguido. Los nombres exactos de paneles y filtros en esta lección pueden estar desactualizados — siempre validá en tu console. La **estructura conceptual** (cómo pensar los datos) sí es estable.

### Qué hay en el Console Analytics

Secciones típicas en `platform.claude.com/.../usage`:

- **Total spend** por período (día, semana, mes).
- **Breakdown por modelo** (Opus, Sonnet, Haiku).
- **Breakdown por workspace** (si organizás por proyecto).
- **Tokens input vs output vs cached**.
- **Requests por hora del día** — te muestra patrones de tráfico y picos.

### Las 3 preguntas que querés responder

Cuando revisás Analytics, buscá respuestas concretas a:

**1. ¿Cuál es mi distribución entre modelos?**

Si el 90% de tu gasto es en Opus pero el 80% de tus tasks son bien resueltos por Sonnet/Haiku, tenés un problema de routing. Regla: empezá por Haiku, subí a Sonnet cuando sea necesario, subí a Opus solo para reasoning profundo.

**2. ¿Qué porcentaje de mis input_tokens vienen del cache?**

El ratio `cache_read / (cache_read + input_tokens + cache_creation)` idealmente debería estar arriba de 60-70% en apps con prompt estable. Si está bajo:
- Prefix variable → revisá lección 02.
- Bloques bajo el mínimo → engordá.
- TTL 5m no alcanza para tu tráfico → probá 1h.

**3. ¿Hay workloads que podrían ser async?**

Si tenés un cron nocturno que genera 10K informes diarios sin necesidad de respuesta rápida, eso debería estar en Batch API (50% off). Mirá en Analytics los picos: si hay una hora del día con tráfico que parece "procesamiento masivo", es candidato.

### El ratio que importa: costo por task útil

Un error común es optimizar "el costo total" sin referencia a valor generado. Mejor KPI:

```
costo por task completado = total_cost / tasks_completadas_en_período
```

Ejemplo: si procesás 50K tickets de soporte al mes y gastás $5000, tu costo por ticket es $0.10. Reducir costos 50% te baja a $0.05/ticket. Saber eso te deja comparar con alternativas (trabajo humano, outsourcing, otro modelo).

### Detectar cache miss sistemático

Señal de alarma: tu app tiene `cache_control` bien puesto, pero el ratio de cache reads es <10%. Diagnóstico paso a paso:

1. **Tomá 10 requests reales** (prod o staging) con logging de `usage`.
2. Mirá `cache_creation_input_tokens` en cada una. Si **todas** muestran writes sin reads, tu prefix cambia request a request.
3. Copiá dos prefixes consecutivos byte-a-byte y buscá el diff. Suele ser:
   - Un timestamp.
   - Un user ID en el system.
   - Un JSON con orden de keys no determinístico.
   - Un `\r\n` vs `\n`.

### Patrones de uso a vigilar

**Patrón anti-económico 1**: "llamadas repetidas con mismo system a diferentes users".
```
Analytics: 80% del spend es input tokens en un system de 20K tokens.
→ aplicá cache_control. Ahorro esperable: ~70%.
```

**Patrón anti-económico 2**: "Opus usado para tasks simples".
```
Analytics: 70% del spend de Opus es en requests con <500 output_tokens.
→ esas tasks probablemente no justifican Opus. Migrá a Sonnet o Haiku.
```

**Patrón anti-económico 3**: "Context 1M usado sin cache".
```
Analytics: input_tokens promedio 400K, cache_read_input_tokens: 0.
→ pagás 2x sobre los tokens extendidos Y sin cache. Cacheá o reduci contexto.
```

**Patrón anti-económico 4**: "Mucho RPM en horarios async".
```
Analytics: picos de 100 req/min a las 03:00 AM (cron job).
→ migrá a Batch API (50% off, sin contar contra RPM).
```

### Workflow de optimización continua

Rutina mensual típica:

```
1. Exportá el cost breakdown del mes.
2. Sort por gasto descendente.
3. Para cada uno de los top 5 consumers:
   a. ¿Qué porcentaje es cached?
   b. ¿Podría usar un modelo más barato?
   c. ¿Es async? → Batch
   d. ¿Está usando context extendido innecesariamente?
4. Aplicá la mejora más barata de implementar primero.
5. Remedí 30 días después.
```

El primer ciclo suele dar 40-70% de reducción. Los siguientes son refinamientos (10-20%).

## Ejecución real

### Extraer `usage` agregado de tus propios logs

Si loggeás el `usage` de cada response, podés analizar localmente:

```typescript
// Suponé que tenés un log file con líneas: {timestamp, request_id, model, usage}
import { readFileSync } from "node:fs";

const lines = readFileSync("api_logs.jsonl", "utf-8").split("\n").filter(Boolean);
const logs = lines.map((l) => JSON.parse(l));

// Stats por modelo
const byModel: Record<string, any> = {};
for (const log of logs) {
  const m = log.model;
  if (!byModel[m]) byModel[m] = { requests: 0, inputTokens: 0, cacheRead: 0, cacheWrite: 0, outputTokens: 0 };
  byModel[m].requests += 1;
  byModel[m].inputTokens += log.usage.input_tokens ?? 0;
  byModel[m].cacheRead += log.usage.cache_read_input_tokens ?? 0;
  byModel[m].cacheWrite += log.usage.cache_creation_input_tokens ?? 0;
  byModel[m].outputTokens += log.usage.output_tokens ?? 0;
}

for (const [model, stats] of Object.entries(byModel)) {
  const totalInput = stats.inputTokens + stats.cacheRead + stats.cacheWrite;
  const cacheRatio = totalInput > 0 ? (stats.cacheRead / totalInput * 100).toFixed(1) : "0";
  console.log(`${model}: ${stats.requests} req, ${(totalInput/1e6).toFixed(2)}M input tokens, cache hit ratio: ${cacheRatio}%`);
}
```

Output esperado:
```
claude-haiku-4-5: 12400 req, 3.20M input tokens, cache hit ratio: 68.4%
claude-sonnet-4-6: 890 req, 2.10M input tokens, cache hit ratio: 42.1%
claude-opus-4-6: 43 req, 0.18M input tokens, cache hit ratio: 0.0%
```

**Interpretación**: Opus está sin cache — revisá si podés cachearlo. Sonnet está en 42% — hay espacio para optimizar.

### El Cost API (si disponible en tu org)

Algunas cuentas enterprise tienen acceso a un endpoint de Cost & Usage que devuelve breakdowns agregados por día/modelo/workspace. La estructura cambia — consultá la docs de tu org.

### El dashboard visual

En `platform.claude.com`:
- **Home → Usage**: gráficos de costo por día, split por modelo.
- **Workspaces → `<workspace>` → Usage**: el mismo breakdown pero filtrado por workspace.
- **API Keys → `<key>` → Usage**: por-key (si hay múltiples apps).

Usá los filtros de **fecha**, **modelo**, y **workspace** para encontrar el hotspot.

## Anti-patterns

- ❌ **Optimizar sin medir**. Aplicar caching "porque sí" sin saber cuánto de tu costo es input cacheable es perder tiempo. Siempre empezá mirando Analytics.
- ❌ **Mirar solo costo total sin dividir por task**. Un aumento del 50% en costo puede venir de un 50% aumento de tráfico útil — no es un problema.
- ❌ **Reaccionar a picos aislados**. Un día raro con 3x el spend normal puede ser un bug pasajero, no un patrón. Mirá medias móviles, no días individuales.
- ❌ **Confiar solo en el dashboard visual**. Exportá a CSV o loggeá localmente para hacer análisis más finos (ratios, distribuciones, percentiles).
- ❌ **Optimizar el último 5%**. Después del primer ciclo (40-70% savings) las mejoras son marginales. Invertí ese tiempo en mejores productos, no en exprimir otro 2%.
- ❌ **Olvidar el `output_tokens`**. Muchos devs miran solo input. Haiku con respuestas largas puede costarte más que Sonnet con respuestas concisas. Revisá ambos.

## Recap

- Analytics responde 3 preguntas: **¿distribución entre modelos? ¿ratio de cache? ¿qué podría ser async?**
- El KPI útil es **costo por task completado**, no costo absoluto.
- Ratio de cache ideal: >60-70% en apps con prompt estable.
- Hotspots más comunes: Opus sobre-utilizado, cache miss sistemático, cron jobs sin batch, context 1M sin cache.
- Workflow mensual: exportá, ordená, optimizá el top 5, medí de nuevo 30 días después.
- Loggeá el `usage` de cada request **localmente** — te da poder de análisis que el dashboard no siempre ofrece.

---

**Fuente oficial:** [platform.claude.com/docs/en/api/cost-usage](https://platform.claude.com/docs/en/api/cost-usage) *(verificá en tu console — URL puede variar)*
**Ejercicio:** *(sin ejercicio dedicado — cubierto en el lab del módulo)*
