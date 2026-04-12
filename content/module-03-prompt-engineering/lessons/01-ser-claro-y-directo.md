# Ser claro y directo

## Objetivo

Al terminar sabrás **por qué "ser directo" es la primera técnica de prompt engineering que Anthropic recomienda para Claude 4.x**, qué diferencia operativa hay entre un prompt vago y uno directo (con números reales de tokens y costo), y tendrás un check-list de 5 puntos que podés aplicar a cualquier prompt que escribas a partir de hoy.

## Concepto

### ¿Qué significa "directo" técnicamente?

Anthropic documenta una regla muy simple para Claude 4.x: **decile al modelo exactamente lo que querés, con verbos imperativos, sin cortesía, y con el outcome explícito medible**. No es una opinión estilística — es la técnica que más reduce varianza de output en los benchmarks internos.

Lo que cuenta como "directo":

<terminology>
**Verbo imperativo al inicio**: `Resumí`, `Listá`, `Traducí`, `Clasificá`, `Extraé`. No `¿Podrías...?` ni `Necesito que...`. El modelo no se ofende; gasta tokens en parsear la cortesía.

**Outcome medible**: `en 3 bullets`, `máximo 15 palabras por bullet`, `en formato JSON con las claves X, Y, Z`, `sin exceder 200 tokens`. "Sé breve" no es medible. "3 bullets de 15 palabras" sí.

**Restricciones negativas específicas**: `sin preámbulos`, `sin headings`, `sin emojis`, `sin markdown`. Las negaciones funcionan cuando son concretas; `no seas verboso` no mueve la aguja.

**Formato de salida fijado**: Decile si querés markdown, JSON, texto plano, CSV. Si no lo decís, Claude va a elegir (y suele elegir markdown con headings y emojis, que es lo que **no** querés consumir desde código).

**Audiencia implícita del output**: `para que lo lea un parser`, `para un developer senior`, `para un estudiante`, `para copiar-pegar a un ticket de Jira`. Ancla el nivel de detalle y el registro.
</terminology>

### Por qué importa: el modelo "rellena los huecos" con sus priors

Si tu prompt deja huecos, Claude 4.x no te pregunta — **completa con lo que estadísticamente le parece**. Y sus priors están calibrados por el corpus de entrenamiento: markdown con headings, tablas, emojis, preámbulos tipo "¡Claro! Acá tenés...". Para un humano leyendo en Workbench puede estar bien. Para **tu app que hace `JSON.parse()` sobre la respuesta**, es un bug.

El costo del hueco no es solo "formato feo". Es:

1. **Tokens de output malgastados** en estructura que no necesitás.
2. **Varianza altísima** entre llamadas: dos llamadas con el mismo prompt vago pueden devolver formatos diferentes.
3. **Imposibilidad de postprocesar** con reglas determinísticas: si a veces hay heading y a veces no, tu parser se rompe.
4. **Debugging difícil**: cuando el output cambia y no sabés si fue el modelo, la temperatura o tu prompt, la primera variable a controlar es la claridad del prompt.

### El check-list de 5 puntos

Antes de mandar cualquier prompt a producción, pasalo por estas 5 preguntas:

1. **¿Arranca con un verbo imperativo?** Si empieza con `¿Podrías...`, `Me gustaría que...`, `Necesito...`, reescribilo.
2. **¿El outcome es medible?** Si la evaluación "¿cumple?" no se puede hacer con una regex o un contador de bullets, no es medible.
3. **¿Está fijado el formato de salida?** Markdown, JSON, texto plano, CSV — elegí uno y escribilo.
4. **¿Están las restricciones negativas importantes?** Sin preámbulo, sin emojis, sin markdown si vas a parsear, sin saludos.
5. **¿Claude sabe para quién es el output?** Un parser, un humano, un template — si no lo decís, va a asumir "humano leyendo Workbench".

Si un prompt no pasa los 5, **reescribilo antes de correrlo**. Vale diez minutos de iteración local más que mil llamadas en producción con output inconsistente.

### "Directo" no es "rudo" ni "corto"

Confusión común: "directo" no significa `"resume esto"`. Significa `"Resumí el siguiente texto en 3 bullets de máximo 15 palabras cada uno, sin preámbulos, para copiar-pegar a Slack"`. El segundo es **más largo** que el primero, pero es directo. Podés escribir un prompt de 200 palabras que sea perfectamente directo si cada palabra aporta una restricción concreta.

La otra confusión: "directo" no significa maleducado. Al modelo le da igual — pero tampoco ganás nada con `"Hacelo YA y no me jodas con preámbulos"`. Los verbos imperativos neutrales (`Resumí`, `Generá`, `Listá`) son óptimos.

## Ejecución real

Vamos a tomar el mismo texto y pedirlo con dos prompts: uno vago y uno directo. El texto es un párrafo sobre retries con exponential backoff (de hecho, sacado del propio Módulo 1 de este curso).

**Paso 1 — Prompt vago**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 400,
    "messages": [{
      "role": "user",
      "content": "Resume este texto: Los retries con exponential backoff son críticos cuando una API de IA responde 429 o 529. En vez de reintentar inmediatamente, cada intento espera el doble que el anterior más un jitter aleatorio. Sin jitter, múltiples clientes chocan simultáneamente al reintentar. El límite típico es 5 intentos con ceiling de 60 segundos."
    }]
  }'
```

Output real:

```
# Resumen

**Retries con exponential backoff para APIs de IA:**

- **Cuándo usarlo:** Ante errores 429 (rate limit) o 529 (servicio no disponible)
- **Cómo funciona:** Cada reintento espera el doble que el anterior, más un jitter aleatorio
- **Por qué el jitter:** Evita que múltiples clientes reintenten simultáneamente
- **Límites típicos:** 5 intentos máximo con espera máxima de 60 segundos

