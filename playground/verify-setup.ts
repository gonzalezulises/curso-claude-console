/**
 * verify-setup.ts
 *
 * Verifica que tu entorno local está listo para hacer el curso:
 *   1. La variable ANTHROPIC_API_KEY está definida y tiene formato válido.
 *   2. La key puede llamar al endpoint GET /v1/models (prueba de autenticación).
 *   3. Los 3 modelos estables del curso están disponibles.
 *
 * Correr con:   npm run verify
 * Equivalente:  npx tsx playground/verify-setup.ts
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const REQUIRED_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
] as const;

function printHeader(title: string): void {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function ok(message: string): void {
  console.log(`  ✓ ${message}`);
}

function fail(message: string): void {
  console.log(`  ✗ ${message}`);
}

async function main(): Promise<void> {
  printHeader('Verificación de setup — curso-claude-console');

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    fail('ANTHROPIC_API_KEY no está definida.');
    console.log(
      '\n  Solución:\n' +
        '    1. cp .env.example .env\n' +
        '    2. Edita .env y pega tu workspace API key\n' +
        "    3. La creas desde platform.claude.com → Workspace settings → API keys\n",
    );
    process.exit(1);
  }

  if (!apiKey.startsWith('sk-ant-api')) {
    fail(
      `La key no tiene formato de workspace key (debe empezar con "sk-ant-api..."). Recibida: ${apiKey.slice(0, 12)}...`,
    );
    console.log(
      '\n  Si pegaste un Admin API Key (sk-ant-admin01-...) por error,\n' +
        '  esa key NO funciona con /v1/messages ni el resto del curso.\n' +
        '  Revisa la lección 03-api-keys-workspace-vs-admin.md\n',
    );
    process.exit(1);
  }

  ok(`ANTHROPIC_API_KEY presente (${apiKey.slice(0, 12)}...)`);

  const client = new Anthropic({ apiKey });

  printHeader('Listando modelos disponibles para tu workspace');

  try {
    const models = await client.models.list({ limit: 50 });

    if (!models.data || models.data.length === 0) {
      fail('La respuesta de /v1/models llegó vacía.');
      process.exit(1);
    }

    const availableIds = new Set(models.data.map((m) => m.id));

    for (const model of models.data) {
      console.log(`  • ${model.id.padEnd(32)} ${model.display_name ?? ''}`);
    }

    printHeader('Verificando modelos que usa el curso');

    let missing = 0;
    for (const required of REQUIRED_MODELS) {
      if (availableIds.has(required)) {
        ok(`${required} disponible`);
      } else {
        fail(`${required} NO está disponible en tu workspace`);
        missing++;
      }
    }

    if (missing > 0) {
      console.log(
        `\n  ${missing} modelo(s) del curso no aparecen en tu workspace.\n` +
          '  Esto puede pasar si tu organización tiene acceso restringido por plan.\n' +
          '  Revisa platform.claude.com → Workspace settings → Model access.\n',
      );
      process.exit(1);
    }

    printHeader('Setup OK ✓');
    console.log('\n  Tu entorno está listo para el curso.');
    console.log('  Siguiente paso: npm run hello\n');
  } catch (error) {
    fail('Error al llamar /v1/models');
    if (error instanceof Anthropic.APIError) {
      console.log(`\n  Status HTTP: ${error.status}`);
      console.log(`  Mensaje:     ${error.message}`);
      if (error.status === 401) {
        console.log(
          '\n  401 = key inválida o revocada. Crea una nueva workspace key\n' +
            '  desde platform.claude.com → Workspace settings → API keys\n',
        );
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
