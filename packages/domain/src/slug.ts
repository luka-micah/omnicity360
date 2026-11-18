/** URL-safe slug helpers for public hotel and room-category identifiers. */

/**
 * Convert a display name into a lowercase, hyphen-separated slug.
 * Non-ASCII characters are best-effort transliterated; names that reduce to no
 * usable characters fall back to `hotel`.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    // Combining marks left by NFKD transliteration.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');

  return slug || 'hotel';
}
