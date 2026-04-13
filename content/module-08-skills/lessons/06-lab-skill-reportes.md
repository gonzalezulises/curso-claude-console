# Lab: skill para generar reportes markdown estandarizados

## Objetivo

Al terminar esta lección vas a haber construido, subido y probado una skill custom (`markdown-report`) que enseña a Claude a producir reportes markdown con un formato fijo de tu "organización": frontmatter YAML con metadatos, secciones canónicas en orden, bloques de métricas, y una validación automática vía script. Esto es el primer patrón serio de skill aplicable a trabajo real.

## Concepto

### El caso de negocio

Imaginá que tu equipo produce ~10 reportes semanales (status semanal, post-mortems, análisis de incidente, etc.) y todos deben seguir un formato estándar que la organización acordó:

- Frontmatter con metadata (`author`, `date`, `type`, `owner_team`).
- Secciones obligatorias en orden: `TL;DR`, `Context`, `Findings`, `Metrics`, `Next steps`.
- Métricas en bloques delimitados (`<metric>...</metric>`) para que un parser downstream las extraiga.
- Longitud máxima por sección (para que se lea en 5 min).

Sin skill, cada autor copia un template, olvida una sección, pone frontmatter diferente, y el parser downstream rompe. Con skill: Claude aplica el formato exacto siempre, y un validador inline rechaza salidas que no cumplen.

### La skill que vamos a construir

Nombre: `markdown-report`. Estructura del bundle:

```
markdown-report/
├── SKILL.md              ← instrucciones principales
├── TEMPLATE.md           ← ejemplo canónico para que Claude referencie
└── scripts/
    └── validate.py       ← checker automático antes de devolver
```

### Diseño del `SKILL.md`

```markdown
---
name: markdown-report
description: Use this skill when the user asks to generate a company-standard markdown report (weekly status, post-mortem, incident analysis, investigation summary). Produces a report with required frontmatter, canonical sections in order (TL;DR, Context, Findings, Metrics, Next steps), and inline metric blocks. Validates output before returning. Do NOT trigger for free-form writing, blog posts, or documents without a structured "report" request.
---

# Markdown Report Skill

## When to trigger
- User asks for "weekly report", "status report", "post-mortem", "incident report", or "investigation summary".
- User provides data/findings and asks for a structured writeup.

## When NOT to trigger
- Free-form prose, blog posts, marketing copy.
- Technical documentation (README, API reference).
- Quick answers or chat-style replies.

## Output structure (mandatory)

### Frontmatter
Every report opens with YAML frontmatter between `---` fences:

```yaml
---
author: [string, required]
date: [YYYY-MM-DD, required]
type: weekly | post-mortem | incident | investigation
owner_team: [string, required]
---
```

### Sections (in this exact order)

1. `## TL;DR` — max 3 sentences.
2. `## Context` — what happened / what was investigated. Max ~150 words.
3. `## Findings` — bullet list of key facts. Each bullet max 2 sentences.
4. `## Metrics` — each quantitative finding wrapped in `<metric>` blocks (see TEMPLATE.md).
5. `## Next steps` — numbered list of concrete actions with owner + ETA.

### Metric block format
```
<metric name="incident_count" value="7" unit="count" period="2026-W15">
Human-readable sentence describing the metric.
</metric>
```

## Process
1. Collect inputs: type of report, author, date, data/findings.
2. Read TEMPLATE.md to see a canonical example.
3. Draft the report following the structure above.
4. Run `python scripts/validate.py` with the draft — fix any errors it reports.
5. Return the validated report.

## Reference
- See `TEMPLATE.md` for a worked example.
- See `scripts/validate.py` for the validation rules (they are the source of truth).
```

### Diseño del `TEMPLATE.md`

El template es un reporte completo, real, que Claude usa como ejemplo. El modelo va a leerlo si su copy del shape duda:

```markdown
---
author: jane.doe
date: 2026-04-12
type: weekly
owner_team: platform
---

## TL;DR
Authentication service had two brief degradations this week. Root cause shared
with infra team. Traffic recovered fully by Thursday.

## Context
Platform team investigated two auth-service degradations on Mon and Wed.
Both coincided with deployment windows. Impact: ~3 minutes of elevated
5xx rates on /v1/login.

## Findings
- Deploys with DB migrations hold the readiness probe timing out for ~45s.
- Existing readiness config treats that window as failure and reroutes.
- No customer-visible data loss; logins retried successfully.

