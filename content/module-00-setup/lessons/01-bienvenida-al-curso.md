# Bienvenida al curso

## Objetivo

Al terminar esta lección sabrás **qué vas a aprender**, **cómo está estructurado el curso**, y **qué tipo de arquitecto de Claude Code serás al terminarlo**.

## Concepto

### De dónde partes y a dónde llegas

Este curso asume que nunca tocaste Claude. Quizás probaste ChatGPT en el navegador, quizás escribiste algún script con la API de OpenAI, quizás has oído hablar de "agentes" pero nunca construiste uno. No importa. Lo que sí asumimos es que eres **developer funcional**: entiendes HTTP, lees JSON sin esfuerzo, has trabajado con APIs REST, sabes abrir un terminal y usar git.

Al terminar los 13 módulos, vas a poder hacer cosas que hoy probablemente te parecen impredecibles:

<outcome>

Serás capaz de decidir, con criterio técnico y no intuición, si un problema dado se resuelve mejor con la Messages API cruda, con Managed Agents hospedados por Anthropic, o integrando el Claude Agent SDK en tu propio backend. Vas a poder construir un agente de producción que combina tool use, MCP servers remotos, Skills reutilizables y Credential Vaults — y vas a saber exactamente dónde viven los secretos, qué rate limits te afectan, y cómo monitorear el costo real. Vas a configurar Claude Code en tu proyecto con subagents especializados, hooks de CI/CD, permission modes apropiados al tipo de repo, y MCP servers custom. Y al final, vas a arquitecturar un sistema multi-agente end-to-end con seguridad, observabilidad y deploy — el capstone del Módulo 12.

</outcome>

Esto no es hipérbole. Es literalmente el temario.

### ¿Cómo está estructurado el curso?

El curso tiene **13 módulos** (0-12), que puedes agrupar mentalmente en 5 fases:

| Fase | Módulos | Qué ganas |
|---|---|---|
| **Fundamentos** | 0 · 1 · 2 | Tu entorno funciona, dominas la Messages API cruda, sabes iterar prompts en Workbench |
| **Dominio del modelo** | 3 · 4 | Prompt engineering de nivel arquitecto y capacidades multimodales (vision, PDFs) |
| **De chat a agente** | 5 · 6 · 7 · 8 | Tool use, optimización con caching/batch, MCP y Skills |
| **Agentes de producción** | 9 · 10 · 11 | Managed Agents, Claude Code CLI/SDK completo, Admin API |
| **Síntesis** | 12 | Capstone: diseño y construcción de un sistema multi-agente real |

Cada módulo tiene entre 6 y 14 lecciones. Cada lección sigue **siempre la misma estructura** — esto es intencional, para que tu cerebro deje de gastar energía en "dónde está X" y se enfoque en el contenido:

1. **Objetivo** — una frase que te dice qué sabrás al terminar
2. **Concepto** — la teoría
3. **Ejecución real** — código que TÚ corres contra tu propia API key, con tu propio dinero (unos centavos)
4. **Anti-patterns** — qué NO hacer y por qué. Esta sección es el diferenciador
5. **Recap** — 3 takeaways antes de pasar a la siguiente

### La filosofía: protocolo primero, SDK después

Muchos cursos de AI te enseñan el SDK de moda. Este curso hace lo contrario: te enseña primero el **protocolo HTTP crudo**, con `curl`, y solo después te muestra el SDK de TypeScript o Python.

**¿Por qué?** Porque los SDKs cambian. La Messages API — el protocolo — es estable desde `anthropic-version: 2023-06-01`. Si entiendes el protocolo, puedes:

- Debuggear cualquier SDK roto
- Escribir clientes custom en Rust, Go, PHP, lo que necesites
- Razonar sobre networking: retries, streaming, rate limits, errores transitorios
- Entender qué hace cada método del SDK por debajo

Cada concepto nuevo se presenta primero con `curl`. Después, y solo después, verás el equivalente idiomático en TypeScript (stack primario del curso) o Python (secundario, cuando es más natural — batch processing, RAG, notebooks).

### La filosofía: anti-patterns explícitos

Casi todos los tutoriales te dicen qué hacer. Muy pocos te dicen qué **no** hacer. Y el salto de "developer que usa la API" a "arquitecto que toma decisiones" está exactamente ahí — en reconocer patrones incorrectos antes de que te cuesten dinero, tiempo o seguridad.

Cada lección tiene una sección **Anti-patterns** donde listamos explícitamente cosas como:

- ❌ Hardcodear API keys en código cliente
- ❌ Usar `claude-opus-4-6` para un clasificador simple (pagas 40x de más)
- ❌ Confiar en el output del LLM sin schema validation cuando te importa el formato
- ❌ Exponer una Admin API key a un frontend

Y junto a cada ❌, la razón concreta. No es regaño; es gimnasio.

### La filosofía: ejecución real, no demos

En este curso, **tú ejecutas**. No hay screenshots con "el modelo respondería algo así". Todo snippet de código en cada lección se corrió de verdad contra la API antes de pegarse. Cuando veas un output, es el output real.

Tú vas a hacer lo mismo desde el Módulo 0: setup de tu cuenta → primer curl → ver el JSON real → y de ahí en adelante nunca paras. Al final del curso habrás gastado unos **USD 5-15 en tokens** (depende de cuánto experimentes). Eso es el costo del gimnasio.

## Ejecución real

Esta lección es introductoria y no ejecutas código todavía. En la siguiente (Lección 02) creas tu cuenta, y en la Lección 04 haces tu primer `curl`.

Mientras tanto, un pequeño compromiso contigo mismo: **no saltes lecciones**. El orden del curso no es arbitrario. Si estás tentado a brincar directo al Módulo 10 (Claude Code) porque "ya usas Cursor" — no lo hagas. El Módulo 10 asume que ya pasaste por Messages API, tool use, MCP y Skills. Sin esa base, Claude Code se siente como magia; con esa base, se siente como lo que es: una herramienta más sobre primitivas que ya dominas.

## Anti-patterns

- ❌ **Saltarte al capstone pensando "ya sé".** El Módulo 12 requiere conocimientos de los 11 anteriores. No hay shortcut real.
- ❌ **Solo leer, sin ejecutar.** Este curso es un gimnasio. Si no haces los ejercicios, pierdes el 60% del valor.
- ❌ **Quedarte en ChatGPT pensando "Claude es lo mismo pero distinto".** No lo es. Los modelos 4.x tienen capacidades (citations nativas, server-side tools, extended thinking adaptive, Skills) que requieren pensar distinto. Si intentas traducir tus patrones de GPT directamente, vas a pasar por alto la mitad del poder.
- ❌ **Ignorar los anti-patterns.** Son la parte más valiosa del curso. Literalmente la razón por la que el curso existe.

## Recap

- **Destino**: ser capaz de decidir y construir sistemas de producción sobre todo el ecosistema Claude — Messages API, MCP, Managed Agents, Claude Code, Admin API.
- **Método**: protocolo primero (curl), SDK después, siempre con ejecución real y anti-patterns explícitos.
- **Compromiso**: no saltes lecciones, ejecuta cada ejercicio, presupuesta unos USD 5-15 en tokens durante todo el curso.


## Ejercicio interactivo

<Quiz id="ex-00-03-identificar-secciones" />

---

**Fuente oficial:** [platform.claude.com/docs/en/docs/welcome](https://platform.claude.com/docs/en/docs/welcome)
**Ejercicio:** <!-- exercise:ex-00-03-identificar-secciones -->
