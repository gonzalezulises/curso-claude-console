# Vision por URL vs base64

## Objetivo

Al terminar esta lección sabrás **cuándo usar `source.type: "url"` vs `"base64"`**, cómo Anthropic fetchea la imagen desde el servidor, qué restricciones tiene cada método, y cómo elegir entre ambos según tu caso de uso.

## Concepto

### El bloque image con URL

En la lección anterior usaste base64 — la imagen viaja embebida en el JSON. Con URL, le pasás un link y los servidores de Anthropic descargan la imagen:

```json
{
  "type": "image",
  "source": {
    "type": "url",
    "url": "https://example.com/diagram.png"
  }
}
```

No necesitás `media_type` ni `data` — Anthropic lo infiere del contenido descargado.

### Cómo funciona el fetch

Cuando usás `source.type: "url"`:

1. **Tu código** envía el request a la API con la URL de la imagen.
2. **Los servidores de Anthropic** descargan la imagen desde esa URL.
3. **El modelo** procesa la imagen descargada.

<warning>

Esto significa que la URL debe ser **accesible públicamente** desde los servidores de Anthropic. URLs detrás de firewalls, VPNs, autenticación, o localhost **no funcionan**. Si tu imagen es privada, usá base64.

</warning>

### Cuándo usar cada método

| Criterio | base64 | URL |
|---|---|---|
| Imagen en disco local | ✅ Leés y codificás | ❌ No accesible |
| Imagen pública en la web | ⚠️ Funciona pero redundante | ✅ Ideal |
| Imagen detrás de auth | ✅ La descargás vos | ❌ Anthropic no tiene acceso |
| Tamaño del request JSON | 🔴 Grande (base64 ≈ 133% del binario) | 🟢 Solo la URL |
| Latencia | 🟢 Imagen ya está en el request | 🔴 Anthropic debe descargarla |
| Reproducibilidad | 🟢 Idéntica cada vez | ⚠️ La URL puede cambiar |

<terminology>

**Regla práctica**: si la imagen es un archivo local o privado, base64. Si es una URL pública estable, URL. En caso de duda, base64 — siempre funciona.

</terminology>

### Diferencia de tokens

La imagen en sí consume los mismos tokens con ambos métodos (depende del tamaño en píxeles). La diferencia está en el payload del request:

- **base64**: el JSON del request es grande (la imagen completa viaja en el body).
- **URL**: el JSON es pequeño (solo viaja la URL de ~100 caracteres).

Pero el costo de tokens para el modelo es el mismo — lo que cambia es el ancho de banda de tu request HTTP.

### Cuándo URL falla en silencio (y cómo diagnosticarlo)

Los errores más comunes con `source.type: "url"` y cómo se manifiestan:

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Error 400 `unable to fetch image` | La URL requiere auth/cookies/JS | Bajar la imagen vos y mandar base64 |
| Error 400 `invalid image content` | El servidor respondió HTML (login page, 404 "friendly") | Chequear con `curl -I` qué responde realmente |
| Respuesta inconsistente entre corridas | La URL apunta a un CDN que rota imágenes | Pineá la URL a una revisión específica (ej: con hash) o bajá a base64 |
| Latencia alta/timeouts | El servidor de la URL es lento desde la región de Anthropic | base64 (ya tenés la imagen localmente) |
| Funciona para uno del equipo y no para otro | IP-based allowlist o VPN restrictions | base64 |

**Regla de oro de debugging**: cuando URL falla y no entendés por qué, **siempre** probá el mismo test case con base64. Si funciona con base64 y no con URL, el problema está en la accesibilidad pública, no en el prompt.

### Conceptos de arquitecto

- **URL es un pointer, base64 es el contenido**: los pointers pueden romperse (dominios que expiran, paths que cambian, políticas de CDN que cambian). Si tu request tiene valor auditable (análisis de contrato, diagnóstico médico), base64 garantiza que el byte-for-byte de la imagen queda en tu log — el pointer no.
- **Payload grande ≠ request lento**: enviar 2 MB de base64 no es per se lento. Lo lento es serializar el body + cruzar la red. Para una imagen de 200 KB la diferencia entre URL y base64 es imperceptible; para 20 MB sí importa.
- **Un CDN propio resuelve ambos mundos**: subí las imágenes a tu CDN (S3+CloudFront, R2, etc.) con URLs estables y públicas. Tenés el beneficio de URL (payload chico) y controlás la estabilidad del pointer.

