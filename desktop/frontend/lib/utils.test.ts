import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', undefined, null, false, '', 'bar')).toBe('foo bar');
  });

  it('supports conditional object and nested array syntax', () => {
    expect(cn(['foo', { bar: true, baz: false }])).toBe('foo bar');
  });

  it('lets the last conflicting tailwind class win', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('keeps non-conflicting classes intact', () => {
    expect(cn('p-2 text-sm', 'font-medium')).toBe('p-2 text-sm font-medium');
  });
});