usage: input_tokens=105, output_tokens=139
stop_reason: "end_turn"
```

Claude eligió: un heading `# Resumen`, una línea en negrita como título, 4 bullets con `**término:**` en cada uno. **Ni lo pediste, ni probablemente lo querías**. Si tu app lo consume, tenés que limpiar headings, negritas y ese `**Cuándo usarlo:**` al inicio de cada bullet.

**Paso 2 — Prompt directo**

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 400,
    "messages": [{
      "role": "user",
      "content": "Resumí el siguiente texto en exactamente 3 bullets de máximo 15 palabras cada uno. Sin preámbulos, sin cierre, sin headings, sin negritas. Solo los 3 bullets con guión.\n\nTexto: Los retries con exponential backoff son críticos cuando una API de IA responde 429 o 529. En vez de reintentar inmediatamente, cada intento espera el doble que el anterior más un jitter aleatorio. Sin jitter, múltiples clientes chocan simultáneamente al reintentar. El límite típico es 5 intentos con ceiling de 60 segundos."
    }]
  }'
```

Output real:

```
- Los retries con exponential backoff evitan sobrecargar APIs de IA ante errores 429 o 529.
- Cada intento espera el doble que el anterior, más jitter aleatorio para evitar colisiones simultáneas.
- El límite típico es 5 intentos con techo máximo de 60 segundos entre reintentos.

usage: input_tokens=156, output_tokens=91
stop_reason: "end_turn"
```

Exactamente 3 bullets. Cada uno con guión. Sin preámbulo. Sin heading. Sin negritas. **Parseable con `output.split('\n- ')` y listo**.

**Paso 3 — La comparación numérica (que no es obvia)**

| | Vago | Directo | Delta |
|---|---|---|---|
| `input_tokens` | 105 | 156 | **+51** |
| `output_tokens` | 139 | 91 | **−48** |
| Formato | 1 heading + 1 title + 4 bullets con negritas | 3 bullets planos | |
| Parseable en 1 línea | ❌ | ✅ | |
| Varianza entre llamadas | alta | muy baja | |

Dos observaciones importantes:

1. **El prompt directo gastó 51 input tokens más**, porque dejaste explícitas todas las restricciones. Eso no es malo — es diseño.
2. **Ahorró 48 output tokens**. Como el output es típicamente ~5x más caro que el input (ver pricing de Haiku 4.5 y Sonnet 4.6), incluso en este ejemplo trivial el prompt directo **salió más barato**: `51 × 1x − 48 × 5x = +51 − 240 = −189` tokens de costo equivalente. A escala, esto se multiplica por miles de llamadas.
3. La varianza no se ve acá, pero si corrés el Paso 1 diez veces vas a ver diez formatos distintos (a veces tabla, a veces prosa, a veces solo bullets). El Paso 2 vas a ver **casi siempre el mismo shape**. Esa estabilidad vale más que los tokens ahorrados para cualquier sistema que parsea el output.

## Anti-patterns

- ❌ **Empezar con `¿Podrías...?` o `Me gustaría que...`.** Claude los ignora semánticamente pero gasta tokens parseándolos y puede interpretar el tono como "hay margen para preámbulos amables en la respuesta".
- ❌ **"Sé breve", "No seas verboso", "Sé conciso" como única instrucción de longitud.** Son subjetivas. Usá `máximo N palabras`, `en 3 bullets`, `en ≤ 200 tokens`.
- ❌ **Dejar el formato sin especificar cuando el output lo consume otro sistema.** Si lo va a leer un parser, decilo explícitamente: `responde solo con JSON`, `solo texto plano`, `solo una lista CSV`. Si no, el modelo elige.
- ❌ **Mezclar instrucciones y el contenido a procesar sin separador**. Ya lo viste en los ejemplos: `"Resumí lo siguiente en 3 bullets.\n\nTexto: ..."` con un newline explícito es 10x más confiable que `"Resumí en 3 bullets: ..."`. En la Lección 05 vas a ver la versión definitiva con XML tags.
- ❌ **Restringir negativamente cosas triviales y dejar libre lo importante.** Decir `no uses emojis` mientras no especificás cuántos bullets querés es optimizar ruido y dejar abierto lo que duele.
- ❌ **Asumir que el modelo "entiende lo que quise decir".** Claude 4.x es bueno inferiendo contexto, pero la diferencia entre un prompt medible y uno vago se paga en varianza. Si tu evaluación "¿salió bien?" requiere leerlo y opinar, tu prompt no es directo.
- ❌ **Reescribir tu prompt después de ver un output feo, en lugar de antes.** "Iterar contra el modelo hasta que sale bien" es cómo se pierden tardes. Pasá el check-list de 5 puntos **antes** de la primera llamada.

## Recap

- "Ser directo" es técnica 1 de Anthropic para Claude 4.x porque es la que más **reduce varianza** — no es opinión estilística.
- **Verbo imperativo + outcome medible + formato fijado + restricciones negativas concretas + audiencia implícita**. Esas son las 5 piezas.
- Un prompt directo **gasta más input tokens** pero **ahorra output tokens y estabiliza el shape** — suele ser más barato neto.
- "Directo" no es "corto" ni "rudo": es **explícito**. Un prompt de 200 palabras puede ser perfectamente directo si cada palabra aporta una restricción.
- Pasá cualquier prompt por el check-list de 5 puntos **antes** de mandarlo por primera vez, no después del primer output feo.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/prompt-engineering/be-clear-and-direct](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/be-clear-and-direct)
**Ejercicio:** <!-- exercise:ex-03-01-directo-vs-vago -->
