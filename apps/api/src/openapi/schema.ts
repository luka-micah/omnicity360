// Converts shared Zod contracts into OpenAPI-compatible JSON schemas.
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function apiSchema(schema: ZodTypeAny): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = jsonSchema;
  return rest;
}
