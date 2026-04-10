# Guía de migración a Academia Rizoma

El repo está diseñado desde el día 1 para ser portable a [Academia Rizoma](https://github.com/gonzalezulises/academia-rizoma) sin transformación compleja. Este documento explica cómo hacer el port cuando llegue el momento.

## Por qué es trivial

El formato de contenido del curso coincide 1:1 con el de Academia Rizoma:

| Elemento | curso-claude-console | academia-rizoma |
|---|---|---|
| Estructura de curso | `content/module-XX/` | `content/courses/<slug>/module-XX/` |
| Metadata global | `course.yaml` | `content/courses/<slug>/course.yaml` |
| Metadata de módulo | `module.yaml` | `module.yaml` |
| Lecciones | Markdown puro (`.md`) | Markdown puro (`.md`) |
| Embeds de ejercicios | `<!-- exercise:id -->` | `<!-- exercise:id -->` |
| Ejercicios | YAML (`code-python`, `code-sql`, `quiz`) | YAML (mismo formato) |
| Contrato de continuidad | `COURSE_STATE.yaml` | `COURSE_STATE.yaml` |
| Datasets | `shared/datasets/` | `content/shared/datasets/` |

Lo único que cambia son **las rutas** de los directorios (Rizoma los anida bajo `content/courses/<slug>/`), lo cual se resuelve con un `cp -r` y un ajuste de paths.

## Paso a paso del port

### 1. Clonar Rizoma si no está local

```bash
git clone https://github.com/gonzalezulises/academia-rizoma.git
cd academia-rizoma
```

### 2. Crear el slug del curso dentro de Rizoma

```bash
mkdir -p content/courses/claude-console
```

### 3. Copiar el contenido

```bash
# Desde el repo del curso
cd ~/Documents/GitHub/curso-claude-console

# Copiar cursos, manteniendo estructura
cp course.yaml ~/Documents/GitHub/academia-rizoma/content/courses/claude-console/
cp COURSE_STATE.yaml ~/Documents/GitHub/academia-rizoma/content/courses/claude-console/
cp -r content/module-00-setup ~/Documents/GitHub/academia-rizoma/content/courses/claude-console/
cp -r content/module-01-messages-api ~/Documents/GitHub/academia-rizoma/content/courses/claude-console/
# ... y así con todos los módulos

# Copiar datasets compartidos al espacio shared de Rizoma
cp -r shared/datasets/* ~/Documents/GitHub/academia-rizoma/content/shared/datasets/
cp -r shared/schemas/* ~/Documents/GitHub/academia-rizoma/content/shared/schemas/
```

### 4. Ajustar `course.yaml` para el schema exacto de Rizoma

Rizoma puede tener campos adicionales que el standalone no usa. Revisa el loader de cursos de Rizoma (`loaders.ts` o `db-loaders.ts`) y añade campos requeridos como:

- `thumbnail_url` (URL a imagen de portada)
- `category` (ej: "ai", "developer-tools")
- `is_published` / `is_locked`
- `estimated_duration_weeks`

Estos campos los decides al momento del port, no antes.

### 5. Ajustar paths de datasets en ejercicios

Si algún ejercicio referencia rutas como `shared/datasets/factura.pdf`, ajusta a la ruta que Rizoma use internamente (`/content/shared/datasets/factura.pdf` o similar). Un grep rápido:

```bash
grep -r "shared/datasets" content/courses/claude-console/
```

### 6. Validar con el validator de Rizoma

Rizoma tiene un validator (revisar si existe en `scripts/` o similar). Ejecutarlo para confirmar que la metadata es compatible:

```bash
# En Rizoma
npm run validate-course claude-console
```

### 7. Playground scripts → no se portan

Los archivos de `playground/`, `scripts/`, `package.json`, `tsconfig.json` del curso **no se portan a Rizoma**. Son infraestructura del repo standalone para que el alumno corra los ejemplos localmente. En Rizoma, los ejemplos viven dentro de los bloques `code-*` de los ejercicios YAML que se renderizan con los playgrounds interactivos de Rizoma (Pyodide, SQL.js, etc.).

### 8. CLAUDE.md y docs del curso → repo aparte

`CLAUDE.md`, `docs/architecture.md`, `docs/conventions.md` son instrucciones para quien produce el curso, no para el alumno. Quedan en el repo standalone, no van a Rizoma.

## Decisiones pendientes antes del port

- [ ] ¿Es un curso público o cerrado en Rizoma? Define `is_published` y pricing.
- [ ] ¿Cómo se autentica el alumno para correr ejercicios que llaman a la API de Claude? Rizoma probablemente necesite un mecanismo de BYO-key o un proxy.
- [ ] ¿Los ejercicios `code-typescript` son soportados por el runner de Rizoma? (Rizoma hoy soporta `code-python` con Pyodide y `code-sql` con SQL.js — para TypeScript puede requerir un runtime adicional).
- [ ] ¿Los datasets grandes (PDFs, imágenes de alta resolución) viven en el repo de Rizoma o en un CDN externo?

## Mantenimiento post-port

Si se decide que Rizoma es el home del curso, el repo standalone se puede convertir en un **mirror read-only** con un workflow que sincronice automáticamente. Alternativa: dejar el standalone como "development" y Rizoma como "producción pública", con merges manuales por módulo.

El approach recomendado: **un único source of truth**. Si Rizoma es el destino final, se mueve el contenido ahí y el repo standalone se archiva. Mantener dos copias sincronizadas manualmente es una fuente de errores.
