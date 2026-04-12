# Probar tools desde el Workbench

## Objetivo

Al terminar sabrás **cómo definir tools custom en el panel Tools del Workbench**, entenderás las dos opciones del panel (Custom y Web search), y tendrás una preview del flujo `tool_use` → `tool_result` que vas a dominar completamente en el Módulo 5.

## Concepto

### El panel Tools del Workbench

En el Workbench, el panel derecho tiene un ícono de herramientas que abre el panel **Tools**. Tiene dos tabs:

<terminology>
**Custom**: donde definís tools propias con un JSON schema. Cuando definís un tool acá, el Workbench lo incluye en el request como parámetro `tools` y Claude puede invocarlo durante la generación.

**Web search**: toggle para habilitar la herramienta de búsqueda web de Anthropic. Claude puede buscar en la web para responder preguntas que requieren información actualizada.
</terminology>

El estado inicial muestra: "No tools defined. Tools let you equip Claude with a variety of tasks. Learn more."

### ¿Qué es un tool? (Preview del Módulo 5)

Un **tool** (herramienta) en la API de Claude es una función que el modelo puede **decidir invocar** cuando necesita información o capacidades que no tiene. El modelo no ejecuta el tool — genera un **request de invocación** (`tool_use`) con los argumentos, tu código ejecuta la función real, y le devolvés el resultado como `tool_result`.

```
User: "¿Cuál es el clima en Buenos Aires?"
  ↓
Claude: tool_use { name: "get_weather", input: { city: "Buenos Aires" } }
  ↓
Tu código: llama a una API de clima → { temp: 22, condition: "nublado" }
  ↓
tool_result: { temp: 22, condition: "nublado" }
  ↓
Claude: "El clima en Buenos Aires es 22°C y está nublado."
```

El Workbench te deja **definir el schema** del tool y **ver el flujo completo** sin escribir código. Claude genera el `tool_use`, el Workbench te deja escribir el `tool_result` manualmente, y Claude continúa.

### Definir un tool custom en el Workbench

En el panel Tools → Custom, definís un tool con:

1. **Name**: nombre del tool (ej: `get_weather`).
2. **Description**: qué hace el tool — es lo que Claude lee para decidir si lo invoca.
3. **Input schema**: JSON schema de los parámetros que el tool acepta.

Ejemplo de schema:

```json
{
  "name": "get_weather",
  "description": "Obtiene el clima actual de una ciudad.",
  "input_schema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "Nombre de la ciudad"
      }
    },
    "required": ["city"]
  }
}
```

Cuando corrés un prompt que requiere esa información, Claude genera un `tool_use` block. El Workbench te muestra el bloque y te deja mandar el resultado manualmente.

### Web search

El tab **Web search** permite que Claude busque en la web durante la generación. Es un tool nativo de Anthropic — no necesitás definir schema ni manejar resultados. Claude decide cuándo buscar basándose en la pregunta.

Útil para preguntas que requieren información actualizada que el modelo no tiene en su entrenamiento. Cuando lo usás desde la API, es una herramienta con `type: "web_search"` en el array `tools`.

### ¿Por qué probar tools en el Workbench?

El Workbench te deja **validar el schema del tool** sin escribir la implementación real:

1. ¿Claude entiende cuándo invocar tu tool? (la description es lo bastante clara)
2. ¿Claude manda los argumentos correctos? (el input_schema tiene las propiedades bien definidas)
3. ¿Claude usa bien el resultado? (el output se integra coherentemente en la respuesta)

Esas 3 preguntas las respondés en el Workbench en 2 minutos. Respondería en código en 20 minutos. Es el mismo principio del Módulo 2: **prototipá en el Workbench, implementá en código**.

### Tool use completo en el Módulo 5

Esta lección es una **preview**. El flujo completo de tool use — definición de schemas, manejo del loop `tool_use`/`tool_result`, tool_choice, parallel tool use, error handling — lo vas a aprender en el Módulo 5 con ejercicios de código completos. Acá solo importa que sepas que **el Workbench tiene la capacidad** y que podés usarla para prototipar.

## Ejecución real

**Paso 1 — Abrir el panel Tools**

1. En el Workbench, hacé click en el ícono de herramientas del panel derecho.
2. Verificá que ves las dos tabs: **Custom** y **Web search**.
3. El estado inicial dice "No tools defined".

**Paso 2 — Definir un tool custom**

1. En la tab **Custom**, agregá un tool con nombre `classify_urgency`, description `"Clasifica la urgencia de un ticket de soporte en: low, medium, high, critical"`, y un input schema:

```json
{
  "type": "object",
  "properties": {
    "ticket_text": {
      "type": "string",
      "description": "Texto del ticket de soporte"
    }
  },
  "required": ["ticket_text"]
}
```

2. Escribí un prompt que requiera clasificar un ticket: `"Analiza este ticket y clasificá su urgencia: El servidor de producción está caído desde hace 2 horas y no podemos procesar pagos."`.

3. Hacé click en **▶ Run** y observá si Claude genera un `tool_use` block invocando `classify_urgency`.

**Paso 3 — Probar Web search**

1. Cambiá a la tab **Web search** y activá la búsqueda web.
2. Escribí un prompt que requiera info actual: `"¿Cuál es la última versión de Node.js disponible hoy?"`.
3. Corré y observá si Claude busca en la web antes de responder.

## Anti-patterns

- ❌ **Definir tools en el Workbench y asumir que "ya funcionan" en código**. El Workbench valida el schema y el flujo, pero la implementación real (la función que ejecuta el tool) la escribís vos en el Módulo 5.
- ❌ **Descriptions vagas en los tools**. Claude decide si invoca el tool basándose en la description. `"Hace cosas con tickets"` es inútil. `"Clasifica la urgencia de un ticket de soporte en: low, medium, high, critical"` es claro.
- ❌ **Ignorar el panel Tools y aprender tool use solo desde código**. Prototipar el schema y la description en el Workbench es 10x más rápido que el ciclo editar-correr-leer en terminal.
- ❌ **Activar Web search para todo**. La búsqueda web agrega latencia y costo. Activala solo cuando el prompt requiere información que el modelo no tiene en su training data.

## Recap

- **El panel Tools del Workbench** tiene dos tabs: Custom (tools propios) y Web search (búsqueda nativa).
- **Custom tools** se definen con name, description e input_schema (JSON schema). Claude decide cuándo invocarlos.
- **El Workbench te deja prototipar el flujo `tool_use` → `tool_result`** sin escribir la implementación real.
- **Web search** es un tool nativo de Anthropic para información actualizada.
- **Todo esto es preview del Módulo 5** donde vas a implementar tool use completo en código.

---

**Fuente oficial:** [platform.claude.com/docs/en/build-with-claude/tool-use](https://platform.claude.com/docs/en/build-with-claude/tool-use)
