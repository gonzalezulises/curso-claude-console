# Anatomía de una Skill: `SKILL.md` + scripts + assets

## Objetivo

Al terminar esta lección vas a saber escribir un `SKILL.md` válido (frontmatter + cuerpo), organizar los archivos auxiliares para que Claude los descubra, y entender cómo el modelo navega el bundle desde dentro del container.

## Concepto

### Estructura mínima y estructura real

El mínimo viable de una skill es un solo archivo:

```
my-skill/
└── SKILL.md
```

Pero en la práctica, una skill útil suele parecerse más a un mini-onboarding en forma de repo:

```
financial-report/
├── SKILL.md              ← entry point, siempre en la raíz
├── FORMS.md              ← instrucciones extra referenciadas desde SKILL.md
├── REFERENCE.md          ← tabla de formatos, convenciones
├── templates/
│   └── model-template.xlsx
└── scripts/
    ├── validate.py       ← scripts ejecutables con bash
    └── recalc.py
```

Reglas de oro del layout:

1. **`SKILL.md` vive siempre en la raíz del bundle.** Si está en `nested/SKILL.md`, el upload falla con `"SKILL.md file must be exactly in the top-level folder"`.
2. **Todo el contenido vive bajo un único folder top-level.** En el upload, todos los `files[]` comparten un mismo prefix (`financial-report/...`).
3. **Máximo 30 MB por bundle.** Si estás cerca del límite, probablemente estés metiendo assets que deberían vivir fuera y fetchearse (en superficies donde haya red).

### Anatomía del `SKILL.md`

El archivo tiene dos partes: frontmatter YAML (metadata) y cuerpo markdown (instrucciones).

```markdown
---
name: financial-report
description: Use this skill when generating financial reports in Excel. Applies industry-standard color coding (blue inputs, black formulas, green cross-sheet links), number formatting conventions, and requires sourcing comments on every hardcoded value. Trigger when the user requests a financial model, projection, or valuation workbook.
---

# Financial Report Skill

## When to use this skill
Trigger this skill whenever the output is a financial Excel workbook.
Do NOT trigger for generic data analysis or for non-financial spreadsheets.

## Color coding (non-negotiable)
- Blue text (RGB 0,0,255): hardcoded inputs
- Black text (RGB 0,0,0): formulas and calculations
- Green text (RGB 0,128,0): cross-sheet links within same workbook
- Red text (RGB 255,0,0): external links to other files
- Yellow fill (RGB 255,255,0): cells requiring review

## Number formatting
- Currency: `$#,##0` with units in header (`"Revenue ($mm)"`)
- Percentages: `0.0%` default
- Negatives: parentheses `(123)`, not `-123`

## Sourcing requirement
Every hardcoded value MUST have a comment with:
`Source: [System], [Date], [Reference]`

## Validation
Before returning the workbook, run `python scripts/validate.py` to
check formula errors and color compliance. Fix any issues reported.
```

### El frontmatter en detalle

Dos campos, **ambos obligatorios**:

**`name`**:
- Máximo 64 caracteres
- Solo lowercase letters, números y guiones
- Sin tags XML
- Palabras reservadas prohibidas: `anthropic`, `claude`

**`description`**:
- No vacío
- Máximo 1024 caracteres
- Sin tags XML
- **Crítico: tiene que describir qué hace Y cuándo usarla.** El modelo usa esta línea para decidir si activar la skill. Una description vaga produce skills que no se disparan o se disparan fuera de contexto.

Descripciones pobres vs. buenas:

```yaml
# Pobre — solo dice qué hace
description: Skill for financial reports.

# Buena — qué hace + cuándo activar + cuándo NO
description: Use this skill when generating financial reports in Excel.
  Applies company-standard color coding and number formatting.
  Trigger for financial models, projections, or valuation workbooks.
  Do NOT trigger for generic data analysis or non-financial spreadsheets.
```

La buena description duplica el tamaño, pero el payoff es enorme: el modelo dispara la skill en el caso correcto y no la arrastra a cada pregunta sobre CSVs.

### El cuerpo de `SKILL.md`

No hay schema formal para el body — es markdown libre. Pero hay un shape que funciona consistentemente:

1. **When to use / When NOT to use** — reforzar la description con casos concretos.
2. **Instrucciones procedurales** — reglas, pasos, formato obligatorio.
3. **Referencias a otros archivos** — "For form filling, see FORMS.md". El modelo va a leerlos si hacen falta.
4. **Ejemplos** — un par de inputs y outputs esperados.
5. **Validación / checks** — scripts a correr antes de entregar el resultado.

Pensalo como onboarding para un teammate nuevo: le dejás un README que apunta a otros docs cuando profundiza.

### Scripts y assets: cómo los ve Claude

Los archivos auxiliares viven en el mismo folder (o subfolders) del bundle, y se acceden vía `bash` desde el container:

```python
# scripts/validate.py — Claude lo ejecuta con:
# python /skills/financial-report/scripts/validate.py output.xlsx

