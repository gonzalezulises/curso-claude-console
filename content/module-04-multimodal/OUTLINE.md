# Módulo 4 — Capacidades Multimodales

**Duración estimada:** 4 horas · **Lecciones:** 7 · **Ejercicios:** ~5 · **Modelo default del módulo:** `claude-sonnet-4-6` (vision de producción)

## Objetivo del módulo

Al terminar sabrás hacer **vision** con imágenes (base64 y URL), procesar **PDFs** completos, gestionar archivos grandes con la **Files API** (`file_id`), y usar **citations nativas** para que Claude te devuelva referencias exactas al documento/imagen fuente (page_location, char_location, content_block_location).

## Prerrequisitos

- Módulos 1-3
- Entender arrays de `content` blocks del Módulo 1

## Arco narrativo

Ya sabés enviar texto. Este módulo abre la puerta a **todos los otros tipos de input que los modelos 4.x aceptan**: imágenes, PDFs, documentos estructurados. Y cierra con **citations nativas** — una feature distintiva de Claude frente a otros modelos: en vez de "confiar" que el resumen refleja el doc, el modelo te devuelve ubicaciones exactas que podés renderizar como citas verificables.

## Lecciones

1. **Vision básica: una imagen en el request** — bloque `{type: 'image', source: {type: 'base64', media_type, data}}`. Limites de tamaño, formatos soportados.
2. **Vision por URL vs base64** — cuándo conviene cada uno, cómo Anthropic fetchea la URL.
3. **Files API: subir una vez, referenciar N veces** — endpoint `/v1/files`, lifecycle, expiración, cómo referenciar por `file_id` en mensajes.
4. **PDFs: el bloque `{type: 'document'}`** — cómo mandar un PDF completo (binario o file_id), qué hace el modelo con páginas vs texto extraído.
5. **Citations nativas: `page_location`, `char_location`, `content_block_location`, `search_result_location`** — activar con `citations: {enabled: true}`, leer los bloques de respuesta con refs exactas.
6. **Multimodal compuesto: imagen + texto + PDF en una sola llamada** — patrones de composición y orden recomendado.
7. **Lab: pipeline de extracción con citas** — el alumno sube un PDF de research paper, le pregunta al modelo por claims específicas y obtiene respuesta con citas verificables.

## Ejercicios planeados

- `ex-04-01-imagen-base64.yaml` (code-typescript): describir una imagen local codificada en base64
- `ex-04-02-imagen-url.yaml` (code-typescript): mismo problema con URL pública, comparar
- `ex-04-03-files-upload.yaml` (code-typescript): subir un PDF a Files API, reutilizar el file_id en 3 mensajes
- `ex-04-04-citations.yaml` (code-typescript): extraer citas y renderizarlas como "página X, línea Y"
- `ex-04-05-lab-rag-simple.yaml` (code-typescript): el lab

## Lab del módulo

**Mini-RAG con PDFs y citas** — el alumno sube 3 papers vía Files API, pregunta al modelo una cuestión que requiere cruzar información, y obtiene respuesta con citas nativas que apuntan a páginas específicas de cada paper. Renderiza las citas como markdown con anchors verificables.

## Conceptos de arquitecto

- Citations nativas **reducen alucinación verificable** — no eliminan alucinación pero la convierten en falsificable
- Files API es **más eficiente** que embeber binarios grandes en cada request
- Vision tiene costo por imagen (tokens) que varía según tamaño — presupuestar antes
- Multimodal compone: una llamada puede llevar texto + imágenes + PDFs simultáneamente

## Material externo referenciado

- `platform.claude.com/docs/en/build-with-claude/vision`
- `platform.claude.com/docs/en/build-with-claude/pdf-support`
- `platform.claude.com/docs/en/api/files`
- `platform.claude.com/docs/en/build-with-claude/citations`

## Notas para la sesión de producción

- Incluir PDFs ejemplo en `shared/datasets/` (papers open-access de Semantic Scholar).
- El ejercicio de vision usa imágenes simples (screenshots de diagramas) — no caras/personas para evitar políticas de uso.
- Verificar los límites actuales de tamaño de imagen y PDF al escribir la lección.
