# Lab: refactor de un prompt malo

## Objetivo

Al terminar habrás **aplicado las 8 técnicas del módulo** a un prompt real caótico y medido el impacto en calidad, costo y estabilidad. Este es el lab del módulo — no hay teoría nueva, solo ensamble y medición.

## Concepto

### El ejercicio: de caos a producción

Vas a recibir un prompt que hace una tarea legítima (resumir un artículo técnico y clasificar su relevancia) pero está escrito de la peor manera posible: vago, sin formato, sin ejemplos, sin separación de instrucciones y datos, con cortesía innecesaria, y sin restricciones medibles.

Tu trabajo es refactorizarlo **paso a paso**, aplicando una técnica del módulo por paso, midiendo el output después de cada cambio, y documentando qué mejoró y qué no.

### El prompt original (malo a propósito)

```
Hola Claude, ¿podrías por favor leer este artículo y decirme de qué trata?
Me gustaría que me hagas un resumen y también me digas si es relevante para
mi investigación sobre seguridad en APIs. Sería genial si pudieras ser breve
pero completo, y si es relevante me gustaría saber por qué. También necesito
que clasifiques qué tan relevante es, algo así como alta media o baja.
Ah, y si pudieras dar tu respuesta de forma que sea fácil de procesar
programáticamente eso sería ideal. Gracias!

Artículo: OAuth 2.0 es un framework de autorización que permite a
aplicaciones de terceros obtener acceso limitado a un servicio HTTP, ya sea
en nombre del propietario del recurso o permitiendo que la aplicación obtenga
acceso por cuenta propia. OAuth 2.0 define cuatro roles: resource owner,
resource server, client y authorization server. El protocolo incluye varios
grant types: authorization code (para apps server-side), implicit (deprecado),
resource owner password credentials (legacy, no recomendado), y client
credentials (para comunicación machine-to-machine). Los tokens de acceso
tienen tiempos de expiración y se pueden renovar con refresh tokens. Las
vulnerabilidades comunes incluyen token theft via open redirectors, CSRF
attacks contra el redirect URI, y token leakage en logs del servidor.
Mitigaciones estándar incluyen PKCE para authorization code flow, state
parameter contra CSRF, y token binding.
```

### Los 8 pasos del refactor

Cada paso aplica **una** técnica del módulo. El alumno debe ejecutar el prompt después de cada paso, comparar con el anterior, y documentar qué cambió.

**Paso 1 — Ser claro y directo (Lección 01)**

Reemplazar la cortesía y la vaguedad con verbos imperativos y outcomes medibles.

Original → Directo:

```
Resumí el artículo de <article> en ≤100 palabras. Clasificá su
relevancia para investigación en seguridad de APIs como: alta, media, o baja.
Si es alta o media, listá las razones en ≤3 bullets.
```

**Paso 2 — Ejemplos few-shot (Lección 02)**

Agregar un ejemplo de output esperado para que Claude ancle el formato.

```
Ejemplo:
Resumen: OAuth 2.0 es un framework de autorización... (≤100 palabras)
Relevancia: alta
Razones:
- Define protocolos de autenticación usados en APIs
- Documenta vulnerabilidades explotables
- Incluye mitigaciones específicas
```

**Paso 3 — Chain of thought (Lección 03)**

Para la clasificación de relevancia (que requiere juicio), pedir razonamiento antes de la clasificación.

```
Primero razoná en ≤50 palabras por qué el artículo es o no es relevante
para seguridad de APIs. Después clasificá.
```

**Paso 4 — Extended thinking (Lección 04)**

Si usás Sonnet o Opus, activar `thinking: { type: "enabled", budget_tokens: 2048 }` en vez del CoT en el prompt. Esto separa el razonamiento del output visible.

(Si usás Haiku, mantener el CoT del paso 3.)

**Paso 5 — XML tags (Lección 05)**

Estructurar el prompt con tags para separar instrucciones, artículo y formato.

```xml
<instructions>
Resumí el artículo dentro de <article> en ≤100 palabras...
</instructions>

<article>
OAuth 2.0 es un framework...
</article>

<output_format>
Resumen: (≤100 palabras)
Relevancia: alta | media | baja
Razones: (≤3 bullets, solo si alta o media)
</output_format>
```