## Metrics
<metric name="error_rate_peak" value="2.1" unit="percent" period="2026-04-06">
Peak error rate during Monday degradation.
</metric>
<metric name="impacted_requests" value="412" unit="count" period="2026-W15">
Total 5xx responses attributable to the two windows.
</metric>

## Next steps
1. Extend readiness probe timeout from 30s to 120s (owner: platform, ETA: 2026-04-18).
2. Add a deploy-blocker if a DB migration is pending (owner: infra, ETA: 2026-04-25).
3. Post-incident review meeting (owner: jane.doe, ETA: 2026-04-15).
```

### Diseño del `validate.py`

El validador encodifica las reglas que el `SKILL.md` describe. Su output es el contrato: si el exit code es 0, el reporte está OK; si no, imprime los errores concretos y el modelo debe corregir.

```python
#!/usr/bin/env python3
"""Validate a markdown report against the company standard."""
import re
import sys

REQUIRED_FRONTMATTER = {"author", "date", "type", "owner_team"}
REQUIRED_SECTIONS = [
    "## TL;DR",
    "## Context",
    "## Findings",
    "## Metrics",
    "## Next steps",
]
VALID_TYPES = {"weekly", "post-mortem", "incident", "investigation"}


def main(path: str) -> int:
    with open(path, encoding="utf-8") as f:
        text = f.read()

    errors = []

    # 1. Frontmatter presence + required keys.
    fm_match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not fm_match:
        errors.append("Missing YAML frontmatter (must start with --- ... ---).")
    else:
        fm = fm_match.group(1)
        keys = {line.split(":", 1)[0].strip() for line in fm.strip().splitlines() if ":" in line}
        missing = REQUIRED_FRONTMATTER - keys
        if missing:
            errors.append(f"Missing frontmatter keys: {sorted(missing)}")
        # Validate `type` value.
        type_match = re.search(r"^type:\s*(\S+)", fm, re.MULTILINE)
        if type_match and type_match.group(1) not in VALID_TYPES:
            errors.append(f"Invalid type '{type_match.group(1)}'. Must be one of {VALID_TYPES}.")
        # Validate `date` format.
        date_match = re.search(r"^date:\s*(\S+)", fm, re.MULTILINE)
        if date_match and not re.match(r"\d{4}-\d{2}-\d{2}", date_match.group(1)):
            errors.append(f"Invalid date format '{date_match.group(1)}'. Must be YYYY-MM-DD.")

    # 2. Required sections in correct order.
    last_pos = 0
    for section in REQUIRED_SECTIONS:
        pos = text.find(section, last_pos)
        if pos == -1:
            errors.append(f"Missing or out-of-order section: '{section}'")
            break
        last_pos = pos

    # 3. Metric blocks well-formed.
    metrics = re.findall(r"<metric\s+([^>]+)>", text)
    for attrs_str in metrics:
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', attrs_str))
        for required in ("name", "value", "unit", "period"):
            if required not in attrs:
                errors.append(f"Metric block missing '{required}' attr: <metric {attrs_str}>")

    if errors:
        print("VALIDATION FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("OK: report passes all validation rules.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
```

### Subir y verificar end-to-end

Con los tres archivos escritos:

```bash
mkdir -p /tmp/skills-lab/markdown-report/scripts
# (pegar contenido de SKILL.md, TEMPLATE.md, scripts/validate.py en sus paths)

curl -sS -X POST "https://api.anthropic.com/v1/skills" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "display_title=markdown-report" \
  -F "files[]=@/tmp/skills-lab/markdown-report/SKILL.md;filename=markdown-report/SKILL.md" \
  -F "files[]=@/tmp/skills-lab/markdown-report/TEMPLATE.md;filename=markdown-report/TEMPLATE.md" \
  -F "files[]=@/tmp/skills-lab/markdown-report/scripts/validate.py;filename=markdown-report/scripts/validate.py"
```

Respuesta esperada (real del API): JSON con `id: "skill_01..."` y `latest_version: "<timestamp>"`.

Invocación:

```bash
curl -sS -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 2048,
    "container": {"skills":[{"type":"custom","skill_id":"<SKILL_ID>","version":"latest"}]},
    "tools": [{"type":"code_execution_20250825","name":"code_execution"}],
    "messages": [{
      "role": "user",
      "content": "Generame un weekly report. Soy jose.lopez del team de data. Semana 15 de 2026. Hallazgos: (1) El job de ingest tardó 2x lo normal por 3 días seguidos, (2) encontramos un leak de memoria en el worker de transforms, (3) resolvimos con un rollback al build anterior. Métricas: pipeline_duration_p95=12min (normal 6min), memory_leak_rate=400MB/hora."
    }]
  }'