## Ejecución real

**Paso 1 — Vision con URL pública**

Usamos una imagen de Wikimedia Commons (dominio público):

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 150,
    "messages": [{
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "url",
            "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png"
          }
        },
        {
          "type": "text",
          "text": "Describe this image in one sentence."
        }
      ]
    }]
  }'
```

Respuesta:
```json
{
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {
      "type": "text",
      "text": "The image shows three translucent colored dice—blue, green, and red—arranged in a triangular formation, each displaying white dots on their visible faces."
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 99,
    "output_tokens": 36
  }
}
```

Observá: **99 input tokens** — la imagen de 280px tiene más contenido visual que nuestro PNG de 2×2 de la lección anterior (32 tokens).

**Paso 2 — Lo mismo en TypeScript**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 150,
  messages: [{
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "url",
          url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
        },
      },
      {
        type: "text",
        text: "Describe this image in one sentence.",
      },
    ],
  }],
});

const text = resp.content[0].type === "text" ? resp.content[0].text : "";
console.log("Respuesta:", text);
console.log(`Tokens: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
```

**Paso 3 — Comparar con base64 de la misma imagen**

Si descargás la misma imagen y la enviás en base64:

```typescript
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Descargar la imagen
execSync("curl -sL -o /tmp/dice.png 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'");

const imageBase64 = readFileSync("/tmp/dice.png").toString("base64");

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
        text: "Describe this image in one sentence.",
      },
    ],
  }],
});

console.log(`Tokens: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
// Los input_tokens serán los mismos (~99) — misma imagen, mismos tokens
```


## Curl en vivo

Este es el mismo request que se muestra arriba. Presioná **Ejecutar** para revelar la respuesta real que capturé contra la API al escribir esta lección.

<LiveCurl id="m04-vision-url" />

## Anti-patterns

- ❌ **Usar URL para imágenes privadas o efímeras**. URLs detrás de auth, CDN con tokens temporales, o URLs de signed uploads van a fallar cuando Anthropic intente descargarlas.
- ❌ **Asumir que la URL es estable**. Si linkás a una imagen que puede cambiar (ej: avatar de usuario, screenshot temporal), tu prompt no es reproducible. Preferí base64 para reproducibilidad garantizada.
- ❌ **Descargar la imagen para re-subirla en base64 cuando la URL pública funciona**. Es redundante — usá URL directamente y ahorrás ancho de banda en tu request.
- ❌ **Enviar URLs de `localhost` o `192.168.*`**. Los servidores de Anthropic no pueden acceder a tu red local.
- ❌ **Confiar en que una imagen en redes sociales va a estar ahí mañana**. URLs de Twitter/X, Instagram, Slack (auth-gated), Discord o signed URLs de S3 suelen fallar o variar entre requests. Si la necesitás estable, bajala y subila a tu propio CDN.
- ❌ **Pasar URLs con espacios o caracteres especiales sin encodear**. El request falla con 400 y el mensaje no siempre es claro. Usá `encodeURIComponent` (TS) o `urllib.parse.quote` (Python) sobre el path.

## Recap

- `source.type: "url"` permite referenciar imágenes públicas sin embeber el binario en el JSON.
- Anthropic fetchea la imagen — la URL debe ser accesible públicamente.
- Los tokens del modelo son iguales para ambos métodos (depende del tamaño de la imagen, no del método de envío).
- **Regla**: imagen local o privada → base64. Imagen pública estable → URL.
- El payload JSON con URL es mucho más chico que con base64, pero la latencia puede ser mayor (Anthropic descarga la imagen).

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/vision](https://platform.claude.com/docs/en/build-with-claude/vision)
**Ejercicio:** <!-- exercise:ex-04-02-imagen-url -->