**Paso 6 — System prompt compuesto (Lección 06)**

Mover el rol y las restricciones al system:

```json
{
  "system": "Eres un investigador de seguridad senior. Tu audiencia son ingenieros que evalúan papers para un survey. Respondés en español, sin preámbulos ni saludos. Solo respondés con el formato especificado en <output_format>."
}
```

**Paso 7 — Prefill (Lección 07)**

Forzar el inicio del output con `"Resumen:"`:

```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "Resumen:" }
  ]
}
```

**Paso 8 — Long context (Lección 08)**

Si escalás a múltiples artículos, aplicar las reglas: documentos con tags, índice al principio, pregunta al final. Anotar que para un solo artículo este paso no aplica, pero el alumno debe documentar **cómo escalaría** el prompt si recibiera 50 artículos.

### Qué medir en cada paso

Después de cada paso, el alumno ejecuta el prompt y anota:

| Métrica | Cómo medirla |
|---|---|
| `input_tokens` | `usage.input_tokens` de la respuesta |
| `output_tokens` | `usage.output_tokens` de la respuesta |
| `stop_reason` | `stop_reason` — debe ser `end_turn` |
| Cumple formato | ¿El output tiene exactamente las secciones pedidas? |
| Clasificación correcta | ¿La relevancia es "alta"? (es el ground truth para este artículo) |
| Parseable | ¿Puedo extraer cada campo con regex o split? |
| Varianza | Correr 3 veces y ver si el formato cambia |

## Ejecución real

No pegamos output aquí — este es el ejercicio que vas a hacer vos. El flow es:

1. Corré el prompt original tal cual (el "malo"). Observá el output: probablemente largo, con preámbulo "¡Claro!", formato inconsistente, difícil de parsear.
2. Aplicá cada paso del 1 al 7 (el paso 8 es documentación de escalabilidad). Después de cada paso, corré y anotá las métricas.
3. Al final, compará métricas del paso 0 (original) vs paso 7 (final). **Target**: reducción de output tokens ≥50%, formato parseable en 3/3 corridas, clasificación correcta "alta" en todas.

El ejercicio `ex-03-06-lab-refactor.yaml` te da el starter code, la rubric exacta y los test cases.

## Anti-patterns

- ❌ **Aplicar todas las técnicas de golpe**. El valor del lab es ver qué aporta **cada** técnica individualmente. Si aplicás las 8 en un solo paso, no sabés cuál movió la aguja.
- ❌ **Optimizar para un solo output**. El prompt debe ser estable — corré al menos 3 veces por paso. Si 2/3 fallan en formato, el prompt no es robusto.
- ❌ **No medir tokens**. La mitad del valor de prompt engineering es económica. Si tu prompt refactorizado gasta más tokens que el original, algo está mal (salvo que la calidad lo justifique).
- ❌ **Copiar el prompt de ejemplo del libro en vez de refactorizar paso a paso**. El aprendizaje está en el proceso iterativo, no en el resultado final.
- ❌ **Ignorar el paso 8 (escalabilidad)**. Aunque no ejecutes 50 artículos, documentar cómo escalaría demuestra pensamiento arquitectural.
- ❌ **No documentar las decisiones**. "Elegí Haiku porque la clasificación es simple y no justifica Sonnet" es una decisión arquitectural. "Descarté extended thinking porque estoy en Haiku" también. Anotá todo.

## Recap

- Este lab **no tiene teoría nueva** — es ensamble de las 8 técnicas del módulo en un caso concreto.
- **Aplica una técnica por paso** y medí el impacto de cada una individualmente.
- **Métricas**: input tokens, output tokens, stop_reason, cumplimiento de formato, correctitud de clasificación, varianza entre corridas.
- **Target del lab**: output tokens ≥50% menos que el original, formato parseable 3/3 veces, clasificación "alta" correcta.
- **Documentar decisiones** es parte del entregable — la rubric evalúa justificación, no solo el prompt final.

---

**Ejercicio:** <!-- exercise:ex-03-06-lab-refactor -->
