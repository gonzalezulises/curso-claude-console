/**
 * 01-hello-claude.ts
 *
 * Tu primer mensaje a Claude desde el SDK de TypeScript.
 * Equivalente al primer curl del Módulo 0, pero usando @anthropic-ai/sdk.
 *
 * Correr con:   npm run hello
 * Equivalente:  npx tsx playground/01-hello-claude.ts
 *
 * Qué esperar:
 *   1. Claude responde con un saludo corto
 *   2. Verás los tokens consumidos (input + output)
 *   3. Verás el stop_reason (end_turn cuando la respuesta termina naturalmente)
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY no está definida.');
    console.error('Ejecuta primero: cp .env.example .env y completa tu key.');
    process.exit(1);
  }

  const client = new Anthropic();

  console.log('Enviando mensaje a claude-haiku-4-5...\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content:
          'Preséntate en 2 frases: quién eres, qué modelo eres, y en qué puedes ayudar. Responde en español.',
      },
    ],
  });

  // La respuesta viene en message.content como array de bloques.
  // Para texto simple, el primer bloque es de tipo "text".
  const firstBlock = message.content[0];

  if (firstBlock && firstBlock.type === 'text') {
    console.log('Respuesta de Claude:');
    console.log('─'.repeat(60));
    console.log(firstBlock.text);
    console.log('─'.repeat(60));
  } else {
    console.log('Respuesta (forma inesperada):');
    console.log(JSON.stringify(message.content, null, 2));
  }

  console.log('\nMetadatos de la respuesta:');
  console.log(`  id:            ${message.id}`);
  console.log(`  model:         ${message.model}`);
  console.log(`  stop_reason:   ${message.stop_reason}`);
  console.log(`  input_tokens:  ${message.usage.input_tokens}`);
  console.log(`  output_tokens: ${message.usage.output_tokens}`);

  console.log(
    '\n💡 Siguiente paso: abre content/module-00-setup/lessons/01-bienvenida-al-curso.md',
  );
}

main().catch((error) => {
  if (error instanceof Anthropic.APIError) {
    console.error(`\nError de Anthropic API (${error.status}): ${error.message}`);
    if (error.status === 401) {
      console.error('  → Tu API key es inválida o fue revocada.');
    } else if (error.status === 429) {
      console.error('  → Rate limit excedido. Espera unos segundos y reintenta.');
    } else if (error.status === 529) {
      console.error('  → La API está sobrecargada. Reintenta en un momento.');
    }
    process.exit(1);
  }
  console.error('Error inesperado:', error);
  process.exit(1);
});
