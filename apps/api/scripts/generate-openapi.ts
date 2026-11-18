// Generates docs/openapi.json from the Fastify route schemas.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { format } from 'prettier';

import '../src/config/load-env.js';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

async function main(): Promise<void> {
  const app = await buildApp({ logger: false });
  await app.ready();

  const document = app.swagger();
  const outputPath = resolve(process.cwd(), '../../docs/openapi.json');
  const json = await format(JSON.stringify(document), { parser: 'json', printWidth: 100 });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');

  await app.close();
  await prisma.$disconnect();

  console.log(`OpenAPI document written to ${outputPath}`);
}

main().catch((error) => {
  console.error('Failed to generate OpenAPI document:', error);
  process.exit(1);
});
