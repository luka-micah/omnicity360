// Hotel slug allocation. Public slugs are globally unique; explicit slugs must
// not collide, while generated slugs get a deterministic or random suffix.
import { randomBytes } from 'node:crypto';

import { slugify } from '@hotel-marketplace/domain';

import { prisma } from '../db/prisma.js';
import { ConflictError } from '../errors/index.js';

const SLUG_COLUMN_LENGTH = 100;
const MAX_DETERMINISTIC_ATTEMPTS = 25;

/** Prisma unique-constraint race, e.g. two hotels created with the same slug. */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** Append a suffix while keeping the result within the 100-character column. */
function withSuffix(base: string, suffix: string): string {
  const trimmed = base.slice(0, SLUG_COLUMN_LENGTH - suffix.length).replace(/-+$/, '');
  return `${trimmed}${suffix}`;
}

async function slugExists(slug: string): Promise<boolean> {
  const existing = await prisma.hotel.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Resolve the slug for a new hotel.
 * - An explicit slug that is already taken raises 409 SLUG_ALREADY_EXISTS.
 * - A generated slug from the name gets `-2`, `-3`, ... until it is free.
 */
export async function resolveHotelSlug(input: { slug?: string; name: string }): Promise<string> {
  const explicit = input.slug !== undefined;
  const base = explicit ? input.slug! : slugify(input.name);

  for (let attempt = 0; attempt < MAX_DETERMINISTIC_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : withSuffix(base, `-${attempt + 1}`);
    if (!(await slugExists(candidate))) return candidate;
    if (explicit) {
      throw new ConflictError('SLUG_ALREADY_EXISTS', 'That slug is already taken');
    }
  }

  throw new ConflictError(
    'SLUG_ALREADY_EXISTS',
    'Could not allocate a unique slug; provide an explicit slug instead'
  );
}

/** Fallback used when a generated slug loses a creation race. */
export async function randomSlugCandidate(base: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = withSuffix(base, `-${randomBytes(3).toString('hex')}`);
    if (!(await slugExists(candidate))) return candidate;
  }
  throw new ConflictError('SLUG_ALREADY_EXISTS', 'Could not allocate a unique slug');
}