import sys
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1])
errors = []
for sheet in wb.sheetnames:
    ws = wb[sheet]
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and "#REF!" in str(cell.value):
                errors.append(f"{sheet}!{cell.coordinate}")

if errors:
    print("FAIL: formula errors found:", errors)
    sys.exit(1)
print("OK: no formula errors")
```

La magia: el código del script **nunca entra al contexto**. Claude lo ejecuta y solo ve el output (`"OK: no formula errors"` o `"FAIL: formula errors found: [...]"`). Así se construyen validadores pesados sin gastar tokens.

### El path real en el container

Cuando la skill se carga, Anthropic monta el bundle en:

```
/skills/<folder-name>/SKILL.md
/skills/<folder-name>/scripts/validate.py
/skills/<folder-name>/REFERENCE.md
```

El `<folder-name>` es el **top-level folder** con el que subiste el bundle (no el `id` del skill, no el `display_title`). Si subiste los files con `filename=financial-report/SKILL.md`, en el container están en `/skills/financial-report/`.

Para ver esto en acción, vas a observar al modelo hacer `bash: cat /skills/financial-report/SKILL.md` la primera vez que la skill se dispara — es parte del protocolo.

## Ejecución real

Vamos a escribir una skill trivial y ver su estructura antes de subirla. Creá el folder:

```bash
mkdir -p greeting-demo
```

Luego el `SKILL.md`:

```markdown
---
name: greeting-demo
description: Use this skill when the user asks to generate a friendly greeting in multiple languages. Returns greetings formatted as a markdown list.
---

# Greeting Demo

When asked for a greeting, respond with a markdown list of greetings in:
- Spanish
- English
- Portuguese
- French

Each item: `- **Lang**: greeting`
```

Verificá que el frontmatter parsea OK con una utilidad común:

```bash
python3 -c "
import yaml
with open('greeting-demo/SKILL.md') as f:
    content = f.read()
fm = content.split('---')[1]
meta = yaml.safe_load(fm)
print(meta)
"
```

Output real:

```
{'name': 'greeting-demo', 'description': 'Use this skill when the user asks to generate a friendly greeting in multiple languages. Returns greetings formatted as a markdown list.'}
```

Checklist antes de subir:

- [ ] `SKILL.md` está en la raíz del folder (no en un subfolder).
- [ ] Frontmatter tiene `name` (válido) y `description` (no vacío, <1024 chars).
- [ ] El cuerpo describe claramente cuándo activar la skill.
- [ ] Si hay scripts, están en `scripts/` y son ejecutables con los packages disponibles en el container.
- [ ] Bundle total <30 MB.

## Anti-patterns

- ❌ **`description` vaga tipo "Handles PDFs"**. El modelo no sabe cuándo activarla. Resultado: skill que se dispara siempre o nunca. Usá descriptions que enseñen criterios de activación.
- ❌ **Meter todas las instrucciones en el cuerpo y no referenciar archivos auxiliares**. Si tu skill pasa los 5k tokens de body, partila en `SKILL.md` (overview + cuándo) + `REFERENCE.md` (detalles). Así Level 2 se mantiene chico.
- ❌ **Scripts con dependencias no disponibles en el container**. Superficie API = solo packages pre-instalados (pandas, openpyxl, pdfplumber, requests sin red, etc.). `pip install` durante ejecución no funciona.
- ❌ **Hardcodear paths absolutos en scripts**. Usá `os.path.dirname(__file__)` para resolver el path relativo al script. Si hardcodeás `/skills/mi-skill/...`, tu skill queda acoplada a un folder name específico y rompe si se re-sube con otro.
- ❌ **Usar nombres que matchean palabras reservadas**. `claude-helper` falla el upload (contiene "claude"). `anthropic-tools` falla. Elegí nombres de dominio.
- ❌ **Mezclar dos skills en un bundle**. Si `SKILL.md` tiene dos workflows no relacionados, partilo en dos skills. El dispatcher del modelo funciona mejor con skills focalizadas.

## Recap

- Una skill es un folder con `SKILL.md` en la raíz + archivos opcionales bajo ese folder.
- El `SKILL.md` tiene **frontmatter YAML** (`name` + `description`, ambos obligatorios) y un **cuerpo markdown** con las instrucciones procedurales.
- El `description` es lo más importante del frontmatter: define **cuándo** el modelo activa la skill. Vaguedad = skill inútil.
- Los scripts auxiliares se ejecutan con bash desde el container; su código no entra al contexto, solo su output.
- En runtime, el bundle se monta en `/skills/<folder-name>/` dentro del container.
- Bundle max 30 MB; `SKILL.md` obligatoriamente en la raíz.

---

**Fuente oficial:** [platform.claude.com/docs/en/agents-and-tools/agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
**Ejercicio:** <!-- exercise:ex-08-02-skill-md -->
