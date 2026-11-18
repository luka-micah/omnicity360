import { describe, expect, it } from 'vitest';

import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a name', () => {
    expect(slugify('Lekki Palm Hotel')).toBe('lekki-palm-hotel');
  });

  it('replaces punctuation with separators and collapses runs', () => {
    expect(slugify("O'Hare!!! Suites  &  Spa")).toBe('o-hare-suites-spa');
  });

  it('transliterates accented characters and strips combining marks', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume');
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('hotel');
    expect(slugify('   ')).toBe('hotel');
  });

  it('caps the slug at 100 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(98)} b c`);
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith('-')).toBe(false);
  });
});
