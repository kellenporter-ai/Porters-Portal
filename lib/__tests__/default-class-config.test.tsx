// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';

import { CLASS_CONFIGS, DEFAULT_CLASS_CONFIG } from '../../constants';
import { UNCATEGORIZED } from '../../types';

describe('DEFAULT_CLASS_CONFIG fallback', () => {
  it('exists and has the expected shape (icon, color, borderColor)', () => {
    expect(DEFAULT_CLASS_CONFIG).toBeDefined();
    expect(DEFAULT_CLASS_CONFIG.icon).toBeDefined();
    expect(typeof DEFAULT_CLASS_CONFIG.color).toBe('string');
    expect(typeof DEFAULT_CLASS_CONFIG.borderColor).toBe('string');
  });

  it('is returned for unknown class names via the ?? fallback pattern', () => {
    const config = CLASS_CONFIGS['Unknown Class'] ?? DEFAULT_CLASS_CONFIG;
    expect(config).toEqual(DEFAULT_CLASS_CONFIG);
  });

  it('is NOT used for known class names', () => {
    const config = CLASS_CONFIGS['AP Physics'] ?? DEFAULT_CLASS_CONFIG;
    expect(config).not.toEqual(DEFAULT_CLASS_CONFIG);
    expect(config.color).toBe('bg-blue-600');
  });

  it('is NOT used for the Uncategorized entry', () => {
    expect(CLASS_CONFIGS[UNCATEGORIZED]).toBeDefined();
    expect(CLASS_CONFIGS[UNCATEGORIZED]).not.toBe(DEFAULT_CLASS_CONFIG);
  });
});