```

## Ejecución real

El comportamiento esperado en el response (los tokens exactos varían por run, pero el shape y los pasos no):

1. Content block `server_tool_use` → `text_editor` lee `/skills/markdown-report/SKILL.md`.
2. Content block `bash_code_execution` → `cat /skills/markdown-report/TEMPLATE.md` para alinear al formato.
3. Drafting interno (no siempre visible como text block; puede ir directo al paso 4).
4. `bash_code_execution` → escribe el draft a `/tmp/report.md` y corre `python /skills/markdown-report/scripts/validate.py /tmp/report.md`.
5. Si la validación falla, Claude lo arregla y reitera (tool use loop).
6. Final content block `text` con el reporte validado.

Output final esperado (el usuario lo ve como el último `text` block):

```markdown
---
author: jose.lopez
date: 2026-04-13
type: weekly
owner_team: data
---

## TL;DR
Ingest pipeline degraded for three consecutive days due to a memory leak in
the transforms worker. Root cause identified; a rollback restored normal
operation. No data loss.

## Context
Data team noticed ingest pipeline runtime doubled starting Monday. Investigation
traced the regression to the latest transforms worker build, which leaked
~400 MB per hour. Rolled back to the previous build on Thursday evening;
runtime returned to baseline.

## Findings
- Pipeline p95 duration doubled from 6min to 12min for three days.
- Root cause: memory leak in the transforms worker at rate 400 MB/hour.
- Rollback to prior build restored baseline immediately.

## Metrics
<metric name="pipeline_duration_p95" value="12" unit="minutes" period="2026-W15">
95th-percentile pipeline duration during the degradation window.
</metric>
<metric name="memory_leak_rate" value="400" unit="MB/hour" period="2026-W15">
Observed memory leak rate in the transforms worker.
</metric>

## Next steps
1. Root cause the leak in the transforms worker (owner: jose.lopez, ETA: 2026-04-18).
2. Add memory-usage alert at 200 MB/hour per worker (owner: data, ETA: 2026-04-20).
3. Add a pre-merge check for memory growth in CI (owner: platform, ETA: 2026-04-25).
```

> **Nota:** el output de arriba es el shape esperado dado el prompt; el texto exacto varía por ejecución del modelo. Lo reproducible es la **estructura** (frontmatter + cinco secciones + metric blocks), garantizada por el validador del skill.

## Anti-patterns

- ❌ **Dejar las reglas solo en el prompt, no en el script**. Si las reglas viven solo en `SKILL.md`, el modelo puede saltarlas bajo presión. El validador Python es el **enforcement duro** — no es opcional.
- ❌ **Validar sin reportar qué falló**. Si tu script solo devuelve `"FAIL"`, Claude no sabe qué arreglar. El validador debe imprimir errores específicos: campo faltante, orden incorrecto, formato inválido.
- ❌ **TEMPLATE.md demasiado largo**. Si tu template pasa 200 líneas, el modelo gasta contexto leyéndolo y termina copiando partes literales en el output. Template corto, canónico, con uno de cada tipo.
- ❌ **Descripción genérica** ("generates markdown reports"). El dispatcher la va a activar en cualquier pedido vagamente textual. Sé explícito sobre disparadores (`weekly report`, `post-mortem`) y anti-disparadores (free-form prose).
- ❌ **Skill que no se puede probar determinísticamente**. Si tu lab no tiene un validador, no tenés gate: el reporte "se ve bien" pero va divergiendo. Script de validación = test automatizado de calidad de output.

## Recap

- Una skill bien diseñada tiene tres componentes: **instrucciones** (SKILL.md), **ejemplo canónico** (TEMPLATE.md), **validador** (script que enforcea las reglas).
- El validador en bash/python es la diferencia entre una skill "guidance" y una skill que realmente estandariza output.
- El workflow que el modelo ejecuta: leer SKILL.md → leer TEMPLATE.md → draft → correr validador → iterar si falla → return.
- Upload con estructura `markdown-report/SKILL.md`, `markdown-report/TEMPLATE.md`, `markdown-report/scripts/validate.py` — todos con el mismo top-level folder.
- El lab es extensible: podés agregar tipos (`post-mortem` con sus secciones extra), integrar con un CMS que parsee los `<metric>` blocks, o versionar las reglas cambiando el `validate.py`.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/skills-guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
**Ejercicio:** <!-- exercise:ex-08-04-lab-reportes -->
