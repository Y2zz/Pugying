import { cn } from './utils';

describe('cn', () => {
  it('joins plain class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b');
  });

  it('resolves conflicting tailwind utilities to the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('px-2 py-1', 'p-3')).toBe('p-3');
  });

  it('supports object and array syntax from clsx', () => {
    expect(cn({ a: true, b: false }, ['c'])).toBe('a c');
  });
});
