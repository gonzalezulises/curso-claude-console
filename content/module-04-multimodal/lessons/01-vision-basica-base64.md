# Vision básica: una imagen en el request

## Objetivo

Al terminar esta lección sabrás **cómo enviar una imagen a Claude usando base64**, qué formatos son soportados, cómo se estructura el bloque `type: "image"` en el array de `content`, y cuántos tokens consume una imagen según su tamaño.

## Concepto

### El bloque image

En el Módulo 1 aprendiste que `content` puede ser un string o un array de bloques. Hasta ahora usaste bloques `type: "text"`. Para enviar una imagen, usás un bloque `type: "image"`:

```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/png",
    "data": "iVBORw0KGgoAAAANSUhEUgAAAAIA..."
  }
}
```

<terminology>
**source.type**: define cómo le pasás la imagen al modelo. `"base64"` significa que la imagen viaja embebida en el JSON como string base64. También existe `"url"` (que vemos en la lección siguiente).

**source.media_type**: el MIME type de la imagen. Valores soportados:
- `"image/jpeg"` — fotos, screenshots
- `"image/png"` — diagramas, screenshots con transparencia
- `"image/gif"` — imágenes animadas (se procesa el primer frame)
- `"image/webp"` — formato moderno comprimido

**source.data**: el contenido de la imagen codificado en base64 (sin el prefijo `data:image/png;base64,`).
</terminology>

### Cómo se cuentan los tokens de una imagen

Las imágenes se convierten internamente a tokens. El costo depende del tamaño en píxeles:

| Tamaño aproximado | Tokens estimados |
|---|---|
| Ícono (32×32) | ~30 |
| Thumbnail (200×200) | ~200 |
| Screenshot (1280×720) | ~1,500 |
| Full HD (1920×1080) | ~2,500 |
| Imagen grande (4000×3000) | ~5,000+ |

Las imágenes muy grandes se redimensionan automáticamente antes del procesamiento. No hace falta que las redimensiones vos — el modelo lo hace internamente. Pero si sabés que tu imagen es un ícono de 64px, no le mandes un PNG de 4000px de ancho.

### El patrón: imagen + pregunta

El caso de uso más común es enviar una imagen seguida de una pregunta en texto:

```json
"content": [
  { "type": "image", "source": { ... } },
  { "type": "text", "text": "¿Qué ves en esta imagen?" }
]
```

El orden importa: **la imagen va primero, la pregunta después**. Claude procesa los bloques en orden y necesita "ver" la imagen antes de responder sobre ella.

## Ejecución real

**Paso 1 — Crear una imagen de prueba y codificarla en base64**

```bash
# Crear un PNG mínimo de 2x2 píxeles con colores (rojo, verde, azul, blanco)
python3 -c "
import base64, struct, zlib
def create_png():
    w, h = 2, 2
    raw  = b'\x00\xff\x00\x00\x00\xff\x00'   # row 0: red, green
    raw += b'\x00\x00\x00\xff\xff\xff\xff'     # row 1: blue, white
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
png = create_png()
print(base64.b64encode(png).decode())
"
```

Resultado:
```
iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC
```

**Paso 2 — Enviar la imagen a Claude con curl**

```bash
IMG_B64="iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC"

curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "{
    \"model\": \"claude-haiku-4-5\",
    \"max_tokens\": 150,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": [
        {
          \"type\": \"image\",
          \"source\": {
            \"type\": \"base64\",
            \"media_type\": \"image/png\",
            \"data\": \"$IMG_B64\"
          }
        },
        {
          \"type\": \"text\",
          \"text\": \"Describí esta imagen en una oración. Sé específico con los colores.\"
        }
      ]
    }]
  }"
```

Respuesta:
```json
{
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {
      "type": "text",
      "text": "La imagen muestra un pequeño punto o círculo de color rojo intenso sobre un fondo blanco."
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 32,
    "output_tokens": 35
  }
}
```

Observá: **32 input tokens** para un PNG de 2×2 píxeles. El overhead mínimo de una imagen es bajo, pero escala con el tamaño.

**Paso 3 — Lo mismo en TypeScript**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic();

// Leer imagen y convertir a base64
const imageBuffer = readFileSync("/tmp/test-colors.png");
const imageBase64 = imageBuffer.toString("base64");

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 150,
  messages: [{
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageBase64,
        },
      },
      {
        type: "text",
        text: "Describí esta imagen en una oración. Sé específico con los colores.",
      },
    ],
  }],
});

const text = resp.content[0].type === "text" ? resp.content[0].text : "";
console.log("Respuesta:", text);
console.log(`Tokens: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
```

## Anti-patterns

- ❌ **Enviar imágenes gigantes sin necesidad**. Si vas a preguntar "¿hay texto en esta imagen?", un thumbnail de 800px basta — no mandes el original de 8000px. Más píxeles = más tokens = más costo y latencia.
- ❌ **Incluir el prefijo `data:image/png;base64,` en el campo `data`**. El campo `data` solo lleva la cadena base64 pura. El `media_type` va en su propio campo.
- ❌ **Poner la pregunta antes de la imagen**. Claude procesa en orden — la imagen debe ir primero para que el modelo la "vea" al llegar a la pregunta.
- ❌ **Usar vision para OCR masivo**. Claude es bueno extrayendo texto de imágenes, pero para OCR a escala (miles de documentos) usá herramientas especializadas y reservá Claude para comprensión semántica.

## Recap

- El bloque `type: "image"` con `source.type: "base64"` permite enviar imágenes embebidas en el JSON.
- Formatos soportados: JPEG, PNG, GIF, WebP.
- Los tokens de imagen escalan con el tamaño en píxeles — optimizá el tamaño antes de enviar.
- **Patrón fundamental**: imagen primero, pregunta en texto después.
- Una imagen de 2×2px consume ~32 tokens; un screenshot HD ~1,500-2,500 tokens.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/vision](https://platform.claude.com/docs/en/build-with-claude/vision)
**Ejercicio:** <!-- exercise:ex-04-01-imagen-base64 -->
