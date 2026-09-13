import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn()', () => {
  it('joins multiple class strings', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('filters falsy values (false, null, undefined, empty string)', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('returns empty string when all inputs are falsy', () => {
    expect(cn(false, null, undefined, '')).toBe('');
  });

  it('returns empty string with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('collapses whitespace runs and trims edges', () => {
    expect(cn('  a   b  ', ' c ')).toBe('a b c');
  });

  it('supports conditional-class ternary idiom', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });
});
